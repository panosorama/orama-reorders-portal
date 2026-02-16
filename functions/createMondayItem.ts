import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { order_id, customer_name, company_name, product_type, specifications, pricing } = await req.json();

    const apiKey = Deno.env.get('MONDAY_API_KEY');
    const boardId = Deno.env.get('MONDAY_BOARD_ID');
    const groupId = Deno.env.get('MONDAY_GROUP_ID');

    // Create item in Monday board
    const createItemMutation = `
      mutation {
        create_item (
          board_id: ${boardId},
          group_id: "${groupId}",
          item_name: "${company_name || customer_name} - ${product_type}"
        ) {
          id
        }
      }
    `;

    const createResponse = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: createItemMutation })
    });

    const createData = await createResponse.json();

    if (createData.errors) {
      throw new Error(createData.errors[0].message);
    }

    const itemId = createData.data.create_item.id;

    // Add update with order details
    const updateText = `Customer: ${customer_name}${company_name ? ` (${company_name})` : ''}\nProduct: ${product_type}\nPrice: $${pricing}\n\nSpecifications:\n${specifications}`;

    const addUpdateMutation = `
      mutation {
        create_update (
          item_id: ${itemId},
          body: "${updateText.replace(/\n/g, '\\n').replace(/"/g, '\\"')}"
        ) {
          id
        }
      }
    `;

    await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: addUpdateMutation })
    });

    // Update order with Monday item ID (keep status as available for reuse)
    await base44.asServiceRole.entities.Order.update(order_id, {
      monday_item_id: itemId
    });

    return Response.json({
      success: true,
      item_id: itemId
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});