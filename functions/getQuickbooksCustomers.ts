import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
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

    // Fetch all active customers
    const customerResponse = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=select * from Customer where Active = true MAXRESULTS 1000&minorversion=65`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    const customerData = await customerResponse.json();

    if (!customerResponse.ok) {
      console.error('QBO Error:', JSON.stringify(customerData, null, 2));
      throw new Error(customerData.Fault?.Error?.[0]?.Message || 'Failed to fetch customers');
    }

    const customers = customerData.QueryResponse?.Customer || [];
    
    // Return simplified customer list
    const customerList = customers.map(c => ({
      id: c.Id,
      name: c.DisplayName,
      company: c.CompanyName || null
    }));

    return Response.json({
      success: true,
      customers: customerList
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});