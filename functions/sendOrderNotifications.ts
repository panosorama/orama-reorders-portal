import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { customer_name, company_name, product_type, pricing, shipping_info, invoice_number, mockup_url } = await req.json();

    const emails = [
      'design@oramadigitaldesign.com',
      'panos@oramadigitaldesign.com',
      'joanna@uppercaseprinting.com',
      'orders@oramadigitaldesign.com'
    ];

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .order-item { background: white; padding: 20px; margin-bottom: 15px; border-radius: 6px; border-left: 4px solid #EF4444; }
    .label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
    .value { font-size: 16px; color: #1f2937; margin-top: 5px; }
    .amount { font-size: 24px; font-weight: bold; color: #EF4444; }
    .footer { color: #6b7280; font-size: 12px; margin-top: 20px; padding-top: 15px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">📋 New Reorder Placed</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Invoice #${invoice_number}</p>
    </div>
    <div class="content">
      ${mockup_url ? `<div style="margin-bottom: 20px;">
        <img src="${mockup_url}" alt="${product_type}" style="width: 100%; border-radius: 6px; max-height: 300px; object-fit: cover;" />
      </div>` : ''}
      <div class="order-item">
        <div class="label">Customer</div>
        <div class="value">${customer_name}</div>
      </div>
      ${company_name ? `<div class="order-item">
        <div class="label">Company</div>
        <div class="value">${company_name}</div>
      </div>` : ''}
      <div class="order-item">
        <div class="label">Product Type</div>
        <div class="value">${product_type}</div>
      </div>
      <div class="order-item">
        <div class="label">Amount</div>
        <div class="amount">$${pricing.toFixed(2)}</div>
      </div>
      <div class="order-item">
        <div class="label">Shipping</div>
        <div class="value">${shipping_info}</div>
      </div>
      <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
        <p style="color: #059669; font-weight: 600;">✓ Invoice created in QuickBooks</p>
        <p style="color: #059669; font-weight: 600;">✓ Task added to Monday.com</p>
      </div>
      <div class="footer">
        <p style="margin: 0;">This is an automated notification from the Orama Reorder Portal.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    // Check for Resend API key
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      throw new Error('RESEND_API_KEY not configured');
    }

    // Send emails using Resend API directly (for external recipients)
    const results = [];
    for (const email of emails) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'notifications@oramareorders.com',
          to: email,
          subject: `Reorder Placed - ${product_type}`,
          html: htmlBody
        })
      }).then(r => r.json());
      results.push(res);

      // Delay 3 seconds between sends
      if (emails.indexOf(email) < emails.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    // Check for any Resend API errors
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      throw new Error(`Resend API error: ${errors[0].error?.message || 'Unknown error'}`);
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Email error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});