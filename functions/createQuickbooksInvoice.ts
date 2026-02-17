import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    // 1. INPUT VALIDATION
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
    
    // Parse body safely
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { order_id, quickbooks_customer_id, product_type, specifications, pricing } = body;

    // 2. ENV VAR CHECK (Common cause of 500 errors)
    const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
    const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
    const refreshToken = Deno.env.get('QUICKBOOKS_REFRESH_TOKEN');
    const realmId = Deno.env.get('QUICKBOOKS_REALM_ID');

    const missingVars = [];
    if (!clientId) missingVars.push('QUICKBOOKS_CLIENT_ID');
    if (!clientSecret) missingVars.push('QUICKBOOKS_CLIENT_SECRET');
    if (!refreshToken) missingVars.push('QUICKBOOKS_REFRESH_TOKEN');
    if (!realmId) missingVars.push('QUICKBOOKS_REALM_ID');

    if (missingVars.length > 0) {
      console.error("Missing Environment Variables:", missingVars);
      return Response.json({ 
        success: false, 
        error: `Server Configuration Error: Missing ${missingVars.join(', ')}` 
      }, { status: 500 });
    }

    // 3. GET ACCESS TOKEN
    const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`)
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      console.error("Token Error:", tokenData);
      throw new Error(`Auth Failed: ${tokenData.error_description || tokenData.error}`);
    }
    
    const accessToken = tokenData.access_token;
    const baseUrl = `https://quickbooks.api.intuit.com/v3/company/${realmId}`;
    const apiHeaders = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    // 4. PARALLEL FETCH: Customer & Last Invoice
    const [customerResponse, lastInvoiceResponse] = await Promise.all([
      fetch(`${baseUrl}/customer/${quickbooks_customer_id}?minorversion=65`, { headers: apiHeaders }),
      fetch(`${baseUrl}/query?query=SELECT DocNumber FROM Invoice ORDERBY MetaData.CreateTime DESC MAXRESULTS 1&minorversion=65`, { headers: apiHeaders })
    ]);

    // Handle Customer Email
    const customerData = await customerResponse.json();
    const customerEmail = customerData.Customer?.PrimaryEmailAddr?.Address;
    
    // Safety check: We cannot generate a link without an email
    const emailToUse = customerEmail || "placeholder@example.com"; 

    // Handle Invoice Numbering
    const lastInvoiceData = await lastInvoiceResponse.json();
    let nextDocNumber = "1001"; // Default for brand new account
    
    if (lastInvoiceData.QueryResponse?.Invoice?.length > 0) {
      const lastDocNum = lastInvoiceData.QueryResponse.Invoice[0].DocNumber;
      // Safely extract number, ignoring "INV-" prefixes if they exist
      const numericPart = parseInt(lastDocNum.replace(/\D/g, '')); 
      if (!isNaN(numericPart)) {
        nextDocNumber = (numericPart + 1).toString();
      }
    }

    // 5. CREATE INVOICE
    const invoiceData = {
      DocNumber: nextDocNumber,
      CustomerRef: { value: quickbooks_customer_id },
      BillEmail: { Address: emailToUse }, // Critical for Link
      AllowOnlineCreditCardPayment: true, // Critical for Link
      AllowOnlineACHPayment: true,        // Critical for Link
      Line: [{
        Amount: pricing,
        DetailType: "SalesItemLineDetail",
        Description: `${product_type}\n\nSpecifications:\n${specifications}`,
        SalesItemLineDetail: {
          Qty: 1,
          UnitPrice: pricing
        }
      }],
      CustomerMemo: { value: `Reorder - ${product_type}` },
      SalesTermRef: { value: "1" }
    };

    const createInvoiceRes = await fetch(
      `${baseUrl}/invoice?minorversion=65&include=invoiceLink`, 
      {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify(invoiceData)
      }
    );

    const invoiceResult = await createInvoiceRes.json();

    if (!createInvoiceRes.ok) {
      console.error("Create Invoice Failed:", JSON.stringify(invoiceResult, null, 2));
      throw new Error(invoiceResult.Fault?.Error?.[0]?.Message || 'Failed to create invoice');
    }

    const createdInvoice = invoiceResult.Invoice;
    
    // 6. UPDATE DATABASE (Base44)
    // Only try this if base44 was initialized successfully
    try {
      const base44 = createClientFromRequest(req);
      if (base44) {
        await base44.asServiceRole.entities.Order.update(order_id, {
          quickbooks_invoice_id: createdInvoice.Id
        });
      }
    } catch (dbError) {
      console.warn("Base44 update failed, but invoice was created:", dbError);
    }

    return Response.json({
      success: true,
      invoice_id: createdInvoice.Id,
      invoice_number: createdInvoice.DocNumber,
      invoice_link: createdInvoice.InvoiceLink || "Link not generated by QB"
    });

  } catch (error) {
    console.error("CRITICAL SCRIPT ERROR:", error);
    // Return a 500 with JSON body so the frontend can read the error message
    return Response.json({ 
      success: false, 
      error: error.message, 
      stack: error.stack 
    }, { status: 500 });
  }
});