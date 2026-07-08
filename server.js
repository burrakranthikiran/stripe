const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { query, withTransaction } = require('./db');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware for parsing JSON for non-webhook routes
app.use((req, res, next) => {
  if (req.originalUrl === '/webhook') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

/**
 * POST /webhook
 * Stripe webhook endpoint
 */
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error(`❌ Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const eventId = event.id;
  console.log(`📬 Received Stripe event: ${event.type} (ID: ${eventId})`);

  try {
    const result = await withTransaction(async (connection) => {
      // 1. Idempotency Check: check if event has already been processed using FOR UPDATE lock
      const [rows] = await connection.execute(
        'SELECT event_id FROM processed_events WHERE event_id = ? FOR UPDATE',
        [eventId]
      );

      if (rows.length > 0) {
        return { duplicate: true };
      }

      // Mark the event as processed inside the transaction
      await connection.execute(
        'INSERT INTO processed_events (event_id) VALUES (?)',
        [eventId]
      );

      // 2. Process specific webhook events
      const stripeObject = event.data.object;

      switch (event.type) {
        case 'invoice.payment_succeeded': {
          const customerId = stripeObject.customer;
          const subscriptionId = stripeObject.subscription;
          // Extract plan/price ID and current period end date
          const plan = stripeObject.lines?.data?.[0]?.price?.id || 'unknown_plan';
          const currentPeriodEnd = stripeObject.lines?.data?.[0]?.period?.end || null;
          const status = 'active';

          if (!customerId) {
            console.warn('⚠️ No customer ID found in invoice.payment_succeeded payload');
            break;
          }

          // Insert or update subscription
          await connection.execute(
            `INSERT INTO subscriptions (customer_id, subscription_id, plan, status, current_period_end)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               subscription_id = VALUES(subscription_id),
               plan = VALUES(plan),
               status = VALUES(status),
               current_period_end = VALUES(current_period_end)`,
            [customerId, subscriptionId, plan, status, currentPeriodEnd]
          );
          console.log(`✅ [invoice.payment_succeeded] Updated customer subscription: ${customerId}`);
          break;
        }

        case 'invoice.payment_failed': {
          const customerId = stripeObject.customer;
          const status = 'past_due';

          if (!customerId) {
            console.warn('⚠️ No customer ID found in invoice.payment_failed payload');
            break;
          }

          // Update status only (never cancel subscription here)
          await connection.execute(
            `UPDATE subscriptions SET status = ? WHERE customer_id = ?`,
            [status, customerId]
          );
          console.log(`⚠️ [invoice.payment_failed] Updated status to past_due for customer: ${customerId}`);
          break;
        }

        case 'customer.subscription.deleted': {
          const customerId = stripeObject.customer;
          const currentPeriodEnd = stripeObject.current_period_end || null;
          const status = 'cancelled';

          if (!customerId) {
            console.warn('⚠️ No customer ID found in customer.subscription.deleted payload');
            break;
          }

          // Update status to cancelled and set current_period_end
          await connection.execute(
            `UPDATE subscriptions SET status = ?, current_period_end = ? WHERE customer_id = ?`,
            [status, currentPeriodEnd, customerId]
          );
          console.log(`❌ [customer.subscription.deleted] Cancelled subscription for customer: ${customerId}`);
          break;
        }

        default:
          console.log(`ℹ️ Event type ${event.type} not explicitly handled. Ignoring.`);
      }

      return { duplicate: false };
    });

    if (result.duplicate) {
      console.log(`ℹ️ Event ${eventId} was already processed. Ignoring.`);
      return res.status(200).json({ received: true, message: 'Duplicate event ignored' });
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error(`❌ Error processing event ${eventId}:`, error);
    return res.status(500).json({ error: 'Database transaction failed' });
  }
});

/**
 * GET /subscriptions/:customerId
 * Retrieves the current subscription details for a specific customer
 */
app.get('/subscriptions/:customerId', async (req, res) => {
  const { customerId } = req.params;

  try {
    const rows = await query(
      `SELECT customer_id, subscription_id, plan, status, current_period_end 
       FROM subscriptions 
       WHERE customer_id = ?`,
      [customerId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found for the given customer ID' });
    }

    // Return the subscription record in the requested JSON format
    const sub = rows[0];
    return res.json({
      customer_id: sub.customer_id,
      subscription_id: sub.subscription_id,
      plan: sub.plan,
      status: sub.status,
      current_period_end: Number(sub.current_period_end)
    });
  } catch (error) {
    console.error(`❌ Error reading subscription for ${customerId}:`, error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Start the Express server
app.listen(port, () => {
  console.log(`🚀 Stripe Webhook Server listening on port ${port}`);
});
