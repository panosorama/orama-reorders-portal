import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Central QB token manager - handles rotating refresh tokens automatically
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
    const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
    const realmId = Deno.env.get('QUICKBOOKS_REALM_ID');

    // Get the latest refresh token: entity (rotating) takes priority over env var
    let refreshToken = Deno.env.get('QUICKBOOKS_REFRESH_TOKEN');
    let configRecord = null;

    const configs = await base44.asServiceRole.entities.QuickbooksConfig.list('-created_date', 1);
    if (configs && configs.length > 0 && configs[0].refresh_token) {
      refreshToken = configs[0].refresh_token;
      configRecord = configs[0];
    }

    // Exchange refresh token for access token
    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`)
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error('QB Token Error:', JSON.stringify(tokenData));
      return Response.json({ error: tokenData.error_description || 'Failed to get access token' }, { status: 500 });
    }

    const accessToken = tokenData.access_token;
    const newRefreshToken = tokenData.refresh_token;

    // Save the new rotating refresh token to the entity
    if (newRefreshToken) {
      if (configRecord) {
        await base44.asServiceRole.entities.QuickbooksConfig.update(configRecord.id, { refresh_token: newRefreshToken });
      } else {
        await base44.asServiceRole.entities.QuickbooksConfig.create({ refresh_token: newRefreshToken });
      }
    }

    return Response.json({ access_token: accessToken, realm_id: realmId });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});