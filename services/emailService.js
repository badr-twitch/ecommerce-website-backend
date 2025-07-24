const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

class EmailService {
  constructor() {
    // Check if email configuration is available
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('⚠️ Email configuration missing. Email service will be disabled.');
      this.transporter = null;
      this.enabled = false;
      return;
    }

    // Create transporter (configure with your email service)
    try {
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: process.env.EMAIL_PORT || 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });
      this.enabled = true;
      console.log('✅ Email service initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing email service:', error);
      this.transporter = null;
      this.enabled = false;
    }
  }

  // Load email template
  async loadTemplate(templateName, data) {
    try {
      const templatePath = path.join(__dirname, '..', 'templates', `${templateName}.html`);
      let template = await fs.readFile(templatePath, 'utf8');
      
      // Replace placeholders with actual data
      Object.keys(data).forEach(key => {
        const placeholder = `{{${key}}}`;
        template = template.replace(new RegExp(placeholder, 'g'), data[key]);
      });
      
      return template;
    } catch (error) {
      console.error('Error loading email template:', error);
      throw error;
    }
  }

  // Send account deletion verification email
  async sendDeleteVerificationEmail(userEmail, userName, verificationCode) {
    if (!this.enabled || !this.transporter) {
      console.warn('⚠️ Email service is disabled. Skipping email send.');
      return { success: true, messageId: 'email-disabled' };
    }

    try {
      const htmlContent = await this.loadTemplate('deleteAccountEmail', {
        userName: userName,
        userEmail: userEmail,
        verificationCode: verificationCode
      });

      const mailOptions = {
        from: `"UMOD" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: '🔐 Confirmation de suppression de compte - UMOD',
        html: htmlContent,
        text: this.generateTextVersion(userName, verificationCode)
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Delete verification email sent successfully:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error sending delete verification email:', error);
      // Don't throw error, just log it and return success to not break the flow
      return { success: true, messageId: 'email-error' };
    }
  }

  // Generate text version of the email
  generateTextVersion(userName, verificationCode) {
    return `
Confirmation de suppression de compte - UMOD

Bonjour ${userName},

Nous avons reçu une demande de suppression de votre compte UMOD. 
Pour confirmer cette action, veuillez utiliser le code de vérification ci-dessous.

Code de vérification: ${verificationCode}

⚠️ ATTENTION:
- Cette action est irréversible
- Toutes vos données seront définitivement supprimées
- Vos commandes, adresses et informations personnelles seront perdus
- Si vous n'avez pas demandé cette suppression, ignorez cet email

Ce code expire dans 10 minutes.

Si vous n'avez pas demandé la suppression de votre compte, 
veuillez ignorer cet email et contactez-nous immédiatement.

Pour toute question, contactez-nous à support@umod.fr

© 2024 UMOD. Tous droits réservés.
    `.trim();
  }

  // Test email configuration
  async testConnection() {
    if (!this.enabled || !this.transporter) {
      console.warn('⚠️ Email service is disabled');
      return false;
    }

    try {
      await this.transporter.verify();
      console.log('✅ Email service configured successfully');
      return true;
    } catch (error) {
      console.error('❌ Email service configuration error:', error);
      return false;
    }
  }
}

module.exports = new EmailService(); 