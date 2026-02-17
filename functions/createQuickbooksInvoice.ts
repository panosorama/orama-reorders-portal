import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { order_id, quickbooks_customer_id, product_type, specifications, pricing } = await req.json();

    // 1. Setup Credentials
    const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
    const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
    const refreshToken = Deno.env.get('QUICKBOOKS_REFRESH_TOKEN');
    const realmId = Deno.env.get('QUICKBOOKS_REALM_ID');
    const baseUrl = `https://quickbooks.api.intuit.com/v3/company/${realmId}`;

    // 2. Get Access Token
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
    if (!tokenResponse.ok) throw new Error(tokenData.error_description || 'Failed to get access token');
    const accessToken = tokenData.access_token;
    
    const apiHeaders = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    // 3. PRE-WORK: Fetch Customer Email AND Last Invoice Number (in parallel for speed)
    const [customerResponse, lastInvoiceResponse] = await Promise.all([
      // A. Get Customer to find their Email
      fetch(`${baseUrl}/customer/${quickbooks_customer_id}?minorversion=65`, { headers: apiHeaders }),
      // B. Query Last Invoice to calculate next DocNumber manually
      fetch(`${baseUrl}/query?query=SELECT DocNumber FROM Invoice ORDERBY MetaData.CreateTime DESC MAXRESULTS 1&minorversion=65`, { headers: apiHeaders })
    ]);

    // Process Customer Email
    const customerData = await customerResponse.json();
    // Default to a placeholder if missing, or the link WON'T generate.
    const customerEmail = customerData.Customer?.PrimaryEmailAddr?.Address || "noreply@placeholder.com";

    // Process Invoice Number
    const lastInvoiceData = await lastInvoiceResponse.json();
    let nextDocNumber = "1001"; // Default start
    if (lastInvoiceData.QueryResponse?.Invoice?.length > 0) {
      const lastDocNum = lastInvoiceData.QueryResponse.Invoice[0].DocNumber;
      // Extract number and increment (handle potential non-numeric prefixes if needed)
      const numericPart = parseInt(lastDocNum.replace(/\D/g, '')); 
      if (!isNaN(numericPart)) {
        nextDocNumber = (numericPart + 1).toString();
      }
    }

    // 4. Create Invoice (With Email, Payment Flags, AND Explicit DocNumber)
    const invoiceData = {
      DocNumber: nextDocNumber, // Explicitly set the number
      CustomerRef: { value: quickbooks_customer_id },
      BillEmail: { Address: customerEmail }, // REQUIRED for Link Generation
      // REQUIRED: These flags trigger the payment link creation
      AllowOnlineCreditCardPayment: true, 
      AllowOnlineACHPayment: true,
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

    // Note: We use ?include=invoiceLink to ensure it returns in the response
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
      console.error("QB Error:", invoiceResult);
      throw new Error(invoiceResult.Fault?.Error?.[0]?.Message || 'Failed to create invoice');
    }

    // 5. Extract Data
    const createdInvoice = invoiceResult.Invoice;
    const finalInvoiceId = createdInvoice.Id;
    const finalInvoiceNumber = createdInvoice.DocNumber;
    // The link should now be directly in the response because of our flags + query param
    const finalInvoiceLink = createdInvoice.InvoiceLink || `https://connect.intuit.com/portal/app/CommerceNetwork/view/scs-v1-missing`;

    // 6. Update Base44 Record
    await base44.asServiceRole.entities.Order.update(order_id, {
      quickbooks_invoice_id: finalInvoiceId
    });

    return Response.json({
      success: true,
      invoice_id: finalInvoiceId,
      invoice_number: finalInvoiceNumber,
      invoice_link: finalInvoiceLink
    });

  } catch (error) {
    console.error("Script Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});