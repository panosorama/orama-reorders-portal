import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { order_id, quickbooks_customer_id, product_type, specifications, pricing } = await req.json();

    // Get QuickBooks credentials
    const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
    const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
    const refreshToken = Deno.env.get('QUICKBOOKS_REFRESH_TOKEN');
    const realmId = Deno.env.get('QUICKBOOKS_REALM_ID');

    // Get new access token
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
      throw new Error(tokenData.error_description || 'Failed to get access token');
    }
    
    const accessToken = tokenData.access_token;

    // Get the last invoice to determine next number
    const queryResponse = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=SELECT * FROM Invoice ORDER BY DocNumber DESC MAXRESULTS 1&minorversion=65`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );
    
    const queryData = await queryResponse.json();
    const lastInvoice = queryData.QueryResponse?.Invoice?.[0];
    let lastDocNumber = lastInvoice?.DocNumber || "4999";
    // Ensure it's numeric
    lastDocNumber = parseInt(lastDocNumber) || 4999;
    const nextDocNumber = (lastDocNumber + 1).toString();

    // Create invoice using the pre-selected customer (let QuickBooks auto-assign if preferred)
    const invoiceData = {
      CustomerRef: {
        value: quickbooks_customer_id
      },
      Line: [{
        Amount: pricing,
        DetailType: "SalesItemLineDetail",
        Description: `${product_type}\n\nSpecifications:\n${specifications}`,
        SalesItemLineDetail: {
          Qty: 1,
          UnitPrice: pricing
        }
      }],
      CustomerMemo: {
        value: `Reorder - ${product_type}`
      },
      SalesTermRef: {
        value: "3"
      }
    };

    const invoiceResponse = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/invoice?minorversion=65`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(invoiceData)
      }
    );

    const invoice = await invoiceResponse.json();

    if (!invoiceResponse.ok) {
      console.error("QuickBooks Error:", invoice);
      throw new Error(invoice.Fault?.Error?.[0]?.Message || 'Failed to create invoice');
    }

    const invoiceId = invoice.Invoice.Id;
    const invoiceNumber = invoice.Invoice.DocNumber;
    
    console.log("Invoice created:", { invoiceId, invoiceNumber });
    
    // Get the shareable customer payment link
    // This endpoint generates the link customers can use to view and pay the invoice
    const shareResponse = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/invoice/${invoiceId}?include=invoiceLink`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );
    
    const shareData = await shareResponse.json();
    console.log("Share data:", JSON.stringify(shareData, null, 2));
    
    // Extract the InvoiceLink which is the customer payment URL
    const invoiceLink = shareData.Invoice?.InvoiceLink;
    
    console.log("Invoice link extracted:", { 
      invoiceLink, 
      hasLink: !!invoiceLink,
      invoiceId 
    });

    // Update order with invoice ID (keep status as available for reuse)
    await base44.asServiceRole.entities.Order.update(order_id, {
      quickbooks_invoice_id: invoiceId
    });

    return Response.json({
      success: true,
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      invoice_link: invoiceLink || `https://app.qbo.intuit.com/app/invoice?txnId=${invoiceId}`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});