import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Helper for delays
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
    
    let body;
    try { body = await req.json(); } catch(e) { throw new Error("Invalid JSON"); }

    const { order_id, quickbooks_customer_id, product_type, specifications, pricing } = body;

    // 1. Setup
    const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
    const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
    const refreshToken = Deno.env.get('QUICKBOOKS_REFRESH_TOKEN');
    const realmId = Deno.env.get('QUICKBOOKS_REALM_ID');

    if (!clientId || !clientSecret || !refreshToken || !realmId) {
      throw new Error("Missing Environment Variables");
    }

    // 2. Auth
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

    // 3. Prep Data (Get Email & Invoice Number)
    const [customerRes, lastInvoiceRes] = await Promise.all([
      fetch(`${baseUrl}/customer/${quickbooks_customer_id}?minorversion=65`, { headers: apiHeaders }),
      fetch(`${baseUrl}/query?query=SELECT DocNumber FROM Invoice ORDERBY MetaData.CreateTime DESC MAXRESULTS 1&minorversion=65`, { headers: apiHeaders })
    ]);

    const customerData = await customerRes.json();
    const email = customerData.Customer?.PrimaryEmailAddr?.Address || "placeholder@example.com";

    const lastInvoiceData = await lastInvoiceRes.json();
    let nextNum = "1001";
    if (lastInvoiceData.QueryResponse?.Invoice?.length > 0) {
      const lastNum = lastInvoiceData.QueryResponse.Invoice[0].DocNumber;
      const numPart = parseInt(lastNum.replace(/\D/g, ''));
      if (!isNaN(numPart)) nextNum = (numPart + 1).toString();
    }

    // 4. Create Invoice
    const invoicePayload = {
      DocNumber: nextNum,
      CustomerRef: { value: quickbooks_customer_id },
      BillEmail: { Address: email },
      AllowOnlineCreditCardPayment: true,
      AllowOnlineACHPayment: true,
      Line: [{
        Amount: pricing,
        DetailType: "SalesItemLineDetail",
        Description: `${product_type}\n${specifications}`,
        SalesItemLineDetail: { Qty: 1, UnitPrice: pricing }
      }],
      SalesTermRef: { value: "1" }
    };

    console.log("Creating Invoice...");
    const createRes = await fetch(`${baseUrl}/invoice?minorversion=65`, {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify(invoicePayload)
      }
    );

    const createData = await createRes.json();
    if (!createRes.ok) throw new Error("Invoice Creation Failed");
    
    const newInvoiceId = createData.Invoice.Id;
    let finalLink = createData.Invoice.InvoiceLink;

    // 5. THE FIX: If link is missing, Wait and Read Back
    if (!finalLink) {
      console.log("Link missing in Create response. Waiting 2 seconds to read back...");
      await wait(2000); // 2 second delay

      const readRes = await fetch(`${baseUrl}/invoice/${newInvoiceId}?minorversion=65&include=invoiceLink`, {
        headers: apiHeaders
      });
      const readData = await readRes.json();
      finalLink = readData.Invoice?.InvoiceLink;
    }

    // 6. Final Check
    console.log("Final Link Retrieved:", finalLink);

    // Update DB
    try {
      const base44 = createClientFromRequest(req);
      if (base44) await base44.asServiceRole.entities.Order.update(order_id, { quickbooks_invoice_id: newInvoiceId });
    } catch (e) {}

    return Response.json({
      success: true,
      invoice_id: newInvoiceId,
      invoice_number: createData.Invoice.DocNumber,
      // If still null, return a safe string so frontend doesn't crash, but user knows why
      invoice_link: finalLink || "NO_LINK_GENERATED_CHECK_QB_PAYMENTS_SETUP"
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 200 });
  }
});