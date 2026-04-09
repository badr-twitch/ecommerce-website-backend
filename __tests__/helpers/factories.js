const { v4: uuidv4 } = require('uuid');

// Use a simple UUID-like generator if uuid isn't installed
const makeId = () => {
  try {
    return uuidv4();
  } catch {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
};

/**
 * Build a mock User object matching the Sequelize model shape
 */
function buildUser(overrides = {}) {
  const id = overrides.id || makeId();
  return {
    id,
    firebaseUid: `firebase_${id.slice(0, 8)}`,
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    phone: '+33612345678',
    role: 'client',
    userType: 'particulier',
    isActive: true,
    emailVerified: true,
    profilePhoto: null,
    stripeCustomerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    // Sequelize instance methods
    update: jest.fn().mockImplementation(function (data) {
      Object.assign(this, data);
      return Promise.resolve(this);
    }),
    toJSON: jest.fn().mockImplementation(function () {
      const { update, toJSON, save, destroy, ...plain } = this;
      return plain;
    }),
    save: jest.fn().mockResolvedValue(this),
    destroy: jest.fn().mockResolvedValue(this),
    ...overrides,
  };
}

/**
 * Build a mock Product object
 */
function buildProduct(overrides = {}) {
  const id = overrides.id || makeId();
  return {
    id,
    name: 'Test Product',
    description: 'A test product',
    price: 29.99,
    originalPrice: 39.99,
    currency: 'MAD',
    stockQuantity: 100,
    minStockLevel: 10,
    images: [],
    mainImage: null,
    brand: 'TestBrand',
    rating: 4.5,
    reviewCount: 10,
    onSale: false,
    featured: false,
    isActive: true,
    categoryId: makeId(),
    createdAt: new Date(),
    updatedAt: new Date(),
    update: jest.fn().mockImplementation(function (data) {
      Object.assign(this, data);
      return Promise.resolve(this);
    }),
    toJSON: jest.fn().mockImplementation(function () {
      const { update, toJSON, save, destroy, ...plain } = this;
      return plain;
    }),
    save: jest.fn().mockResolvedValue(this),
    destroy: jest.fn().mockResolvedValue(this),
    ...overrides,
  };
}

/**
 * Build a mock Order object
 */
function buildOrder(overrides = {}) {
  const id = overrides.id || makeId();
  return {
    id,
    orderNumber: `ORD-${Date.now()}`,
    userId: makeId(),
    status: 'pending',
    paymentStatus: 'pending',
    paymentMethod: 'card',
    paymentTransactionId: `pi_test_${id.slice(0, 8)}`,
    subtotal: 59.98,
    taxAmount: 12.00,
    shippingAmount: 5.00,
    discount: 0,
    totalAmount: 76.98,
    shippingAddress: {
      fullName: 'Test User',
      address: '123 Test St',
      city: 'Paris',
      postalCode: '75001',
      country: 'France',
      phone: '+33612345678',
    },
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    update: jest.fn().mockImplementation(function (data) {
      Object.assign(this, data);
      return Promise.resolve(this);
    }),
    toJSON: jest.fn().mockImplementation(function () {
      const { update, toJSON, save, destroy, ...plain } = this;
      return plain;
    }),
    save: jest.fn().mockResolvedValue(this),
    destroy: jest.fn().mockResolvedValue(this),
    ...overrides,
  };
}

/**
 * Build a mock OrderItem object
 */
function buildOrderItem(overrides = {}) {
  return {
    id: overrides.id || makeId(),
    orderId: makeId(),
    productId: makeId(),
    productName: 'Test Product',
    quantity: 2,
    price: 29.99,
    discount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

module.exports = { buildUser, buildProduct, buildOrder, buildOrderItem, makeId };
