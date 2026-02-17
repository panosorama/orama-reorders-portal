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
    try { body = await req.json(); } catch(e) { throw new Error("Invalid JSON"); }
    
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
    if (!tokenResponse.ok) throw new Error("Auth Failed");
    const accessToken = tokenData.access_token;
    
    const baseUrl = `https://quickbooks.api.intuit.com/v3/company/${realmId}`;
    const apiHeaders = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    // 2. PARALLEL LOOKUPS (Saves ~3-4 seconds of total execution time)
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

    const allItems = itemData?.QueryResponse?.Item || [];
    const findItem = (name) => allItems.find(i => i.Name.toLowerCase() === name.toLowerCase());
    const printingItem = findItem("Printing");
    const shippingItem = findItem("Shipping");

    if (!printingItem) throw new Error("Printing item not found");
    
    const email = customerResult.Customer?.PrimaryEmailAddr?.Address || "placeholder@example.com";

    let currentDocNumber = 1919; 
    if (lastInvoiceData.QueryResponse?.Invoice?.[0]) {
      const lastVal = lastInvoiceData.QueryResponse.Invoice[0].DocNumber;
      const parsed = parseInt(lastVal.replace(/\D/g, ''));
      if (!isNaN(parsed) && (parsed + 1) > currentDocNumber) currentDocNumber = parsed + 1;
    }

    // 3. Tax & Address Logic
    let taxState = "NJ"; 
    const upperAddr = (ship_to_address || "").toUpperCase();
    if (upperAddr.includes(" FL ") || upperAddr.endsWith(" FL") || upperAddr.includes(", FL")) taxState = "FL";
    const zipCode = extractZip(ship_to_address);

    // 4. Create Invoice
    const lines = [{
      Amount: pricing,
      DetailType: "SalesItemLineDetail",
      Description: `${product_type}\n${specifications}`,
      SalesItemLineDetail: { 
        ItemRef: { value: printingItem.Id },
        Qty: quantity || 1, 
        UnitPrice: pricing / (quantity || 1),
        TaxCodeRef: { value: is_tax_exempt ? "NON" : "TAX" }
      }
    }];

    if (shipping_charge > 0 && shippingItem) {
      lines.push({
        Amount: shipping_charge,
        DetailType: "SalesItemLineDetail",
        Description: "Shipping",
        SalesItemLineDetail: {
          ItemRef: { value: shippingItem.Id },
          Qty: 1, UnitPrice: shipping_charge,
          TaxCodeRef: { value: "NON" } 
        }
      });
    }

    const createRes = await fetch(`${baseUrl}/invoice?minorversion=65`, {
      method: 'POST', 
      headers: apiHeaders, 
      body: JSON.stringify({
        DocNumber: currentDocNumber.toString(),
        CustomerRef: { value: quickbooks_customer_id.toString() },
        BillEmail: { Address: email },
        Line: lines,
        TxnTaxDetail: {}, 
        ShipAddr: { Line1: ship_to_address, CountrySubDivisionCode: taxState, PostalCode: zipCode, Country: "US" },
        PrivateNote: `Order: ${order_id}`
      })
    });

    const createData = await createRes.json();
    if (!createRes.ok) throw new Error(`QB Error: ${createData.Fault?.Error?.[0]?.Detail}`);

    // 5. SMART LINK GRAB (Wait 1.5s then fetch specifically for the link)
    const newInvoiceId = createData.Invoice.Id;
    let finalLink = createData.Invoice.InvoiceLink;

    if (!finalLink) {
      await wait(1500); // 1.5 seconds is the "sweet spot"
      const linkRes = await fetch(`${baseUrl}/invoice/${newInvoiceId}?minorversion=65&include=invoiceLink`, { headers: apiHeaders });
      const linkData = await linkRes.json();
      finalLink = linkData.Invoice?.InvoiceLink;
    }

    // Fallback if QBO is still being slow
    if (!finalLink) {
      finalLink = `https://app.qbo.intuit.com/app/invoice?txnId=${newInvoiceId}`;
    }

    // 6. Final DB Update
    const base44 = createClientFromRequest(req);
    if (base44) {
      await base44.asServiceRole.entities.Order.update(order_id, { quickbooks_invoice_id: newInvoiceId });
    }

    return Response.json({ success: true, invoice_id: newInvoiceId, invoice_link: finalLink });

  } catch (error) {
    console.error("Function Error:", error.message);
    return Response.json({ success: false, error: error.message }, { status: 200 });
  }
});