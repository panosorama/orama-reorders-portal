import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { order_id, customer_name, company_name, product_type, specifications, pricing } = await req.json();

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

    // First, search or create customer
    const customerSearchResponse = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=select * from Customer where DisplayName = '${(company_name || customer_name).replace(/'/g, "\\'")}'&minorversion=65`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    const customerSearchData = await customerSearchResponse.json();
    let customerId;

    if (customerSearchData.QueryResponse?.Customer?.length > 0) {
      customerId = customerSearchData.QueryResponse.Customer[0].Id;
    } else {
      // Create customer
      const customerData = {
        DisplayName: company_name || customer_name
      };

      const createCustomerResponse = await fetch(
        `https://quickbooks.api.intuit.com/v3/company/${realmId}/customer?minorversion=65`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(customerData)
        }
      );

      const newCustomer = await createCustomerResponse.json();
      
      if (!createCustomerResponse.ok) {
        throw new Error(newCustomer.Fault?.Error?.[0]?.Message || 'Failed to create customer');
      }
      
      customerId = newCustomer.Customer.Id;
    }

    // Create invoice
    const invoiceData = {
      CustomerRef: {
        value: customerId
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
      throw new Error(invoice.Fault?.Error?.[0]?.Message || 'Failed to create invoice');
    }

    const invoiceId = invoice.Invoice.Id;
    const invoiceLink = `https://app.qbo.intuit.com/app/invoice?txnId=${invoiceId}`;

    // Update order with invoice ID
    await base44.asServiceRole.entities.Order.update(order_id, {
      quickbooks_invoice_id: invoiceId,
      status: 'approved'
    });

    return Response.json({
      success: true,
      invoice_id: invoiceId,
      invoice_link: invoiceLink
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});