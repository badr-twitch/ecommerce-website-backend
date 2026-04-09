const request = require('supertest');
const express = require('express');
const admin = require('firebase-admin');
const { buildUser, buildProduct } = require('../../helpers/factories');

// Mock database BEFORE models (models call sequelize.define at import time)
jest.mock('../../../config/database', () => ({
  define: jest.fn(() => ({
    findAll: jest.fn(), findOne: jest.fn(), findByPk: jest.fn(),
    findAndCountAll: jest.fn(), create: jest.fn(), bulkCreate: jest.fn(),
    update: jest.fn(), destroy: jest.fn(), count: jest.fn(), sum: jest.fn(),
    increment: jest.fn(), decrement: jest.fn(),
    belongsTo: jest.fn(), hasMany: jest.fn(), hasOne: jest.fn(), belongsToMany: jest.fn(),
    addScope: jest.fn(), scope: jest.fn().mockReturnThis(), prototype: {},
  })),
  authenticate: jest.fn().mockResolvedValue(),
  sync: jest.fn().mockResolvedValue(),
  fn: jest.fn(), col: jest.fn(), literal: jest.fn(),
}));

// Mock models/index.js to prevent association loading
jest.mock('../../../models/index', () => ({}));

// Now mock individual models — these override what sequelize.define returns
jest.mock('../../../models/Product');
jest.mock('../../../models/Category');
jest.mock('../../../models/Review');
jest.mock('../../../models/User');

// Mock express-rate-limit
jest.mock('express-rate-limit', () => jest.fn(() => (req, res, next) => next()));

const Product = require('../../../models/Product');
const User = require('../../../models/User');

function buildApp() {
  const app = express();
  app.use(express.json());
  const productRoutes = require('../../../routes/products');
  app.use('/api/products', productRoutes);
  return app;
}

function mockAuthenticated(firebaseUid = 'firebase-uid-123') {
  admin.__mocks.verifyIdToken.mockResolvedValue({
    uid: firebaseUid,
    email: 'test@example.com',
    email_verified: true,
  });
}

describe('Products Routes', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/products', () => {
    it('returns paginated product list', async () => {
      const products = [buildProduct(), buildProduct()];
      products.forEach(p => {
        p.toJSON = jest.fn().mockReturnValue({ ...p, averageRating: 0, reviewCount: 0 });
      });
      Product.findAndCountAll.mockResolvedValue({ count: 2, rows: products });

      const res = await request(app).get('/api/products');

      expect(res.status).toBe(200);
      expect(res.body.products).toHaveLength(2);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.totalItems).toBe(2);
    });

    it('supports pagination params', async () => {
      Product.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

      const res = await request(app).get('/api/products?page=2&limit=5');

      expect(res.status).toBe(200);
      expect(Product.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 5,
          offset: 5,
        })
      );
    });

    it('filters by category', async () => {
      Product.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
      const catId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

      const res = await request(app).get(`/api/products?category=${catId}`);

      expect(res.status).toBe(200);
      expect(Product.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ categoryId: catId }),
        })
      );
    });

    it('filters by price range', async () => {
      Product.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

      const res = await request(app).get('/api/products?minPrice=10&maxPrice=50');

      expect(res.status).toBe(200);
      const callArgs = Product.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.price).toBeDefined();
    });

    it('returns 400 for invalid query params', async () => {
      const res = await request(app).get('/api/products?page=-1');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/products/:id', () => {
    it('returns a single product with reviews', async () => {
      const product = buildProduct();
      product.toJSON = jest.fn().mockReturnValue({
        ...product,
        reviews: [{ rating: 4 }, { rating: 5 }],
      });
      Product.findOne.mockResolvedValue(product);

      const res = await request(app).get(`/api/products/${product.id}`);

      expect(res.status).toBe(200);
      expect(res.body.product).toBeDefined();
      expect(res.body.product.averageRating).toBe('4.5');
      expect(res.body.product.reviewCount).toBe(2);
    });

    it('returns 404 when product not found', async () => {
      Product.findOne.mockResolvedValue(null);

      const res = await request(app).get('/api/products/nonexistent-id');

      expect(res.status).toBe(404);
    });

    it('returns averageRating 0 when no reviews', async () => {
      const product = buildProduct();
      product.toJSON = jest.fn().mockReturnValue({ ...product, reviews: [] });
      Product.findOne.mockResolvedValue(product);

      const res = await request(app).get(`/api/products/${product.id}`);

      expect(res.status).toBe(200);
      expect(res.body.product.averageRating).toBe(0);
      expect(res.body.product.reviewCount).toBe(0);
    });
  });

  describe('POST /api/products (admin)', () => {
    beforeEach(() => {
      mockAuthenticated();
    });

    it('creates a product when admin is authenticated', async () => {
      const adminUser = buildUser({ role: 'admin', isActive: true });
      User.findOne.mockResolvedValue(adminUser);

      const newProduct = buildProduct();
      newProduct.toJSON = jest.fn().mockReturnValue(newProduct);
      Product.create = jest.fn().mockResolvedValue(newProduct);

      const res = await request(app)
        .post('/api/products')
        .set('Authorization', 'Bearer valid-token')
        .send({
          name: 'New Product',
          description: 'A detailed description for this test product',
          price: 29.99,
          sku: 'TEST-001',
          categoryId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          stockQuantity: 100,
        });

      expect(res.status).toBe(201);
      expect(Product.create).toHaveBeenCalled();
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app)
        .post('/api/products')
        .send({ name: 'Test' });

      expect(res.status).toBe(401);
    });

    it('returns 403 for non-admin users', async () => {
      const clientUser = buildUser({ role: 'client', isActive: true });
      User.findOne.mockResolvedValue(clientUser);

      const res = await request(app)
        .post('/api/products')
        .set('Authorization', 'Bearer valid-token')
        .send({
          name: 'New Product',
          description: 'A detailed description for this test product',
          price: 29.99,
          sku: 'TEST-001',
          categoryId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          stockQuantity: 100,
        });

      expect(res.status).toBe(403);
    });

    it('returns 400 with validation errors', async () => {
      const adminUser = buildUser({ role: 'admin', isActive: true });
      User.findOne.mockResolvedValue(adminUser);

      const res = await request(app)
        .post('/api/products')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'X' }); // Too short, missing required fields

      expect(res.status).toBe(400);
    });
  });
});
