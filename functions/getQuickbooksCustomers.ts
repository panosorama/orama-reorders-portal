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
  try {
    const base44 = createClientFromRequest(req);
    const { access_token: accessToken, realm_id: realmId } = await getQBToken(base44);
    console.log('Got access token, fetching customers...');

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
      console.error('Response status:', customerResponse.status);
      throw new Error(customerData.Fault?.Error?.[0]?.Message || 'Failed to fetch customers');
    }

    console.log('Customer response:', JSON.stringify(customerData, null, 2));
    const customers = customerData.QueryResponse?.Customer || [];
    
    // Return simplified customer list
    const customerList = customers.map(c => {
      const addr = c.ShipAddr || c.BillAddr;
      let shipToAddress = null;
      if (addr) {
        const parts = [addr.Line1, addr.City, addr.CountrySubDivisionCode, addr.PostalCode].filter(Boolean);
        shipToAddress = parts.join(", ");
      }
      return {
        id: c.Id,
        name: c.DisplayName,
        company: c.CompanyName || null,
        email: c.PrimaryEmailAddr?.Address || null,
        shipToAddress: shipToAddress || null
      };
    });

    return Response.json({
      success: true,
      customers: customerList
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});