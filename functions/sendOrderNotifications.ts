import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { customer_name, company_name, product_type, pricing, shipping_info, invoice_number } = await req.json();

    const emails = [
      'design@oramadigitaldesign.com',
      'panos@oramadigitaldesign.com',
      'joanna@uppercaseprinting.com',
      'orders@oramadigitaldesign.com'
    ];

    const emailBody = `A customer has placed a reorder:

Customer: ${customer_name}
Company: ${company_name || 'N/A'}
Product: ${product_type}
Amount: $${pricing.toFixed(2)}
Shipping: ${shipping_info}

Invoice #${invoice_number} has been created in QuickBooks and the task has been added to Monday.com.`;

    // Use Base44's built-in SendEmail integration
    const emailPromises = emails.map(email =>
      base44.integrations.Core.SendEmail({
        from_name: 'Orama Reorder Portal',
        to: email,
        subject: `Reorder Placed - ${product_type}`,
        body: emailBody
      })
    );

    await Promise.all(emailPromises);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Email error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});