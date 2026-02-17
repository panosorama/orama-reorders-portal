import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

Deno.serve(async (req) => {
  try {
    // 1. Setup & Validation
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
    
    let body;
    try { body = await req.json(); } catch(e) { throw new Error("Invalid JSON"); }
    const { order_id, quickbooks_customer_id, product_type, specifications, pricing, quantity, shipping_charge, is_tax_exempt, ship_to_address } = body;

    const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
    const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
    const refreshToken = Deno.env.get('QUICKBOOKS_REFRESH_TOKEN');
    const realmId = Deno.env.get('QUICKBOOKS_REALM_ID');

    if (!clientId || !clientSecret || !refreshToken || !realmId) {
      throw new Error("Missing QB Environment Variables");
    }

    // 2. Authenticate
    const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`)
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error("Auth Failed");
    const accessToken = tokenData.access_token;
    
    const baseUrl = `https://quickbooks.api.intuit.com/v3/company/${realmId}`;
    const apiHeaders = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    // 3. Get Initial Data & SET STARTING NUMBER
    const [customerRes, lastInvoiceRes] = await Promise.all([
      fetch(`${baseUrl}/customer/${quickbooks_customer_id}?minorversion=65`, { headers: apiHeaders }),
      fetch(`${baseUrl}/query?query=SELECT DocNumber FROM Invoice ORDERBY MetaData.CreateTime DESC MAXRESULTS 1&minorversion=65`, { headers: apiHeaders })
    ]);

    const customerData = await customerRes.json();
    const email = customerData.Customer?.PrimaryEmailAddr?.Address || "placeholder@example.com";

    // --- NEW LOGIC START ---
    // We set 1919 as the minimum starting point
    let currentDocNumber = 1919; 
    
    const lastInvoiceData = await lastInvoiceRes.json();
    if (lastInvoiceData.QueryResponse?.Invoice?.length > 0) {
      const lastVal = lastInvoiceData.QueryResponse.Invoice[0].DocNumber;
      const parsed = parseInt(lastVal.replace(/\D/g, ''));
      
      // If QB has a number like 2000, we use 2001. 
      // If QB has 1005 (or nothing), we stick to 1919.
      if (!isNaN(parsed) && (parsed + 1) > currentDocNumber) {
        currentDocNumber = parsed + 1;
      }
    }
    // --- NEW LOGIC END ---

    // 4. Retry Loop for "Duplicate Number" Errors
    let attempts = 0;
    let successData = null;

    while (attempts < 5) {
      const lines = [];
      
      // Main product line
      const productLine = {
        Amount: pricing,
        DetailType: "SalesItemLineDetail",
        Description: `${product_type}\n${specifications}`,
        SalesItemLineDetail: { 
          Qty: quantity || 1, 
          UnitPrice: pricing / (quantity || 1)
        }
      };
      
      // Mark as taxable if not tax exempt
      if (!is_tax_exempt) {
        productLine.SalesItemLineDetail.TaxCodeRef = { value: "1" };
      }
      lines.push(productLine);

      // Shipping line if applicable
      if (shipping_charge && shipping_charge > 0) {
        const shippingLine = {
          Amount: shipping_charge,
          DetailType: "SalesItemLineDetail",
          Description: "Shipping",
          SalesItemLineDetail: {
            Qty: 1,
            UnitPrice: shipping_charge
          }
        };
        
        // Shipping is typically taxable too
        if (!is_tax_exempt) {
          shippingLine.SalesItemLineDetail.TaxCodeRef = { value: "1" };
        }
        lines.push(shippingLine);
      }

      const invoicePayload = {
        DocNumber: currentDocNumber.toString(),
        CustomerRef: { value: quickbooks_customer_id },
        BillEmail: { Address: email },
        AllowOnlineCreditCardPayment: true,
        AllowOnlineACHPayment: true,
        Line: lines,
        SalesTermRef: { value: "1" }
      };

      // Add shipping address for QB tax calculation
      if (ship_to_address) {
        invoicePayload.ShipAddr = {
          Line1: ship_to_address,
          CountrySubDivisionCode: "NJ",
          Country: "US"
        };
      }

      // Add tax config
      if (!is_tax_exempt) {
        // Let QB auto-calculate based on shipping address
        invoicePayload.TxnTaxDetail = {
          TxnTaxCodeRef: { value: "1" }
        };
      } else {
        // Tax exempt
        invoicePayload.TxnTaxDetail = {
          DefaultTaxCodeRef: { value: "2" }
        };
      }

      console.log(`Attempt ${attempts + 1}: Creating Invoice #${currentDocNumber}...`);
      
      const createRes = await fetch(`${baseUrl}/invoice?minorversion=65`, {
        method: 'POST', headers: apiHeaders, body: JSON.stringify(invoicePayload)
      });

      const createData = await createRes.json();

      if (createRes.ok) {
        successData = createData;
        break; // Success! Exit loop.
      } else {
        // Check for "Duplicate Document Number" (Error Code 6140)
        const error = createData.Fault?.Error?.[0];
        if (error && error.code === "6140") {
          console.warn(`Invoice #${currentDocNumber} exists. Retrying...`);
          currentDocNumber++; // Increment and loop again
          attempts++;
        } else {
          // Real error, stop.
          throw new Error(`QB Error: ${error?.Message || JSON.stringify(createData)}`);
        }
      }
    }

    if (!successData) throw new Error("Failed to find a unique Invoice Number after 5 attempts.");

    // 5. Handle Payment Link (Retry Logic)
    const newInvoiceId = successData.Invoice.Id;
    let finalLink = successData.Invoice.InvoiceLink;

    if (!finalLink) {
      console.log("Waiting for link generation...");
      await wait(2000); 
      const readRes = await fetch(`${baseUrl}/invoice/${newInvoiceId}?minorversion=65&include=invoiceLink`, { headers: apiHeaders });
      const readData = await readRes.json();
      finalLink = readData.Invoice?.InvoiceLink;
    }

    // Fallback Deep Link if payments are off
    if (!finalLink) {
      finalLink = `https://app.qbo.intuit.com/app/invoice?txnId=${newInvoiceId}`;
    }

    // 6. Update Base44 Database
    try {
      const base44 = createClientFromRequest(req);
      if (base44) await base44.asServiceRole.entities.Order.update(order_id, { quickbooks_invoice_id: newInvoiceId });
    } catch (e) {}

    return Response.json({
      success: true,
      invoice_id: newInvoiceId,
      invoice_number: successData.Invoice.DocNumber,
      invoice_link: finalLink
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 200 });
  }
});