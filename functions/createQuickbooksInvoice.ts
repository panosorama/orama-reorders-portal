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
      SalesTermRef: {
        value: "1"
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
    let invoiceNumber = invoice.Invoice.DocNumber || invoice.Invoice.No;
    
    // If still no number, extract from invoice data
    if (!invoiceNumber) {
      // Try parsing invoice details or use ID as fallback
      invoiceNumber = invoice.Invoice.Id;
    }

    const salesTermRef = invoice.Invoice.SalesTermRef;

    console.log("Invoice created successfully:", { 
      invoiceId, 
      invoiceNumber, 
      salesTermRef
    });

    // Retrieve customer email for invoice sending
    const customerResponse = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/customer/${quickbooks_customer_id}?minorversion=65`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    const customerData = await customerResponse.json();
    const customerEmail = customerData.Customer?.PrimaryEmailAddr?.Address;

    if (!customerEmail) {
      console.warn("No email found for customer, cannot send invoice");
    } else {
      // Send invoice via QuickBooks
      const sendResponse = await fetch(
        `https://quickbooks.api.intuit.com/v3/company/${realmId}/invoice/${invoiceId}/send?sendTo=${customerEmail}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }
      );

      if (!sendResponse.ok) {
        const sendResult = await sendResponse.json();
        console.error("Failed to send invoice:", sendResult);
      } else {
        console.log("Invoice sent successfully to:", customerEmail);
      }
    }

    // Fetch full invoice details to check for payment link
    const invoiceDetailResponse = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/invoice/${invoiceId}?minorversion=65`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    let invoiceLink = null;
    
    if (invoiceDetailResponse.ok) {
      const invoiceDetail = await invoiceDetailResponse.json();
      // Check if invoice has a payment link property
      if (invoiceDetail.Invoice?.paymentlinks?.[0]?.url) {
        invoiceLink = invoiceDetail.Invoice.paymentlinks[0].url;
        console.log("Payment link found:", invoiceLink);
      } else if (invoiceDetail.Invoice?.paymentlinks?.[0]) {
        invoiceLink = invoiceDetail.Invoice.paymentlinks[0];
        console.log("Payment link object:", invoiceLink);
      }
    }

    // Fallback to customer portal link if no direct payment link
    if (!invoiceLink) {
      invoiceLink = `https://connect.intuit.com/app/invoice/${invoiceNumber}`;
    }

    // Update order with invoice ID (keep status as available for reuse)
    await base44.asServiceRole.entities.Order.update(order_id, {
      quickbooks_invoice_id: invoiceId
    });

    return Response.json({
      success: true,
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      invoice_link: invoiceLink
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});