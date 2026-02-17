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

    // Create invoice and let QuickBooks auto-generate the invoice number
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
      DueDate: new Date().toISOString().split('T')[0],
      SalesTermRef: {
        value: "1"
      },
      EmailStatus: "NeedToSend",
      BillEmail: {
        Address: ""
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
    const salesTermRef = invoice.Invoice.SalesTermRef;
    const dueDate = invoice.Invoice.DueDate;
    
    console.log("Invoice created successfully:", { 
      invoiceId, 
      invoiceNumber, 
      salesTermRef,
      dueDate,
      fullInvoice: JSON.stringify(invoice.Invoice, null, 2)
    });
    
    // Send the invoice to generate the payment link
    const sendResponse = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/invoice/${invoiceId}/send?sendTo=${quickbooks_customer_id}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );
    
    if (!sendResponse.ok) {
      const sendError = await sendResponse.json();
      console.error("Send invoice error:", sendError);
    }
    
    // Get the shareable customer payment link
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
    console.log("Share data after send:", JSON.stringify(shareData, null, 2));
    
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

    // Final verification logs
    console.log("Final response data:", {
      success: true,
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      has_invoice_link: !!invoiceLink,
      invoice_link: invoiceLink
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