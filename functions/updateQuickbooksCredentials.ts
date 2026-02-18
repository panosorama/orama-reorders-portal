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

    // Test the credentials by getting an access token
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
      return Response.json({ 
        error: tokenData.error_description || 'Invalid credentials - could not get access token' 
      }, { status: 400 });
    }

    return Response.json({ 
      success: true, 
      message: 'Credentials verified successfully. Please update them in Dashboard → Settings → Environment Variables.',
      new_refresh_token: tokenData.refresh_token || null
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});