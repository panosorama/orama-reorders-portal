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

    // Query the last invoice to get the highest DocNumber
    const queryResponse = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=SELECT DocNumber FROM Invoice ORDERBY MetaData.CreateTime DESC MAXRESULTS 1`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    let nextInvoiceNumber = '1001';
    if (queryResponse.ok) {
      const queryData = await queryResponse.json();
      if (queryData.QueryResponse && queryData.QueryResponse.Invoice && queryData.QueryResponse.Invoice.length > 0) {
        const lastDocNumber = queryData.QueryResponse.Invoice[0].DocNumber;
        const lastNumber = parseInt(lastDocNumber, 10);
        nextInvoiceNumber = String(lastNumber + 1);
        console.log(`Last invoice number: ${lastDocNumber}, next: ${nextInvoiceNumber}`);
      }
    } else {
      console.warn("Could not query last invoice, starting at 1001");
    }

    // Create invoice with manually incremented DocNumber
    const invoiceData = {
      DocNumber: nextInvoiceNumber,
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
      },
      AllowOnlineCreditCardPayment: true,
      AllowOnlineACHPayment: true
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

    console.log("Invoice created successfully:", { invoiceId, invoiceNumber });

    // Retrieve customer email
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

    // If customer has email, add it to invoice to ensure InvoiceLink is generated
    if (customerEmail) {
      const updateResponse = await fetch(
        `https://quickbooks.api.intuit.com/v3/company/${realmId}/invoice/${invoiceId}?minorversion=65`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            Id: invoiceId,
            SyncToken: invoice.Invoice.SyncToken,
            BillEmail: {
              Address: customerEmail
            },
            sparse: true
          })
        }
      );

      if (updateResponse.ok) {
        console.log("Added email to invoice for link generation");
      }

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
    } else {
      console.warn("No email found for customer");
    }

    // Fetch invoice with InvoiceLink included
    const invoiceWithLinkResponse = await fetch(
    `https://quickbooks.api.intuit.com/v3/company/${realmId}/invoice/${invoiceId}?include=invoiceLink&minorversion=65`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    }
    );

    let invoiceLink = null;
    if (invoiceWithLinkResponse.ok) {
    const invoiceWithLink = await invoiceWithLinkResponse.json();
    invoiceLink = invoiceWithLink.Invoice?.InvoiceLink;
    console.log("InvoiceLink retrieved:", invoiceLink);
    } else {
    const errorData = await invoiceWithLinkResponse.json();
    console.error("Failed to retrieve InvoiceLink:", errorData);
    }

    // Fallback if link is not available
    if (!invoiceLink) {
    invoiceLink = `https://connect.intuit.com/portal/app/CommerceNetwork/`;
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