// Mock Stripe before importing paymentProcessor
const mockPaymentIntentsCreate = jest.fn();
const mockPaymentIntentsRetrieve = jest.fn();
const mockCustomersCreate = jest.fn();
const mockCustomersRetrieve = jest.fn();
const mockSetupIntentsCreate = jest.fn();
const mockPaymentMethodsList = jest.fn();
const mockPaymentMethodsDetach = jest.fn();
const mockPaymentMethodsRetrieve = jest.fn();
const mockRefundsCreate = jest.fn();
const mockWebhooksConstructEvent = jest.fn();

jest.mock('stripe', () => {
  return jest.fn(() => ({
    paymentIntents: {
      create: mockPaymentIntentsCreate,
      retrieve: mockPaymentIntentsRetrieve,
    },
    customers: {
      create: mockCustomersCreate,
      retrieve: mockCustomersRetrieve,
    },
    setupIntents: {
      create: mockSetupIntentsCreate,
    },
    paymentMethods: {
      list: mockPaymentMethodsList,
      detach: mockPaymentMethodsDetach,
      retrieve: mockPaymentMethodsRetrieve,
    },
    refunds: {
      create: mockRefundsCreate,
    },
    webhooks: {
      constructEvent: mockWebhooksConstructEvent,
    },
  }));
});

// Clear the module cache so paymentProcessor gets a fresh instance
let paymentProcessor;

beforeEach(() => {
  jest.clearAllMocks();
  // Re-require to reset the singleton's internal state
  jest.resetModules();
  // Re-set env vars (setup.js sets them but resetModules clears require cache)
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_fake_secret';
  paymentProcessor = require('../../../services/paymentProcessor');
});

