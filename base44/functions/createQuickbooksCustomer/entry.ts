import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function getQBToken(base44) {
  const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
  const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
  const realmId = Deno.env.get('QUICKBOOKS_REALM_ID');
  let refreshToken = Deno.env.get('QUICKBOOKS_REFRESH_TOKEN');
  let configRecord = null;

  const configs = await base44.asServiceRole.entities.QuickbooksConfig.list('-created_date', 1);
  if (configs && configs.length > 0 && configs[0].refresh_token) {
    refreshToken = configs[0].refresh_token;
    configRecord = configs[0];
  }

  const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`) },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(tokenData.error_description || 'Failed to get QB access token');

  if (tokenData.refresh_token) {
    if (configRecord) {
      base44.asServiceRole.entities.QuickbooksConfig.update(configRecord.id, { refresh_token: tokenData.refresh_token }).catch(console.error);
    } else {
      base44.asServiceRole.entities.QuickbooksConfig.create({ refresh_token: tokenData.refresh_token }).catch(console.error);
    }
  }
  return { access_token: tokenData.access_token, realm_id: realmId };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { displayName, companyName, givenName, familyName, email, phone, billAddr } = await req.json();

    const { access_token: accessToken, realm_id: realmId } = await getQBToken(base44);

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
        company: createData.Customer.CompanyName || null,
        email: createData.Customer.PrimaryEmailAddr?.Address || null,
        givenName: createData.Customer.GivenName || null,
        familyName: createData.Customer.FamilyName || null
      }
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});