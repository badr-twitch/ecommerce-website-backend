const request = require('supertest');
const express = require('express');
const admin = require('firebase-admin');
const { buildUser, buildProduct, buildOrder, buildOrderItem } = require('../../helpers/factories');

// Mock all dependencies
jest.mock('../../../models/Order');
jest.mock('../../../models/OrderItem');
jest.mock('../../../models/Product');
jest.mock('../../../models/User');
jest.mock('../../../services/paymentProcessor');
jest.mock('../../../services/emailService', () => ({
  sendOrderConfirmationEmail: jest.fn().mockResolvedValue({ success: true }),
  sendOrderStatusUpdateEmail: jest.fn().mockResolvedValue({ success: true }),
}));

const Order = require('../../../models/Order');
const OrderItem = require('../../../models/OrderItem');
const Product = require('../../../models/Product');
const User = require('../../../models/User');
const paymentProcessor = require('../../../services/paymentProcessor');

function buildApp() {
  const app = express();
  app.use(express.json());
  const { router: orderRoutes, setNotificationService } = require('../../../routes/orders');
  // Set a mock notification service
  setNotificationService({
    notifyNewOrder: jest.fn().mockResolvedValue(),
    notifyOrderStatusChange: jest.fn().mockResolvedValue(),
  });
  app.use('/api/orders', orderRoutes);
  return app;
}

function mockAuthenticated(firebaseUid = 'firebase-uid-123') {
  admin.__mocks.verifyIdToken.mockResolvedValue({
    uid: firebaseUid,
    email: 'test@example.com',
    email_verified: true,
  });
}

