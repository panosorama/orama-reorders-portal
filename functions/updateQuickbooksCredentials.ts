import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { clientId, clientSecret, refreshToken, realmId } = body;

    const usedClientId = clientId || Deno.env.get('QUICKBOOKS_CLIENT_ID');
    const usedClientSecret = clientSecret || Deno.env.get('QUICKBOOKS_CLIENT_SECRET');

    // Test the credentials by getting an access token
    const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${usedClientId}:${usedClientSecret}`)
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return Response.json({ 
        error: tokenData.error_description || 'Invalid credentials - could not get access token' 
      }, { status: 400 });
    }

    // Save the new rotating refresh token to the database so it persists automatically
    const newRefreshToken = tokenData.refresh_token || refreshToken;
    const configs = await base44.asServiceRole.entities.QuickbooksConfig.list('-created_date', 1);
    if (configs && configs.length > 0) {
      await base44.asServiceRole.entities.QuickbooksConfig.update(configs[0].id, { refresh_token: newRefreshToken });
    } else {
      await base44.asServiceRole.entities.QuickbooksConfig.create({ refresh_token: newRefreshToken });
    }

    return Response.json({ 
      success: true, 
      message: 'Credentials verified and refresh token saved. QuickBooks is now connected!',
      new_refresh_token: newRefreshToken
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});