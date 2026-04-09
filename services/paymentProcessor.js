const Stripe = require('stripe');

class PaymentProcessorService {
  constructor() {
    this.stripe = null;
  }

  // Lazy-init so the app can start without STRIPE_SECRET_KEY during development
  getStripe() {
    if (!this.stripe) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) {
        throw new Error(
          'STRIPE_SECRET_KEY is not set. Add it to your .env file. ' +
          'Get your key from https://dashboard.stripe.com/apikeys'
        );
      }
      this.stripe = new Stripe(key);
    }
    return this.stripe;
  }

  // ---------------------------------------------------------------------------
  // Customers
  // ---------------------------------------------------------------------------

  /**
   * Create a Stripe Customer for a user (call once, on first checkout or registration).
   * Returns the Stripe Customer object.
   */
  async getOrCreateCustomer(user) {
    if (user.stripeCustomerId) {
      return this.getStripe().customers.retrieve(user.stripeCustomerId);
    }

    const customer = await this.getStripe().customers.create({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      metadata: { userId: user.id }
    });

    // Persist the Stripe customer ID on the user record
    await user.update({ stripeCustomerId: customer.id });

    return customer;
  }

  // ---------------------------------------------------------------------------
  // Payment Intents (for checkout)
  // ---------------------------------------------------------------------------

  /**
   * Create a PaymentIntent for a given amount.
   * @param {number} amount - Amount in the smallest currency unit (centimes for MAD/EUR)
   * @param {string} currency - e.g. 'mad' or 'eur'
   * @param {object} metadata - Order metadata
   * @param {string} customerId - Stripe Customer ID (optional)
   * @returns {object} { clientSecret, paymentIntentId }
   */
  async createPaymentIntent(amount, currency = 'mad', metadata = {}, customerId = null) {
    const params = {
      amount: Math.round(amount), // must be integer (centimes)
      currency: currency.toLowerCase(),
      metadata,
      automatic_payment_methods: { enabled: true }
    };

    if (customerId) {
      params.customer = customerId;
    }

    const paymentIntent = await this.getStripe().paymentIntents.create(params);

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    };
  }

  /**
   * Retrieve a PaymentIntent to verify its status.
   */
  async retrievePaymentIntent(paymentIntentId) {
    return this.getStripe().paymentIntents.retrieve(paymentIntentId);
  }

  // ---------------------------------------------------------------------------
  // Payment Methods (saved cards)
  // ---------------------------------------------------------------------------

  /**
   * Create a SetupIntent so the frontend can collect card details for saving.
   * @param {string} customerId - Stripe Customer ID
   * @returns {object} { clientSecret }
   */
  async createSetupIntent(customerId) {
    const setupIntent = await this.getStripe().setupIntents.create({
      customer: customerId,
      automatic_payment_methods: { enabled: true }
    });

    return { clientSecret: setupIntent.client_secret };
  }

  /**
   * List payment methods attached to a Stripe Customer.
   */
  async listPaymentMethods(customerId) {
    const methods = await this.getStripe().paymentMethods.list({
      customer: customerId,
      type: 'card'
    });
    return methods.data;
  }

  /**
   * Detach (remove) a payment method from a customer.
   */
  async detachPaymentMethod(paymentMethodId) {
    return this.getStripe().paymentMethods.detach(paymentMethodId);
  }

  /**
   * Retrieve a single payment method by ID.
   */
  async retrievePaymentMethod(paymentMethodId) {
    return this.getStripe().paymentMethods.retrieve(paymentMethodId);
  }

  // ---------------------------------------------------------------------------
  // Off-session charges (memberships, renewals)
  // ---------------------------------------------------------------------------

  /**
   * Charge a saved payment method off-session (server-initiated).
   * Used for membership subscriptions and auto-renewals.
   * @param {number} amount - Amount in smallest currency unit (centimes)
   * @param {string} currency - e.g. 'mad'
   * @param {string} paymentMethodId - Stripe PaymentMethod ID (pm_xxx)
   * @param {string} customerId - Stripe Customer ID (cus_xxx)
   * @param {object} metadata - Additional metadata
   * @returns {object} { paymentIntentId, status, amount, currency }
   */
  async chargePaymentMethod(amount, currency, paymentMethodId, customerId, metadata = {}) {
    const paymentIntent = await this.getStripe().paymentIntents.create({
      amount: Math.round(amount),
      currency: currency.toLowerCase(),
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      metadata
    });

    return {
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency
    };
  }

  // ---------------------------------------------------------------------------
  // Refunds
  // ---------------------------------------------------------------------------

  /**
   * Refund a payment (full or partial).
   * @param {string} paymentIntentId
   * @param {number|null} amount - null for full refund, or amount in centimes
   */
  async refundPayment(paymentIntentId, amount = null) {
    const params = { payment_intent: paymentIntentId };
    if (amount) {
      params.amount = Math.round(amount);
    }
    return this.getStripe().refunds.create(params);
  }

  // ---------------------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------------------

  /**
   * Verify and construct a Stripe webhook event.
   */
  constructWebhookEvent(rawBody, signature) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not set');
    }
    return this.getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  }
}

module.exports = new PaymentProcessorService();
