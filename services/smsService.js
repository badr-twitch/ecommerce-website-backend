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
      console.warn('⚠️ Check environment variables: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER');
      return { success: false, error: 'SMS service is disabled. Please configure Twilio credentials.' };
    }

    try {
      console.log('📱 Attempting to send SMS:', {
        to: phoneNumber,
        from: this.phoneNumber,
        codeLength: verificationCode.length
      });

      const message = await this.client.messages.create({
        body: `UMOD: Votre code de vérification est ${verificationCode}. Ce code expire dans 10 minutes.`,
        from: this.phoneNumber,
        to: phoneNumber
      });

      console.log('✅ SMS verification sent successfully:', {
        messageSid: message.sid,
        status: message.status,
        to: phoneNumber
      });
      return { success: true, messageId: message.sid };
    } catch (error) {
      console.error('❌ Error sending SMS verification:', error);
      console.error('❌ Twilio error details:', {
        code: error.code,
        message: error.message,
        status: error.status,
        moreInfo: error.moreInfo
      });

      // Provide helpful error messages
      if (error.code === 21211) {
        return { success: false, error: 'Numéro de téléphone invalide. Utilisez le format international (ex: +33678398091)' };
      } else if (error.code === 21608) {
        return { success: false, error: 'Numéro Twilio non vérifié. Vérifiez votre configuration Twilio.' };
      } else if (error.code === 21614) {
        return { success: false, error: 'Numéro de téléphone non valide pour les SMS.' };
      } else if (error.status === 400) {
        return { success: false, error: `Erreur Twilio: ${error.message}` };
      }

      return { success: false, error: error.message || 'Erreur lors de l\'envoi du SMS' };
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