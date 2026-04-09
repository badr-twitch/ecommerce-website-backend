// Jest global setup — runs before each test file

// Set test environment
process.env.NODE_ENV = 'test';

// Dummy env vars so modules don't crash on import
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
  type: 'service_account',
  project_id: 'test-project',
  private_key_id: 'test-key-id',
  private_key: '-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJBALRc\n-----END RSA PRIVATE KEY-----\n',
  client_email: 'test@test-project.iam.gserviceaccount.com',
  client_id: '123456789',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
});
process.env.FIREBASE_DATABASE_URL = 'https://test-project.firebaseio.com';
process.env.FIREBASE_STORAGE_BUCKET = 'test-project.appspot.com';

process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'ecommerce_test';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'test';

process.env.PORT = '0'; // Random port for supertest
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.BCRYPT_ROUNDS = '1'; // Fast hashing in tests

process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_fake_secret';

process.env.SENDGRID_API_KEY = 'SG.test_fake_key';
process.env.TWILIO_ACCOUNT_SID = 'AC_test_fake';
process.env.TWILIO_AUTH_TOKEN = 'test_fake_token';
process.env.TWILIO_PHONE_NUMBER = '+15555555555';

// Silence console.log in tests (keep errors visible)
jest.spyOn(console, 'log').mockImplementation(() => {});