describe('Orders Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockAuthenticated();
  });

  describe('POST /api/orders/create-payment-intent', () => {
    it('creates a payment intent for authenticated user', async () => {
      const mockUser = buildUser();
      User.findOne.mockResolvedValue(mockUser);
      paymentProcessor.getOrCreateCustomer.mockResolvedValue({ id: 'cus_test' });
      paymentProcessor.createPaymentIntent.mockResolvedValue({
        clientSecret: 'pi_secret_test',
        paymentIntentId: 'pi_test_123',
      });

      const res = await request(app)
        .post('/api/orders/create-payment-intent')
        .set('Authorization', 'Bearer valid-token')
        .send({ amount: 99.99 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.clientSecret).toBe('pi_secret_test');
      expect(res.body.paymentIntentId).toBe('pi_test_123');
      // Amount should be converted to centimes (99.99 * 100 = 9999)
      expect(paymentProcessor.createPaymentIntent).toHaveBeenCalledWith(
        9999, 'mad', { userId: mockUser.id }, 'cus_test'
      );
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app)
        .post('/api/orders/create-payment-intent')
        .send({ amount: 50 });

      expect(res.status).toBe(401);
    });

    it('returns 400 with invalid amount', async () => {
      User.findOne.mockResolvedValue(buildUser());

      const res = await request(app)
        .post('/api/orders/create-payment-intent')
        .set('Authorization', 'Bearer valid-token')
        .send({ amount: -10 });

      expect(res.status).toBe(400);
    });

    it('returns 404 when user not found in database', async () => {
      // firebaseAuth middleware sets req.firebaseUser but User.findOne returns null for both
      User.findOne.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/orders/create-payment-intent')
        .set('Authorization', 'Bearer valid-token')
        .send({ amount: 50 });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/orders', () => {
    const validOrderBody = {
      items: [{ productId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', quantity: 2 }],
      customerFirstName: 'Test',
      customerLastName: 'User',
      customerEmail: 'test@example.com',
      customerPhone: '+33600000000',
      billingAddress: '123 Rue Test',
      billingCity: 'Paris',
      billingPostalCode: '75001',
      billingCountry: 'France',
      shippingAddress: '123 Rue Test',
      shippingCity: 'Paris',
      shippingPostalCode: '75001',
      shippingCountry: 'France',
      paymentMethod: 'card',
      paymentIntentId: 'pi_test_123',
    };

    beforeEach(() => {
      const mockUser = buildUser();
      User.findOne.mockResolvedValue(mockUser);
    });

    it('creates order when Stripe payment succeeded', async () => {
      paymentProcessor.retrievePaymentIntent.mockResolvedValue({ status: 'succeeded' });

      const mockProduct = buildProduct({
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        stockQuantity: 50,
        getDiscountedPrice: jest.fn().mockReturnValue(29.99),
      });
      Product.findByPk.mockResolvedValue(mockProduct);
      Product.decrement = jest.fn().mockResolvedValue();

      const mockOrder = buildOrder();
      mockOrder.toJSON = jest.fn().mockReturnValue(mockOrder);
      Order.create.mockResolvedValue(mockOrder);
      OrderItem.bulkCreate = jest.fn().mockResolvedValue([]);

      // For the findByPk after creation (get order with items)
      const orderWithItems = { ...mockOrder, orderItems: [] };
      orderWithItems.toJSON = jest.fn().mockReturnValue(orderWithItems);
      Order.findByPk.mockResolvedValue(orderWithItems);
      User.findByPk = jest.fn().mockResolvedValue(buildUser());

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', 'Bearer valid-token')
        .send(validOrderBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentStatus: 'paid',
          paymentTransactionId: 'pi_test_123',
        })
      );
    });

    it('returns 400 when Stripe payment not succeeded', async () => {
      paymentProcessor.retrievePaymentIntent.mockResolvedValue({
        status: 'requires_payment_method',
      });

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', 'Bearer valid-token')
        .send(validOrderBody);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('paiement');
    });

    it('returns 400 when product stock is insufficient', async () => {
      paymentProcessor.retrievePaymentIntent.mockResolvedValue({ status: 'succeeded' });

      const mockProduct = buildProduct({
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        stockQuantity: 1, // Only 1 in stock, but ordering 2
        name: 'Low Stock Product',
        getDiscountedPrice: jest.fn().mockReturnValue(29.99),
      });
      Product.findByPk.mockResolvedValue(mockProduct);

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', 'Bearer valid-token')
        .send(validOrderBody);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Stock insuffisant');
    });

    it('returns 400 with validation errors for missing fields', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', 'Bearer valid-token')
        .send({ items: [] }); // Empty items and missing required fields

      expect(res.status).toBe(400);
    });

    it('decrements product stock after order creation', async () => {
      paymentProcessor.retrievePaymentIntent.mockResolvedValue({ status: 'succeeded' });

      const mockProduct = buildProduct({
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        stockQuantity: 50,
        getDiscountedPrice: jest.fn().mockReturnValue(29.99),
      });
      Product.findByPk.mockResolvedValue(mockProduct);
      Product.decrement = jest.fn().mockResolvedValue();

      const mockOrder = buildOrder();
      Order.create.mockResolvedValue(mockOrder);
      OrderItem.bulkCreate = jest.fn().mockResolvedValue([]);
      Order.findByPk.mockResolvedValue({ ...mockOrder, orderItems: [] });
      User.findByPk = jest.fn().mockResolvedValue(buildUser());

      await request(app)
        .post('/api/orders')
        .set('Authorization', 'Bearer valid-token')
        .send(validOrderBody);

      expect(Product.decrement).toHaveBeenCalledWith('stockQuantity', {
        by: 2,
        where: { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
      });
    });
  });

  describe('GET /api/orders', () => {
    it('returns user orders with pagination', async () => {
      const mockUser = buildUser();
      User.findOne.mockResolvedValue(mockUser);

      const orders = [buildOrder(), buildOrder()];
      Order.findAndCountAll.mockResolvedValue({ count: 2, rows: orders });

      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.orders).toHaveLength(2);
      expect(res.body.pagination).toBeDefined();
    });

    it('filters orders by status', async () => {
      const mockUser = buildUser();
      User.findOne.mockResolvedValue(mockUser);
      Order.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

      await request(app)
        .get('/api/orders?status=shipped')
        .set('Authorization', 'Bearer valid-token');

      expect(Order.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'shipped' }),
        })
      );
    });
  });

  describe('POST /api/orders/:id/cancel', () => {
    it('cancels order and restores stock', async () => {
      const mockUser = buildUser();
      User.findOne.mockResolvedValue(mockUser);

      const mockOrder = buildOrder({ status: 'pending' });
      mockOrder.canBeCancelled = jest.fn().mockReturnValue(true);
      mockOrder.toJSON = jest.fn().mockReturnValue({ ...mockOrder, status: 'cancelled' });
      Order.findOne.mockResolvedValue(mockOrder);

      const orderItems = [buildOrderItem({ quantity: 2 })];
      OrderItem.findAll.mockResolvedValue(orderItems);
      Product.increment = jest.fn().mockResolvedValue();
      User.findByPk = jest.fn().mockResolvedValue(mockUser);

      const res = await request(app)
        .post(`/api/orders/${mockOrder.id}/cancel`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'cancelled' })
      );
      expect(Product.increment).toHaveBeenCalledWith('stockQuantity', {
        by: 2,
        where: { id: orderItems[0].productId },
      });
    });

    it('returns 400 for shipped order', async () => {
      const mockUser = buildUser();
      User.findOne.mockResolvedValue(mockUser);

      const mockOrder = buildOrder({ status: 'shipped' });
      mockOrder.canBeCancelled = jest.fn().mockReturnValue(false);
      Order.findOne.mockResolvedValue(mockOrder);

      const res = await request(app)
        .post(`/api/orders/${mockOrder.id}/cancel`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('annulée');
    });

    it('returns 404 for non-existent order', async () => {
      User.findOne.mockResolvedValue(buildUser());
      Order.findOne.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/orders/nonexistent-id/cancel')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/orders/:id/status (admin)', () => {
    it('admin can update order status', async () => {
      const adminUser = buildUser({ role: 'admin', isActive: true });
      User.findOne.mockResolvedValue(adminUser);

      const mockOrder = buildOrder({ status: 'pending' });
      mockOrder.toJSON = jest.fn().mockReturnValue({ ...mockOrder, status: 'confirmed' });
      Order.findByPk.mockResolvedValue(mockOrder);
      User.findByPk = jest.fn().mockResolvedValue(adminUser);

      const res = await request(app)
        .put(`/api/orders/${mockOrder.id}/status`)
        .set('Authorization', 'Bearer valid-token')
        .send({ status: 'confirmed' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'confirmed',
          confirmedAt: expect.any(Date),
        })
      );
    });

    it('returns 403 for non-admin users', async () => {
      const clientUser = buildUser({ role: 'client', isActive: true });
      User.findOne.mockResolvedValue(clientUser);

      const res = await request(app)
        .put('/api/orders/some-id/status')
        .set('Authorization', 'Bearer valid-token')
        .send({ status: 'confirmed' });

      expect(res.status).toBe(403);
    });

    it('returns 400 for invalid status', async () => {
      const adminUser = buildUser({ role: 'admin', isActive: true });
      User.findOne.mockResolvedValue(adminUser);

      const res = await request(app)
        .put('/api/orders/some-id/status')
        .set('Authorization', 'Bearer valid-token')
        .send({ status: 'invalid-status' });

      expect(res.status).toBe(400);
    });

    it('sets shippedAt and trackingNumber when status is shipped', async () => {
      const adminUser = buildUser({ role: 'admin', isActive: true });
      User.findOne.mockResolvedValue(adminUser);

      const mockOrder = buildOrder({ status: 'confirmed' });
      mockOrder.toJSON = jest.fn().mockReturnValue(mockOrder);
      Order.findByPk.mockResolvedValue(mockOrder);
      User.findByPk = jest.fn().mockResolvedValue(adminUser);

      await request(app)
        .put(`/api/orders/${mockOrder.id}/status`)
        .set('Authorization', 'Bearer valid-token')
        .send({ status: 'shipped', trackingNumber: 'TRACK-12345' });

      expect(mockOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'shipped',
          shippedAt: expect.any(Date),
          trackingNumber: 'TRACK-12345',
        })
      );
    });
  });

  describe('GET /api/orders/track/:orderNumber', () => {
    it('returns order for valid order number and email', async () => {
      const mockOrder = buildOrder({ orderNumber: 'ORD-123', customerEmail: 'test@example.com' });
      mockOrder.toJSON = jest.fn().mockReturnValue(mockOrder);
      Order.findOne.mockResolvedValue(mockOrder);

      const res = await request(app)
        .get('/api/orders/track/ORD-123?email=test@example.com');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 404 for wrong email', async () => {
      Order.findOne.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/orders/track/ORD-123?email=wrong@example.com');

      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid email format', async () => {
      const res = await request(app)
        .get('/api/orders/track/ORD-123?email=not-email');

      expect(res.status).toBe(400);
    });
  });
});
