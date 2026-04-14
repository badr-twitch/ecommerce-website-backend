require('dotenv').config();
const sgMail = require('@sendgrid/mail');

const apiKey = process.env.SENDGRID_API_KEY;
const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@umod.ma';
const fromName = process.env.SENDGRID_FROM_NAME || 'UMOD';

if (!apiKey) {
  console.error('❌ SENDGRID_API_KEY missing');
  process.exit(1);
}

sgMail.setApiKey(apiKey);

// Send to self — fromEmail is verified, so inbox delivery should work
(async () => {
  console.log(`📤 Sending test email: ${fromEmail} → ${fromEmail}`);
  try {
    const [res] = await sgMail.send({
      to: fromEmail,
      from: { email: fromEmail, name: fromName },
      subject: '[UMOD] SendGrid test — please ignore',
      text: 'Si tu reçois ceci, SendGrid fonctionne correctement.',
      html: '<p>Si tu reçois ceci, SendGrid fonctionne correctement.</p>',
    });
    console.log(`✅ Sent — HTTP ${res.statusCode}, message id: ${res.headers['x-message-id']}`);
    console.log('   Check the inbox of', fromEmail);
  } catch (err) {
    console.error(`❌ Send failed — HTTP ${err.code || err.response?.statusCode || '?'}`);
    if (err.response?.body) {
      console.error('   Response body:', JSON.stringify(err.response.body, null, 2));
    } else {
      console.error('   Error:', err.message);
    }
    process.exit(1);
  }
})();
