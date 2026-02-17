import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  // --- SAFETY WRAPPER START ---
  try {
    // 1. Validate Request
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
    
    let body;
    try { body = await req.json(); } catch(e) { throw new Error("Invalid JSON body sent to server"); }

    const { order_id, quickbooks_customer_id, product_type, specifications, pricing } = body;

    // 2. CHECK ENVIRONMENT VARIABLES (Crucial Step)
    const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
    const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
    const refreshToken = Deno.env.get('QUICKBOOKS_REFRESH_TOKEN');
    const realmId = Deno.env.get('QUICKBOOKS_REALM_ID');

    // If any are missing, STOP immediately and tell the frontend
    const missing = [];
    if (!clientId) missing.push("QUICKBOOKS_CLIENT_ID");
    if (!clientSecret) missing.push("QUICKBOOKS_CLIENT_SECRET");
    if (!refreshToken) missing.push("QUICKBOOKS_REFRESH_TOKEN");
    if (!realmId) missing.push("QUICKBOOKS_REALM_ID");

    if (missing.length > 0) {
      throw new Error(`MISSING ENV VARS: ${missing.join(", ")}. Please add these in your App Settings.`);
    }

    // 3. Authenticate with QuickBooks
    const authString = btoa(`${clientId}:${clientSecret}`);
    const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authString}`
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      throw new Error(`Auth Failed: ${tokenData.error_description || JSON.stringify(tokenData)}`);
    }
    
    const accessToken = tokenData.access_token;
    const baseUrl = `https://quickbooks.api.intuit.com/v3/company/${realmId}`;
    const apiHeaders = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    // 4. Fetch Customer Email & Last Invoice (Parallel)
    const [customerRes, lastInvoiceRes] = await Promise.all([
      fetch(`${baseUrl}/customer/${quickbooks_customer_id}?minorversion=65`, { headers: apiHeaders }),
      fetch(`${baseUrl}/query?query=SELECT DocNumber FROM Invoice ORDERBY MetaData.CreateTime DESC MAXRESULTS 1&minorversion=65`, { headers: apiHeaders })
    ]);

    // Handle Customer Email (REQUIRED for Link)
    const customerData = await customerRes.json();
    const email = customerData.Customer?.PrimaryEmailAddr?.Address || "no-reply@placeholder.com";

    // Handle Invoice Number (Prevents NaN)
    const lastInvoiceData = await lastInvoiceRes.json();
    let nextNum = "1001";
    if (lastInvoiceData.QueryResponse?.Invoice?.length > 0) {
      const lastNum = lastInvoiceData.QueryResponse.Invoice[0].DocNumber;
      const numPart = parseInt(lastNum.replace(/\D/g, '')); // Strip non-digits
      if (!isNaN(numPart)) nextNum = (numPart + 1).toString();
    }

    // 5. Create Invoice
    // Note: We deliberately set AllowOnlineCreditCardPayment to TRUE to force the link generation
    const invoicePayload = {
      DocNumber: nextNum, 
      CustomerRef: { value: quickbooks_customer_id },
      BillEmail: { Address: email },
      AllowOnlineCreditCardPayment: true,
      AllowOnlineACHPayment: true,
      Line: [{
        Amount: pricing,
        DetailType: "SalesItemLineDetail",
        Description: `${product_type}\n\nSpecs:\n${specifications}`,
        SalesItemLineDetail: { Qty: 1, UnitPrice: pricing }
      }],
      SalesTermRef: { value: "1" }
    };

    const createRes = await fetch(
      `${baseUrl}/invoice?minorversion=65&include=invoiceLink`, 
      {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify(invoicePayload)
      }
    );

    const createData = await createRes.json();
    if (!createRes.ok) {
      throw new Error(`Invoice Create Failed: ${JSON.stringify(createData.Fault || createData)}`);
    }

    // 6. Success!
    const newInvoice = createData.Invoice;
    
    // Update DB if client exists
    try {
      const base44 = createClientFromRequest(req);
      if (base44) {
        await base44.asServiceRole.entities.Order.update(order_id, {
          quickbooks_invoice_id: newInvoice.Id
        });
      }
    } catch (e) { console.warn("DB Update warning", e); }

    // Return Data
    return Response.json({
      success: true,
      invoice_id: newInvoice.Id,
      invoice_number: newInvoice.DocNumber,
      invoice_link: newInvoice.InvoiceLink || "https://invoices.intuit.com/fallback"
    });

  } catch (error) {
    // --- ERROR CATCHER ---
    // This ensures we return a 200 OK with the error details, 
    // allowing the browser console to actually see the message.
    return Response.json({
      success: false,
      error_message: error.message,
      error_stack: error.stack
    }, { status: 200 }); // Returning 200 so axios doesn't hide the body
  }
});