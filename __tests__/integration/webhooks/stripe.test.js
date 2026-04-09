const request = require('supertest');
const express = require('express');
const { buildOrder } = require('../../helpers/factories');

// Mock dependencies
jest.mock('../../../services/paymentProcessor');
jest.mock('../../../models/Order');

const paymentProcessor = require('../../../services/paymentProcessor');
const Order = require('../../../models/Order');

/**
 * Build a minimal Express app with just the Stripe webhook route.
 * This mirrors the setup in server.js where raw body parsing is used.
 */
function buildApp() {
  const app = express();

  // Stripe webhook needs raw body (same as server.js)
  app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];

    try {
      const event = paymentProcessor.constructWebhookEvent(req.body, sig);

      switch (event.type) {
        case 'payment_intent.succeeded': {
          const pi = event.data.object;
          const order = await Order.findOne({ where: { paymentTransactionId: pi.id } });
          if (order && order.paymentStatus !== 'paid') {
            await order.update({ paymentStatus: 'paid' });
          }
          break;
        }
        case 'payment_intent.payment_failed': {
          const pi = event.data.object;
          const order = await Order.findOne({ where: { paymentTransactionId: pi.id } });
          if (order) {
            await order.update({ paymentStatus: 'failed' });
          }
          break;
        }
        default:
          break;
      }

      res.json({ received: true });
    } catch (err) {
      res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }
  });

  return app;
}

describe('Stripe Webhook', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  describe('payment_intent.succeeded', () => {
    it('updates order paymentStatus to paid', async () => {
      const mockOrder = buildOrder({ paymentStatus: 'pending', paymentTransactionId: 'pi_success_123' });
      Order.findOne.mockResolvedValue(mockOrder);

      paymentProcessor.constructWebhookEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_success_123' } },
      });

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'valid_sig')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ type: 'payment_intent.succeeded' }));

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(Order.findOne).toHaveBeenCalledWith({
        where: { paymentTransactionId: 'pi_success_123' },
      });
      expect(mockOrder.update).toHaveBeenCalledWith({ paymentStatus: 'paid' });
    });

    it('does not update order if already paid', async () => {
      const mockOrder = buildOrder({ paymentStatus: 'paid', paymentTransactionId: 'pi_already_paid' });
      Order.findOne.mockResolvedValue(mockOrder);

      paymentProcessor.constructWebhookEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_already_paid' } },
      });

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'valid_sig')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({}));

      expect(res.status).toBe(200);
      expect(mockOrder.update).not.toHaveBeenCalled();
    });

    it('handles case where order is not found', async () => {
      Order.findOne.mockResolvedValue(null);

      paymentProcessor.constructWebhookEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_no_order' } },
      });

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'valid_sig')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({}));

      expect(res.status).toBe(200);
    });
  });

  describe('payment_intent.payment_failed', () => {
    it('updates order paymentStatus to failed', async () => {
      const mockOrder = buildOrder({ paymentStatus: 'pending', paymentTransactionId: 'pi_fail_123' });
      Order.findOne.mockResolvedValue(mockOrder);

      paymentProcessor.constructWebhookEvent.mockReturnValue({
        type: 'payment_intent.payment_failed',
        data: { object: { id: 'pi_fail_123' } },
      });

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'valid_sig')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({}));

      expect(res.status).toBe(200);
      expect(mockOrder.update).toHaveBeenCalledWith({ paymentStatus: 'failed' });
    });
  });

  describe('invalid signature', () => {
    it('returns 400 for invalid webhook signature', async () => {
      paymentProcessor.constructWebhookEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature');
      });

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'invalid_sig')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({}));

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Webhook Error');
    });
  });

  describe('unknown event type', () => {
    it('acknowledges unknown event types', async () => {
      paymentProcessor.constructWebhookEvent.mockReturnValue({
        type: 'charge.refunded',
        data: { object: {} },
      });

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'valid_sig')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({}));

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });
  });
});