describe('PaymentProcessorService', () => {
  describe('getStripe()', () => {
    it('throws when STRIPE_SECRET_KEY is not set', () => {
      delete process.env.STRIPE_SECRET_KEY;
      // Need a fresh instance
      jest.resetModules();
      const pp = require('../../../services/paymentProcessor');

      expect(() => pp.getStripe()).toThrow('STRIPE_SECRET_KEY is not set');
    });

    it('initializes Stripe with the secret key', () => {
      const stripe = paymentProcessor.getStripe();
      expect(stripe).toBeDefined();
      expect(stripe.paymentIntents).toBeDefined();
    });

    it('returns the same Stripe instance on subsequent calls', () => {
      const stripe1 = paymentProcessor.getStripe();
      const stripe2 = paymentProcessor.getStripe();
      expect(stripe1).toBe(stripe2);
    });
  });

  describe('createPaymentIntent()', () => {
    it('creates a payment intent with correct params', async () => {
      mockPaymentIntentsCreate.mockResolvedValue({
        id: 'pi_test_123',
        client_secret: 'pi_test_123_secret',
      });

      const result = await paymentProcessor.createPaymentIntent(
        2999, 'mad', { orderId: 'order-1' }, 'cus_123'
      );

      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith({
        amount: 2999,
        currency: 'mad',
        metadata: { orderId: 'order-1' },
        automatic_payment_methods: { enabled: true },
        customer: 'cus_123',
      });
      expect(result).toEqual({
        clientSecret: 'pi_test_123_secret',
        paymentIntentId: 'pi_test_123',
      });
    });

    it('rounds amount to integer', async () => {
      mockPaymentIntentsCreate.mockResolvedValue({
        id: 'pi_test_123',
        client_secret: 'secret',
      });

      await paymentProcessor.createPaymentIntent(29.7);

      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 30 })
      );
    });

    it('defaults to MAD currency', async () => {
      mockPaymentIntentsCreate.mockResolvedValue({
        id: 'pi_test_123',
        client_secret: 'secret',
      });

      await paymentProcessor.createPaymentIntent(1000);

      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'mad' })
      );
    });

    it('omits customer when not provided', async () => {
      mockPaymentIntentsCreate.mockResolvedValue({
        id: 'pi_test_123',
        client_secret: 'secret',
      });

      await paymentProcessor.createPaymentIntent(1000, 'eur', {});

      const callArgs = mockPaymentIntentsCreate.mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('customer');
    });
  });

  describe('getOrCreateCustomer()', () => {
    it('retrieves existing customer when stripeCustomerId is set', async () => {
      const mockCustomer = { id: 'cus_existing' };
      mockCustomersRetrieve.mockResolvedValue(mockCustomer);

      const user = { stripeCustomerId: 'cus_existing', email: 'test@test.com' };
      const result = await paymentProcessor.getOrCreateCustomer(user);

      expect(mockCustomersRetrieve).toHaveBeenCalledWith('cus_existing');
      expect(mockCustomersCreate).not.toHaveBeenCalled();
      expect(result).toEqual(mockCustomer);
    });

    it('creates new customer and updates user when no stripeCustomerId', async () => {
      const mockCustomer = { id: 'cus_new_123' };
      mockCustomersCreate.mockResolvedValue(mockCustomer);

      const mockUpdate = jest.fn().mockResolvedValue();
      const user = {
        stripeCustomerId: null,
        email: 'test@test.com',
        firstName: 'Test',
        lastName: 'User',
        id: 'user-123',
        update: mockUpdate,
      };

      const result = await paymentProcessor.getOrCreateCustomer(user);

      expect(mockCustomersCreate).toHaveBeenCalledWith({
        email: 'test@test.com',
        name: 'Test User',
        metadata: { userId: 'user-123' },
      });
      expect(mockUpdate).toHaveBeenCalledWith({ stripeCustomerId: 'cus_new_123' });
      expect(result).toEqual(mockCustomer);
    });
  });

  describe('retrievePaymentIntent()', () => {
    it('retrieves a payment intent by ID', async () => {
      const mockPI = { id: 'pi_123', status: 'succeeded' };
      mockPaymentIntentsRetrieve.mockResolvedValue(mockPI);

      const result = await paymentProcessor.retrievePaymentIntent('pi_123');

      expect(mockPaymentIntentsRetrieve).toHaveBeenCalledWith('pi_123');
      expect(result).toEqual(mockPI);
    });
  });

  describe('refundPayment()', () => {
    it('creates full refund when amount is null', async () => {
      mockRefundsCreate.mockResolvedValue({ id: 're_123' });

      await paymentProcessor.refundPayment('pi_123');

      expect(mockRefundsCreate).toHaveBeenCalledWith({
        payment_intent: 'pi_123',
      });
    });

    it('creates partial refund with rounded amount', async () => {
      mockRefundsCreate.mockResolvedValue({ id: 're_123' });

      await paymentProcessor.refundPayment('pi_123', 1500.7);

      expect(mockRefundsCreate).toHaveBeenCalledWith({
        payment_intent: 'pi_123',
        amount: 1501,
      });
    });
  });

  describe('constructWebhookEvent()', () => {
    it('constructs event with correct params', () => {
      const mockEvent = { type: 'payment_intent.succeeded' };
      mockWebhooksConstructEvent.mockReturnValue(mockEvent);

      const result = paymentProcessor.constructWebhookEvent('raw-body', 'sig-header');

      expect(mockWebhooksConstructEvent).toHaveBeenCalledWith(
        'raw-body', 'sig-header', 'whsec_test_fake_secret'
      );
      expect(result).toEqual(mockEvent);
    });

    it('throws when STRIPE_WEBHOOK_SECRET is not set', () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
      jest.resetModules();
      const pp = require('../../../services/paymentProcessor');
      // Force stripe init
      pp.getStripe();

      expect(() => pp.constructWebhookEvent('body', 'sig')).toThrow(
        'STRIPE_WEBHOOK_SECRET is not set'
      );
    });
  });

  describe('createSetupIntent()', () => {
    it('creates setup intent for a customer', async () => {
      mockSetupIntentsCreate.mockResolvedValue({ client_secret: 'seti_secret' });

      const result = await paymentProcessor.createSetupIntent('cus_123');

      expect(mockSetupIntentsCreate).toHaveBeenCalledWith({
        customer: 'cus_123',
        automatic_payment_methods: { enabled: true },
      });
      expect(result).toEqual({ clientSecret: 'seti_secret' });
    });
  });
});
