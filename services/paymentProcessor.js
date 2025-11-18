// This is a mock payment processor service
// In production, you would integrate with Stripe, PayPal, or another payment processor

class PaymentProcessorService {
  constructor() {
    // In production, this would be your payment processor configuration
    this.processorType = process.env.PAYMENT_PROCESSOR || 'stripe';
    this.apiKey = process.env.PAYMENT_PROCESSOR_API_KEY;
  }

  // Create a payment method token (this would call Stripe/PayPal API)
  async createPaymentMethod(cardData) {
    try {
      // In production, this would make an API call to your payment processor
      // For now, we'll simulate the process
      
      // Validate card data
      this.validateCardData(cardData);
      
      // Simulate API call to payment processor
      const processorResponse = await this.callPaymentProcessorAPI(cardData);
      
      return {
        success: true,
        processorId: processorResponse.id,
        last4: cardData.cardNumber.slice(-4),
        brand: this.detectCardBrand(cardData.cardNumber),
        type: 'card',
        expiry: cardData.expiry,
        cardholderName: cardData.cardholderName
      };
    } catch (error) {
      console.error('Payment processor error:', error);
      throw new Error('Erreur lors de la création de la méthode de paiement');
    }
  }

  // Validate card data
  validateCardData(cardData) {
    const { cardNumber, expiry, cardholderName, cvv } = cardData;
    
    if (!cardNumber || cardNumber.replace(/\s/g, '').length !== 16) {
      throw new Error('Numéro de carte invalide');
    }
    
    if (!expiry || !/^\d{2}\/\d{2}$/.test(expiry)) {
      throw new Error('Date d\'expiration invalide');
    }
    
    if (!cardholderName || cardholderName.trim().length < 2) {
      throw new Error('Nom du titulaire invalide');
    }
    
    if (!cvv || !/^\d{3,4}$/.test(cvv)) {
      throw new Error('Code CVV invalide');
    }
  }

  // Detect card brand based on number
  detectCardBrand(cardNumber) {
    if (!cardNumber) {
      return 'unknown';
    }

    const number = cardNumber.replace(/\s/g, '');

    if (/^4/.test(number)) return 'visa';
    if (/^5[1-5]/.test(number)) return 'mastercard';
    if (/^3[47]/.test(number)) return 'amex';
    if (/^6/.test(number)) return 'discover';

    return 'unknown';
  }

  // Simulate payment processor API call
  async callPaymentProcessorAPI(cardData) {
    if (!cardData?.cardNumber) {
      throw new Error('Card number is required to create a payment method');
    }
    // In production, this would be a real API call
    // For now, we'll simulate the response
    
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          id: `pm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'card',
          card: {
            brand: this.detectCardBrand(cardData.cardNumber),
            last4: cardData.cardNumber.slice(-4),
            exp_month: parseInt(cardData.expiry.split('/')[0]),
            exp_year: parseInt('20' + cardData.expiry.split('/')[1])
          }
        });
      }, 1000); // Simulate network delay
    });
  }

  // Process a payment (for actual purchases)
  async processPayment(paymentMethodId, amount, currency = 'MAD', metadata = {}) {
    if (!paymentMethodId) {
      throw new Error('Identifiant de méthode de paiement manquant');
    }

    if (!amount || Number(amount) <= 0) {
      throw new Error('Montant de paiement invalide');
    }

    const normalizedAmount = Number(amount);

    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
          amount: normalizedAmount,
          currency,
          status: 'succeeded',
          paymentMethodId,
          processedAt: new Date().toISOString(),
          metadata,
        });
      }, 600);
    });
  }

  // Delete a payment method from the processor
  async deletePaymentMethod(processorId) {
    try {
      // In production, this would call the payment processor's delete API
      console.log(`Deleting payment method: ${processorId}`);
      return { success: true };
    } catch (error) {
      console.error('Error deleting payment method:', error);
      throw new Error('Erreur lors de la suppression de la méthode de paiement');
    }
  }
}

module.exports = new PaymentProcessorService(); 