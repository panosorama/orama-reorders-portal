Deno.serve(async (req) => {
  const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
  const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
  const refreshToken = Deno.env.get('QUICKBOOKS_REFRESH_TOKEN');
  const realmId = Deno.env.get('QUICKBOOKS_REALM_ID');

  // 1. Get Token
  const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`)
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  });
  const { access_token } = await tokenRes.json();
  
  // 2. Query JUST Printing and Shipping
  // We use the 'IN' operator to keep the response tiny
  const query = encodeURIComponent("SELECT Name, Id FROM Item WHERE Name IN ('Printing', 'Shipping', 'shipping', 'printing')");
  
  const itemRes = await fetch(`https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${query}&minorversion=65`, {
    headers: { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' }
  });
  const data = await itemRes.json();

  // 3. Output the result
  return Response.json({ 
    instruction: "Copy these IDs into your main script configuration:",
    found_items: data.QueryResponse.Item || "No items found. Check if the names are exactly 'Printing' or 'Shipping' in QBO."
  });
});