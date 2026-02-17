import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to extract Zip Code for better tax accuracy
const extractZip = (addr) => {
  const zipMatch = addr.match(/\b\d{5}(-\d{4})?\b/);
  return zipMatch ? zipMatch[0] : "";
};

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
    
    let body;
    try { body = await req.json(); } catch(e) { throw new Error("Invalid JSON"); }
    
    const { 
      order_id, 
      quickbooks_customer_id, 
      product_type, 
      specifications, 
      pricing, 
      quantity, 
      shipping_charge, 
      is_tax_exempt, 
      ship_to_address 
    } = body;

    // 1. Environment Variables
    const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
    const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
    const refreshToken = Deno.env.get('QUICKBOOKS_REFRESH_TOKEN');
    const realmId = Deno.env.get('QUICKBOOKS_REALM_ID');

    // 2. Authentication
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

    // 3. Setup Customer & Doc Number
    const [customerRes, lastInvoiceRes] = await Promise.all([
      fetch(`${baseUrl}/customer/${quickbooks_customer_id}?minorversion=65`, { headers: apiHeaders }),
      fetch(`${baseUrl}/query?query=SELECT DocNumber FROM Invoice ORDERBY MetaData.CreateTime DESC MAXRESULTS 1&minorversion=65`, { headers: apiHeaders })
    ]);

    const customerData = await customerRes.json();
    const email = customerData.Customer?.PrimaryEmailAddr?.Address || "placeholder@example.com";

    let currentDocNumber = 1919; 
    const lastInvoiceData = await lastInvoiceRes.json();
    if (lastInvoiceData.QueryResponse?.Invoice?.length > 0) {
      const lastVal = lastInvoiceData.QueryResponse.Invoice[0].DocNumber;
      const parsed = parseInt(lastVal.replace(/\D/g, ''));
      if (!isNaN(parsed) && (parsed + 1) > currentDocNumber) currentDocNumber = parsed + 1;
    }

    // 4. Determine Tax State (Nexus Logic)
    // We only have permits in NJ and FL. 
    // If it's not FL, we force NJ to ensure tax is collected.
    let taxState = "NJ"; 
    const upperAddr = ship_to_address.toUpperCase();
    if (upperAddr.includes(" FL ") || upperAddr.endsWith(" FL") || upperAddr.includes(", FL")) {
      taxState = "FL";
    }

    const zipCode = extractZip(ship_to_address);

    // 5. Create Invoice Loop
    let attempts = 0;
    let successData = null;
    const PRINTING_ITEM_ID = "200000701"; 
    const SHIPPING_ITEM_ID = "200000311"; 

    while (attempts < 5) {
      const lines = [];
      
      // Printing Line (Taxable unless exempt)
      lines.push({
        Amount: pricing,
        DetailType: "SalesItemLineDetail",
        Description: `${product_type}\n${specifications}`,
        SalesItemLineDetail: { 
          ItemRef: { value: PRINTING_ITEM_ID, name: "Printing" },
          Qty: quantity || 1, 
          UnitPrice: pricing / (quantity || 1),
          TaxCodeRef: { value: is_tax_exempt ? "NON" : "TAX" }
        }
      });

      // Shipping Line (Always NON-taxable)
      if (shipping_charge && shipping_charge > 0) {
        lines.push({
          Amount: shipping_charge,
          DetailType: "SalesItemLineDetail",
          Description: "Shipping",
          SalesItemLineDetail: {
            ItemRef: { value: SHIPPING_ITEM_ID, name: "Shipping" },
            Qty: 1,
            UnitPrice: shipping_charge,
            TaxCodeRef: { value: "NON" } 
          }
        });
      }

      const invoicePayload = {
        DocNumber: currentDocNumber.toString(),
        CustomerRef: { value: quickbooks_customer_id },
        BillEmail: { Address: email },
        Line: lines,
        SalesTermRef: { value: "1" },
        TxnTaxDetail: {}, // Triggers AST calculation
        ShipAddr: {
          Line1: ship_to_address,
          CountrySubDivisionCode: taxState,
          PostalCode: zipCode,
          Country: "US"
        },
        PrivateNote: `Base44 Order ID: ${order_id}`
      };

      const createRes = await fetch(`${baseUrl}/invoice?minorversion=65`, {
        method: 'POST', headers: apiHeaders, body: JSON.stringify(invoicePayload)
      });

      const createData = await createRes.json();
      if (createRes.ok) {
        successData = createData;
        break; 
      } else {
        const error = createData.Fault?.Error?.[0];
        if (error?.code === "6140") {
          currentDocNumber++;
          attempts++;
        } else {
          throw new Error(`QB Error: ${error?.Message || JSON.stringify(createData)}`);
        }
      }
    }

    // 6. Finalize & Response
    const newInvoiceId = successData.Invoice.Id;
    let finalLink = successData.Invoice.InvoiceLink || `https://app.qbo.intuit.com/app/invoice?txnId=${newInvoiceId}`;

    try {
      const base44 = createClientFromRequest(req);
      if (base44) await base44.asServiceRole.entities.Order.update(order_id, { quickbooks_invoice_id: newInvoiceId });
    } catch (e) { console.error("Database update failed", e); }

    return Response.json({
      success: true,
      invoice_id: newInvoiceId,
      invoice_number: successData.Invoice.DocNumber,
      invoice_link: finalLink
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 200 });
  }
});