import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { displayName, companyName, givenName, familyName, email, phone, billAddr } = await req.json();

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

    // Create customer in QuickBooks
    const customerData = {
      DisplayName: displayName,
      ...(companyName && { CompanyName: companyName }),
      ...(givenName && { GivenName: givenName }),
      ...(familyName && { FamilyName: familyName }),
      ...(email && { PrimaryEmailAddr: { Address: email } }),
      ...(phone && { PrimaryPhone: { FreeFormNumber: phone } }),
      ...(billAddr && { BillAddr: billAddr })
    };

    const createResponse = await fetch(
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

    const createData = await createResponse.json();

    if (!createResponse.ok) {
      throw new Error(createData.Fault?.Error?.[0]?.Message || 'Failed to create customer');
    }

    return Response.json({
      success: true,
      customer: {
        id: createData.Customer.Id,
        name: createData.Customer.DisplayName,
        company: createData.Customer.CompanyName || null
      }
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});