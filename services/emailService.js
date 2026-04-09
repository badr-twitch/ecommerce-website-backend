const sgMail = require('@sendgrid/mail');
const fs = require('fs').promises;
const path = require('path');

class EmailService {
  constructor() {
    // Check if SendGrid API key is available
    if (!process.env.SENDGRID_API_KEY) {
      console.warn('⚠️ SendGrid API key missing. Email service will be disabled.');
      this.enabled = false;
      return;
    }

    // Initialize SendGrid
    try {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      this.fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@umod.ma';
      this.fromName = process.env.SENDGRID_FROM_NAME || 'UMOD';
      this.enabled = true;
      console.log('✅ SendGrid email service initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing SendGrid email service:', error);
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
    if (!this.enabled) {
      console.warn('⚠️ Email service is disabled. Skipping email send.');
      return { success: true, messageId: 'email-disabled' };
    }

    try {
      const htmlContent = await this.loadTemplate('deleteAccountEmail', {
        userName: userName,
        userEmail: userEmail,
        verificationCode: verificationCode
      });

      const msg = {
        to: userEmail,
        from: {
          email: this.fromEmail,
          name: this.fromName
        },
        subject: '🔐 Confirmation de suppression de compte - UMOD',
        html: htmlContent,
        text: this.generateTextVersion(userName, verificationCode)
      };

      const result = await sgMail.send(msg);
      console.log('✅ Delete verification email sent successfully:', result[0]?.headers['x-message-id']);
      return { success: true, messageId: result[0]?.headers['x-message-id'] || 'sent' };
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

  // Send current phone number verification email
  async sendPhoneVerificationEmail(userEmail, userName, verificationCode, currentPhoneNumber) {
    if (!this.enabled) {
      console.warn('⚠️ Email service is disabled. Skipping email send.');
      return { success: true, messageId: 'email-disabled' };
    }

    try {
      const htmlContent = await this.loadTemplate('phoneVerificationEmail', {
        userName: userName,
        userEmail: userEmail,
        verificationCode: verificationCode,
        currentPhoneNumber: currentPhoneNumber
      });

      const msg = {
        to: userEmail,
        from: {
          email: this.fromEmail,
          name: this.fromName
        },
        subject: '📱 Vérification de votre numéro de téléphone - UMOD',
        html: htmlContent,
        text: this.generatePhoneVerificationTextVersion(userName, verificationCode, currentPhoneNumber)
      };

      const result = await sgMail.send(msg);
      console.log('✅ Phone verification email sent successfully:', result[0]?.headers['x-message-id']);
      console.log('📧 Email details:', {
        from: msg.from,
        to: msg.to,
        subject: msg.subject,
        messageId: result[0]?.headers['x-message-id']
      });
      return { success: true, messageId: result[0]?.headers['x-message-id'] || 'sent' };
    } catch (error) {
      console.error('❌ Error sending phone verification email:', error);
      return { success: true, messageId: 'email-error' };
    }
  }

  // Send phone number change verification email
  async sendPhoneChangeVerificationEmail(userEmail, userName, verificationCode, newPhoneNumber) {
    if (!this.enabled) {
      console.warn('⚠️ Email service is disabled. Skipping email send.');
      return { success: true, messageId: 'email-disabled' };
    }

    try {
      const htmlContent = await this.loadTemplate('phoneChangeEmail', {
        userName: userName,
        userEmail: userEmail,
        verificationCode: verificationCode,
        newPhoneNumber: newPhoneNumber
      });

      const msg = {
        to: userEmail,
        from: {
          email: this.fromEmail,
          name: this.fromName
        },
        subject: '📱 Vérification du changement de numéro de téléphone - UMOD',
        html: htmlContent,
        text: this.generatePhoneChangeTextVersion(userName, verificationCode, newPhoneNumber)
      };

      const result = await sgMail.send(msg);
      console.log('✅ Phone change verification email sent successfully:', result[0]?.headers['x-message-id']);
      return { success: true, messageId: result[0]?.headers['x-message-id'] || 'sent' };
    } catch (error) {
      console.error('❌ Error sending phone change verification email:', error);
      return { success: true, messageId: 'email-error' };
    }
  }

  // Send password reset email
  async sendPasswordResetEmail(userEmail, userName, resetToken, resetUrl) {
    if (!this.enabled) {
      console.warn('⚠️ Email service is disabled. Skipping email send.');
      return { success: true, messageId: 'email-disabled' };
    }

    try {
      const htmlContent = await this.loadTemplate('passwordResetEmail', {
        userName: userName,
        userEmail: userEmail,
        resetUrl: resetUrl,
        resetToken: resetToken
      });

      const msg = {
        to: userEmail,
        from: {
          email: this.fromEmail,
          name: this.fromName
        },
        subject: '🔐 Réinitialisation de votre mot de passe - UMOD',
        html: htmlContent,
        text: this.generatePasswordResetTextVersion(userName, resetUrl)
      };

      const result = await sgMail.send(msg);
      console.log('✅ Password reset email sent successfully:', result[0]?.headers['x-message-id']);
      return { success: true, messageId: result[0]?.headers['x-message-id'] || 'sent' };
    } catch (error) {
      console.error('❌ Error sending password reset email:', error);
      console.error('❌ SendGrid error details:', {
        code: error.code,
        message: error.message,
        response: error.response?.body,
        errors: error.response?.body?.errors
      });
      
      // Provide helpful error messages
      if (error.code === 403) {
        console.error('⚠️ SendGrid 403 Forbidden - Common causes:');
        console.error('   1. API key is invalid or missing Mail Send permissions');
        console.error('   2. From email address is not verified in SendGrid');
        console.error('   3. API key is restricted and doesn\'t allow this operation');
        console.error('   Check your SendGrid dashboard: https://app.sendgrid.com/');
      }
      
      return { success: false, messageId: 'email-error', error: error.message };
    }
  }

  // Generate text version of password reset email
  generatePasswordResetTextVersion(userName, resetUrl) {
    return `
Réinitialisation de votre mot de passe - UMOD

Bonjour ${userName},

Nous avons reçu une demande de réinitialisation de votre mot de passe.
Pour créer un nouveau mot de passe, cliquez sur le lien ci-dessous :

${resetUrl}

⚠️ IMPORTANT:
- Ce lien expire dans 1 heure
- Si vous n'avez pas demandé cette réinitialisation, ignorez cet email
- Votre mot de passe actuel restera valide si vous n'utilisez pas ce lien

Pour toute question, contactez-nous à support@umod.ma

© 2024 UMOD. Tous droits réservés.
    `.trim();
  }

  // Send email verification email
  async sendEmailVerificationEmail(userEmail, userName, verificationToken, verificationUrl) {
    if (!this.enabled) {
      console.warn('⚠️ Email service is disabled. Skipping email send.');
      return { success: true, messageId: 'email-disabled' };
    }

    try {
      const htmlContent = await this.loadTemplate('emailVerification', {
        userName: userName,
        userEmail: userEmail,
        verificationUrl: verificationUrl,
        verificationToken: verificationToken
      });

      const msg = {
        to: userEmail,
        from: {
          email: this.fromEmail,
          name: this.fromName
        },
        subject: '✉️ Vérifiez votre adresse email - UMOD',
        html: htmlContent,
        text: this.generateEmailVerificationTextVersion(userName, verificationUrl)
      };

      const result = await sgMail.send(msg);
      console.log('✅ Email verification sent successfully:', result[0]?.headers['x-message-id']);
      return { success: true, messageId: result[0]?.headers['x-message-id'] || 'sent' };
    } catch (error) {
      console.error('❌ Error sending email verification:', error);
      console.error('❌ SendGrid error details:', {
        code: error.code,
        message: error.message,
        response: error.response?.body,
        errors: error.response?.body?.errors
      });
      
      if (error.code === 403) {
        console.error('⚠️ SendGrid 403 Forbidden - Check API key permissions and verified sender');
      }
      
      return { success: false, messageId: 'email-error', error: error.message };
    }
  }

  // Generate text version of email verification
  generateEmailVerificationTextVersion(userName, verificationUrl) {
    return `
Vérification de votre adresse email - UMOD

Bonjour ${userName},

Merci de vous être inscrit sur UMOD !
Pour activer votre compte, veuillez vérifier votre adresse email en cliquant sur le lien ci-dessous :

${verificationUrl}

⚠️ IMPORTANT:
- Ce lien expire dans 24 heures
- Si vous n'avez pas créé de compte, ignorez cet email

Pour toute question, contactez-nous à support@umod.ma

© 2024 UMOD. Tous droits réservés.
    `.trim();
  }

  // Generate text version of the current phone verification email
  generatePhoneVerificationTextVersion(userName, verificationCode, currentPhoneNumber) {
    return `
Vérification de votre numéro de téléphone - UMOD

Bonjour ${userName},

Nous avons reçu une demande de modification de votre numéro de téléphone.
Pour autoriser cette modification, veuillez utiliser le code de vérification ci-dessous.

Numéro de téléphone actuel: ${currentPhoneNumber}
Code de vérification: ${verificationCode}

⚠️ IMPORTANT:
- Ce code expire dans 10 minutes
- Si vous n'avez pas demandé cette modification, ignorez cet email
- Ce code est requis pour changer ou supprimer votre numéro de téléphone

Pour toute question, contactez-nous à support@umod.fr

© 2024 UMOD. Tous droits réservés.
    `.trim();
  }

  // Generate text version of the phone change email
  generatePhoneChangeTextVersion(userName, verificationCode, newPhoneNumber) {
    return `
Vérification du changement de numéro de téléphone - UMOD

Bonjour ${userName},

Nous avons reçu une demande de changement de votre numéro de téléphone.
Pour confirmer ce changement, veuillez utiliser le code de vérification ci-dessous.

Nouveau numéro de téléphone: ${newPhoneNumber}
Code de vérification: ${verificationCode}

⚠️ IMPORTANT:
- Ce code expire dans 10 minutes
- Si vous n'avez pas demandé ce changement, ignorez cet email
- Une fois confirmé, l'ancien numéro sera remplacé définitivement

Pour toute question, contactez-nous à support@umod.fr

© 2024 UMOD. Tous droits réservés.
    `.trim();
  }

  // -------------------------------------------------------------------------
  // Order & Welcome Emails
  // -------------------------------------------------------------------------

  // Send order confirmation email
  async sendOrderConfirmationEmail(order, orderItems, user) {
    if (!this.enabled) {
      console.warn('⚠️ Email service disabled — skipping order confirmation email');
      return { success: true, messageId: 'email-disabled' };
    }

    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

      // Build items rows HTML
      const itemsRows = orderItems.map(item => `
        <tr>
          <td>${item.productName || 'Produit'}</td>
          <td style="text-align:center">${item.quantity}</td>
          <td style="text-align:right">${Number(item.totalPrice).toFixed(2)} DH</td>
        </tr>
      `).join('');

      const htmlContent = await this.loadTemplate('orderConfirmation', {
        orderNumber: order.orderNumber,
        customerName: `${order.customerFirstName} ${order.customerLastName}`,
        itemsRows,
        subtotal: Number(order.subtotal).toFixed(2),
        shippingAmount: Number(order.shippingAmount).toFixed(2),
        taxAmount: Number(order.taxAmount).toFixed(2),
        totalAmount: Number(order.totalAmount).toFixed(2),
        shippingAddress: order.shippingAddress,
        shippingCity: order.shippingCity,
        shippingPostalCode: order.shippingPostalCode,
        shippingCountry: order.shippingCountry,
        ordersUrl: `${frontendUrl}/orders`
      });

      const msg = {
        to: order.customerEmail,
        from: { email: this.fromEmail, name: this.fromName },
        subject: `Confirmation de commande ${order.orderNumber} - UMOD`,
        html: htmlContent,
        text: `Bonjour ${order.customerFirstName},\n\nVotre commande ${order.orderNumber} d'un montant de ${Number(order.totalAmount).toFixed(2)} DH a bien été confirmée.\n\nMerci pour votre achat !\n\nUMOD`
      };

      const result = await sgMail.send(msg);
      console.log('✅ Order confirmation email sent to', order.customerEmail);
      return { success: true, messageId: result[0]?.headers['x-message-id'] || 'sent' };
    } catch (error) {
      console.error('❌ Error sending order confirmation email:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Send order status update email
  async sendOrderStatusUpdateEmail(order, user, oldStatus, newStatus) {
    if (!this.enabled) {
      console.warn('⚠️ Email service disabled — skipping order status update email');
      return { success: true, messageId: 'email-disabled' };
    }

    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

      const statusLabels = {
        pending: 'En attente',
        confirmed: 'Confirmée',
        processing: 'En cours de traitement',
        shipped: 'Expédiée',
        delivered: 'Livrée',
        cancelled: 'Annulée',
        refunded: 'Remboursée'
      };

      const statusIcons = {
        confirmed: '✅',
        processing: '⚙️',
        shipped: '🚚',
        delivered: '📦',
        cancelled: '❌',
        refunded: '💰'
      };

      const statusMessages = {
        confirmed: 'Votre commande a été confirmée et sera bientôt préparée.',
        processing: 'Votre commande est en cours de préparation.',
        shipped: 'Votre commande a été expédiée ! Vous la recevrez bientôt.',
        delivered: 'Votre commande a été livrée. Nous espérons que vous en êtes satisfait(e) !',
        cancelled: 'Votre commande a été annulée. Si vous avez des questions, contactez-nous.',
        refunded: 'Votre remboursement a été initié. Il sera crédité sous 5 à 10 jours ouvrés.'
      };

      // Tracking section (only for shipped orders)
      let trackingSection = '';
      if (newStatus === 'shipped' && order.trackingNumber) {
        trackingSection = `
          <div class="tracking-box">
            <h3>📦 Numéro de suivi</h3>
            <p class="tracking-number">${order.trackingNumber}</p>
          </div>
        `;
      }

      const customerName = user
        ? `${user.firstName} ${user.lastName}`
        : `${order.customerFirstName} ${order.customerLastName}`;

      const htmlContent = await this.loadTemplate('orderStatusUpdate', {
        orderNumber: order.orderNumber,
        customerName,
        oldStatusLabel: statusLabels[oldStatus] || oldStatus,
        newStatusLabel: statusLabels[newStatus] || newStatus,
        statusIcon: statusIcons[newStatus] || '📋',
        statusMessage: statusMessages[newStatus] || 'Le statut de votre commande a été mis à jour.',
        trackingSection,
        orderUrl: `${frontendUrl}/orders/${order.id}`
      });

      const recipientEmail = user?.email || order.customerEmail;

      const msg = {
        to: recipientEmail,
        from: { email: this.fromEmail, name: this.fromName },
        subject: `${statusIcons[newStatus] || '📋'} Commande ${order.orderNumber} — ${statusLabels[newStatus] || newStatus}`,
        html: htmlContent,
        text: `Bonjour ${customerName},\n\nLe statut de votre commande ${order.orderNumber} est passé de "${statusLabels[oldStatus]}" à "${statusLabels[newStatus]}".\n\n${statusMessages[newStatus] || ''}\n\nUMOD`
      };

      const result = await sgMail.send(msg);
      console.log('✅ Order status update email sent to', recipientEmail);
      return { success: true, messageId: result[0]?.headers['x-message-id'] || 'sent' };
    } catch (error) {
      console.error('❌ Error sending order status update email:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Send welcome email on registration
  async sendWelcomeEmail(userEmail, userName) {
    if (!this.enabled) {
      console.warn('⚠️ Email service disabled — skipping welcome email');
      return { success: true, messageId: 'email-disabled' };
    }

    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

      const htmlContent = await this.loadTemplate('welcomeEmail', {
        userName,
        shopUrl: `${frontendUrl}/products`
      });

      const msg = {
        to: userEmail,
        from: { email: this.fromEmail, name: this.fromName },
        subject: 'Bienvenue sur UMOD ! 🎉',
        html: htmlContent,
        text: `Bienvenue sur UMOD, ${userName} !\n\nVotre compte a été créé avec succès. Découvrez nos produits sur ${frontendUrl}/products\n\nÀ bientôt !\nUMOD`
      };

      const result = await sgMail.send(msg);
      console.log('✅ Welcome email sent to', userEmail);
      return { success: true, messageId: result[0]?.headers['x-message-id'] || 'sent' };
    } catch (error) {
      console.error('❌ Error sending welcome email:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Test email configuration
  async testConnection() {
    if (!this.enabled) {
      console.warn('⚠️ Email service is disabled');
      return false;
    }

    try {
      // SendGrid doesn't have a verify method, so we'll just check if API key is set
      if (process.env.SENDGRID_API_KEY) {
        console.log('✅ SendGrid email service configured successfully');
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Email service configuration error:', error);
      return false;
    }
  }

  // Send notification email
  async sendNotificationEmail(email, userName, title, message, data = {}) {
    if (!this.enabled) return false;

    try {
      const priorityColors = {
        critical: '#dc2626',
        high: '#ea580c',
        medium: '#2563eb',
        low: '#059669'
      };
      const color = priorityColors[data.priority] || '#2563eb';

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1e3a5f, #2563eb); padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">UMOD - Notification</h1>
          </div>
          <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="color: #374151; margin-bottom: 8px;">Bonjour ${userName},</p>
            <div style="border-left: 4px solid ${color}; padding: 12px 16px; background: #f9fafb; border-radius: 4px; margin: 16px 0;">
              <h2 style="color: #111827; margin: 0 0 8px 0; font-size: 16px;">${title}</h2>
              <p style="color: #6b7280; margin: 0; font-size: 14px;">${message}</p>
            </div>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
              Vous recevez cet email car les notifications par email sont activées pour ce type de notification.
              Vous pouvez modifier vos préférences dans les paramètres de notification.
            </p>
          </div>
          <div style="background: #f3f4f6; padding: 12px; border-radius: 0 0 8px 8px; text-align: center;">
            <p style="color: #9ca3af; font-size: 11px; margin: 0;">&copy; ${new Date().getFullYear()} UMOD. Tous droits réservés.</p>
          </div>
        </div>
      `;

      await sgMail.send({
        to: email,
        from: { email: this.fromEmail, name: this.fromName },
        subject: `[UMOD] ${title}`,
        html
      });

      console.log(`📧 Notification email sent to ${email}: ${title}`);
      return true;
    } catch (error) {
      console.error('❌ Error sending notification email:', error);
      return false;
    }
  }
}

module.exports = new EmailService(); 