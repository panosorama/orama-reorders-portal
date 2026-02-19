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

// --- HARDCODED IDs FOR SPEED ---
const PRINTING_ITEM_ID = "1010000061";
const SHIPPING_ITEM_ID = "1010000026";

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const extractZip = (addr) => {
  if (!addr) return "";
  const zipMatch = addr.match(/\b\d{5}(-\d{4})?\b/);
  return zipMatch ? zipMatch[0] : "";
};

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
    
    const body = await req.json();
    const { 
      order_id, quickbooks_customer_id, product_type, specifications, 
      pricing, quantity, shipping_charge, is_tax_exempt, ship_to_address 
    } = body;

    const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
    const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
    const refreshToken = Deno.env.get('QUICKBOOKS_REFRESH_TOKEN');
    const realmId = Deno.env.get('QUICKBOOKS_REALM_ID');

    // 1. QUICK AUTH
    const authHeader = btoa(`${clientId}:${clientSecret}`);
    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${authHeader}` },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
    });
    const { access_token } = await tokenRes.json();
    
    const baseUrl = `https://quickbooks.api.intuit.com/v3/company/${realmId}`;
    const apiHeaders = { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json', 'Content-Type': 'application/json' };

    // 2. PARALLEL DATA FETCH (Saves ~2 seconds)
    // We only need Customer Email and the Last Invoice Number now.
    const docQuery = encodeURIComponent("SELECT DocNumber FROM Invoice ORDERBY MetaData.CreateTime DESC MAXRESULTS 1");
    
    const [customerRes, lastInvoiceRes] = await Promise.all([
      fetch(`${baseUrl}/customer/${quickbooks_customer_id}?minorversion=65`, { headers: apiHeaders }),
      fetch(`${baseUrl}/query?query=${docQuery}&minorversion=65`, { headers: apiHeaders })
    ]);

    const [customerResult, lastInvoiceData] = await Promise.all([
      customerRes.json(), lastInvoiceRes.json()
    ]);

    const email = customerResult.Customer?.PrimaryEmailAddr?.Address || "placeholder@example.com";
    
    let currentDocNumber = 2000; 
    if (lastInvoiceData.QueryResponse?.Invoice?.[0]) {
      const lastVal = lastInvoiceData.QueryResponse.Invoice[0].DocNumber;
      const parsed = parseInt(lastVal.replace(/\D/g, ''));
      if (!isNaN(parsed)) currentDocNumber = parsed + 1;
    }

    // 3. PREP DATA
    const taxState = (ship_to_address || "").toUpperCase().includes(" FL") ? "FL" : "NJ";
    const zipCode = extractZip(ship_to_address);

    const lines = [{
      Amount: pricing,
      DetailType: "SalesItemLineDetail",
      Description: `${product_type}\n${specifications}`,
      SalesItemLineDetail: { 
        ItemRef: { value: PRINTING_ITEM_ID },
        Qty: quantity || 1, 
        UnitPrice: pricing / (quantity || 1),
        TaxCodeRef: { value: is_tax_exempt ? "NON" : "TAX" }
      }
    }];

    if (shipping_charge > 0) {
      lines.push({
        Amount: shipping_charge,
        DetailType: "SalesItemLineDetail",
        Description: "Shipping",
        SalesItemLineDetail: {
          ItemRef: { value: SHIPPING_ITEM_ID },
          Qty: 1, UnitPrice: shipping_charge, TaxCodeRef: { value: "NON" } 
        }
      });
    }

    // 4. CREATE INVOICE
    const createRes = await fetch(`${baseUrl}/invoice?minorversion=65`, {
      method: 'POST', 
      headers: apiHeaders, 
      body: JSON.stringify({
        DocNumber: currentDocNumber.toString(),
        CustomerRef: { value: quickbooks_customer_id.toString() },
        BillEmail: { Address: email },
        Line: lines,
        ShipAddr: { Line1: ship_to_address, CountrySubDivisionCode: taxState, PostalCode: zipCode, Country: "US" }
      })
    });

    const createData = await createRes.json();
    if (!createRes.ok) throw new Error("Invoice creation failed at QuickBooks");
    const newInvoiceId = createData.Invoice.Id;

    // 5. THE LINK WAIT
    // We've saved so much time with parallelism that this 2s wait is now safe.
    await wait(2000); 
    const linkRes = await fetch(`${baseUrl}/invoice/${newInvoiceId}?minorversion=65&include=invoiceLink`, { headers: apiHeaders });
    const linkData = await linkRes.json();
    const finalLink = linkData.Invoice?.InvoiceLink;

    // 6. BACKGROUND DATABASE UPDATE (Non-blocking)
    const base44 = createClientFromRequest(req);
    if (base44) {
      base44.asServiceRole.entities.Order.update(order_id, { 
        quickbooks_invoice_id: newInvoiceId 
      }).catch(err => console.error("Background DB update failed:", err));
    }

    // 7. FINISH
    return Response.json({ 
      success: true, 
      invoice_id: newInvoiceId, 
      invoice_link: finalLink || "Link still generating... please refresh."
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message });
  }
});