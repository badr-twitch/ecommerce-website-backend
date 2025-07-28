const twilio = require('twilio');

class SMSService {
  constructor() {
    // Check if SMS configuration is available
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
      console.warn('⚠️ SMS configuration missing. SMS service will be disabled.');
      this.client = null;
      this.enabled = false;
      return;
    }

    // Initialize Twilio client
    try {
      this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
      this.enabled = true;
      console.log('✅ SMS service initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing SMS service:', error);
      this.client = null;
      this.enabled = false;
    }
  }

  // Send verification SMS
  async sendVerificationSMS(phoneNumber, verificationCode) {
    if (!this.enabled || !this.client) {
      console.warn('⚠️ SMS service is disabled. Skipping SMS send.');
      return { success: true, messageId: 'sms-disabled' };
    }

    try {
      const message = await this.client.messages.create({
        body: `UMOD: Votre code de vérification est ${verificationCode}. Ce code expire dans 10 minutes.`,
        from: this.phoneNumber,
        to: phoneNumber
      });

      console.log('✅ SMS verification sent successfully:', message.sid);
      return { success: true, messageId: message.sid };
    } catch (error) {
      console.error('❌ Error sending SMS verification:', error);
      return { success: false, error: error.message };
    }
  }

  // Test SMS configuration
  async testConnection() {
    if (!this.enabled || !this.client) {
      console.warn('⚠️ SMS service is disabled');
      return false;
    }

    try {
      // Test by trying to get account info
      const account = await this.client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
      console.log('✅ SMS service configured successfully');
      return true;
    } catch (error) {
      console.error('❌ SMS service configuration error:', error);
      return false;
    }
  }
}

module.exports = new SMSService(); 