import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const extractZip = (addr) => {
  if (!addr) return "";
  const zipMatch = addr.match(/\b\d{5}(-\d{4})?\b/);
  return zipMatch ? zipMatch[0] : "";
};

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
    
    let body;
    try { body = await req.json(); } catch(e) { throw new Error("Invalid JSON body"); }
    
    const { 
      order_id, quickbooks_customer_id, product_type, specifications, 
      pricing, quantity, shipping_charge, is_tax_exempt, ship_to_address 
    } = body;

    const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
    const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
    const refreshToken = Deno.env.get('QUICKBOOKS_REFRESH_TOKEN');
    const realmId = Deno.env.get('QUICKBOOKS_REALM_ID');

    // 1. Authenticate
    const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`)
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error("QuickBooks Auth Failed");
    const accessToken = tokenData.access_token;
    
    const baseUrl = `https://quickbooks.api.intuit.com/v3/company/${realmId}`;
    const apiHeaders = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    // 2. PARALLEL EXECUTION (Prevents 502 Timeout)
    // We fetch Item List, Customer Data, and DocNumber simultaneously.
    const itemQuery = encodeURIComponent("SELECT * FROM Item WHERE Active = true");
    const docQuery = encodeURIComponent("SELECT DocNumber FROM Invoice ORDERBY MetaData.CreateTime DESC MAXRESULTS 1");

    const [itemRes, customerRes, lastInvoiceRes] = await Promise.all([
      fetch(`${baseUrl}/query?query=${itemQuery}&minorversion=65`, { headers: apiHeaders }),
      fetch(`${baseUrl}/customer/${quickbooks_customer_id}?minorversion=65`, { headers: apiHeaders }),
      fetch(`${baseUrl}/query?query=${docQuery}&minorversion=65`, { headers: apiHeaders })
    ]);

    const [itemData, customerResult, lastInvoiceData] = await Promise.all([
      itemRes.json(), customerRes.json(), lastInvoiceRes.json()
    ]);

    // Process Results
    const allItems = itemData?.QueryResponse?.Item || [];
    const printingItem = allItems.find(i => i.Name.toLowerCase() === "printing");
    const shippingItem = allItems.find(i => i.Name.toLowerCase() === "shipping");

    if (!printingItem) throw new Error("Item 'Printing' not found in QuickBooks.");
    
    const email = customerResult.Customer?.PrimaryEmailAddr?.Address || "placeholder@example.com";

    let currentDocNumber = 1919; 
    if (lastInvoiceData.QueryResponse?.Invoice?.[0]) {
      const lastVal = lastInvoiceData.QueryResponse.Invoice[0].DocNumber;
      const parsed = parseInt(lastVal.replace(/\D/g, ''));
      if (!isNaN(parsed) && (parsed + 1) > currentDocNumber) {
        currentDocNumber = parsed + 1;
      }
    }

    // 3. Address & Tax Logic
    const upperAddr = (ship_to_address || "").toUpperCase();
    let taxState = "NJ"; 
    if (upperAddr.includes(" FL ") || upperAddr.endsWith(" FL") || upperAddr.includes(", FL")) {
      taxState = "FL";
    }
    const zipCode = extractZip(ship_to_address);

    // 4. Build Lines
    const lines = [
      {
        Amount: pricing,
        DetailType: "SalesItemLineDetail",
        Description: `${product_type}\n${specifications}`,
        SalesItemLineDetail: { 
          ItemRef: { value: printingItem.Id },
          Qty: quantity || 1, 
          UnitPrice: pricing / (quantity || 1),
          TaxCodeRef: { value: is_tax_exempt ? "NON" : "TAX" }
        }
      }
    ];

    if (shipping_charge && shipping_charge > 0 && shippingItem) {
      lines.push({
        Amount: shipping_charge,
        DetailType: "SalesItemLineDetail",
        Description: "Shipping",
        SalesItemLineDetail: {
          ItemRef: { value: shippingItem.Id },
          Qty: 1,
          UnitPrice: shipping_charge,
          TaxCodeRef: { value: "NON" } 
        }
      });
    }

    // 5. Create the Invoice
    const createRes = await fetch(`${baseUrl}/invoice?minorversion=65`, {
      method: 'POST', 
      headers: apiHeaders, 
      body: JSON.stringify({
        DocNumber: currentDocNumber.toString(),
        CustomerRef: { value: quickbooks_customer_id.toString() },
        BillEmail: { Address: email },
        Line: lines,
        SalesTermRef: { value: "1" },
        TxnTaxDetail: {}, 
        ShipAddr: {
          Line1: ship_to_address,
          CountrySubDivisionCode: taxState,
          PostalCode: zipCode,
          Country: "US"
        },
        PrivateNote: `Order: ${order_id}`
      })
    });

    const createData = await createRes.json();
    if (!createRes.ok) throw new Error(`QB Error: ${createData.Fault?.Error?.[0]?.Detail || "Invoice creation failed"}`);

    const newInvoiceId = createData.Invoice.Id;

    // 6. WAIT AND FETCH PUBLIC LINK
    // We prioritize the Public Link (connect.intuit.com) for customers.
    let finalLink = createData.Invoice.InvoiceLink;

    if (!finalLink) {
      await wait(2000); // 2-second delay as requested
      const readRes = await fetch(`${baseUrl}/invoice/${newInvoiceId}?minorversion=65&include=invoiceLink`, { headers: apiHeaders });
      const readData = await readRes.json();
      finalLink = readData.Invoice?.InvoiceLink;
    }

    // 7. BACKGROUND UPDATE (Don't 'await' to speed up the HTTP response)
    const base44 = createClientFromRequest(req);
    if (base44) {
      base44.asServiceRole.entities.Order.update(order_id, { 
        quickbooks_invoice_id: newInvoiceId 
      }).catch(err => console.error("Base44 Update Failed:", err));
    }

    // 8. FINAL RESPONSE
    return Response.json({ 
      success: true, 
      invoice_id: newInvoiceId,
      invoice_link: finalLink || "Link generating... please refresh."
    });

  } catch (error) {
    console.error("Critical Function Error:", error.message);
    return Response.json({ success: false, error: error.message }, { status: 200 });
  }
});