const request = require('supertest');
const express = require('express');
const admin = require('firebase-admin');
const { buildUser } = require('../../helpers/factories');

// Mock all external dependencies — NO resetModules (breaks admin reference)
jest.mock('../../../models/User');
jest.mock('../../../models/VerificationCode');
jest.mock('../../../services/emailService', () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue({ success: true }),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('../../../services/smsService', () => ({
  sendVerificationSMS: jest.fn().mockResolvedValue({ success: true }),
}));
// Mock express-rate-limit to be a no-op in tests
// The auth.js route uses: const { rateLimit } = require('express-rate-limit');
jest.mock('express-rate-limit', () => ({
  rateLimit: jest.fn(() => (req, res, next) => next()),
  __esModule: true,
  default: jest.fn(() => (req, res, next) => next()),
}));

const User = require('../../../models/User');
const emailService = require('../../../services/emailService');

// Build app once — rate limiter is mocked so no state leaks
function buildApp() {
  const app = express();
  app.use(express.json());
  const { router: authRoutes } = require('../../../routes/auth');
  app.use('/api/auth', authRoutes);
  return app;
}

function mockAuthenticated(firebaseUid = 'firebase-uid-123') {
  admin.__mocks.verifyIdToken.mockResolvedValue({
    uid: firebaseUid,
    email: 'test@example.com',
    email_verified: true,
  });
}

describe('Auth Routes', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticated();
  });

  describe('GET /api/auth/me', () => {
    it('returns current user profile', async () => {
      const mockUser = buildUser();
      User.findOne.mockResolvedValue(mockUser);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toBeDefined();
    });

    it('returns 401 without auth token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns 404 when user not in database', async () => {
      User.findOne.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/auth/user', () => {
    it('returns user by Firebase UID', async () => {
      const mockUser = buildUser();
      User.findOne.mockResolvedValue(mockUser);

      const res = await request(app)
        .get('/api/auth/user')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/auth/register-firebase', () => {
    it('creates a new user when not in database', async () => {
      const newUser = buildUser();
      // First call: firebaseAuth middleware lookup — no user yet
      // Second call: route handler lookup — still no user
      User.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      User.create = jest.fn().mockResolvedValue(newUser);

      const res = await request(app)
        .post('/api/auth/register-firebase')
        .set('Authorization', 'Bearer valid-token')
        .send({
          email: 'new@example.com',
          firstName: 'New',
          lastName: 'User',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(User.create).toHaveBeenCalled();
    });

    it('updates existing user', async () => {
      const existingUser = buildUser();
      User.findOne.mockResolvedValue(existingUser);

      const res = await request(app)
        .post('/api/auth/register-firebase')
        .set('Authorization', 'Bearer valid-token')
        .send({
          email: 'test@example.com',
          firstName: 'Updated',
          lastName: 'Name',
        });

      expect(res.status).toBe(200);
      expect(existingUser.update).toHaveBeenCalled();
    });

    it('validates professional client fields (SIRET must be 14 digits)', async () => {
      User.findOne.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/auth/register-firebase')
        .set('Authorization', 'Bearer valid-token')
        .send({
          email: 'pro@example.com',
          firstName: 'Pro',
          lastName: 'User',
          clientType: 'professionnel',
          companyName: 'Test Corp',
          siret: '12345', // Too short — should fail validation
        });

      expect(res.status).toBe(400);
    });

    it('sends welcome email for new user', async () => {
      const newUser = buildUser({ email: 'new@example.com', firstName: 'New' });
      User.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      User.create = jest.fn().mockResolvedValue(newUser);

      await request(app)
        .post('/api/auth/register-firebase')
        .set('Authorization', 'Bearer valid-token')
        .send({
          email: 'new@example.com',
          firstName: 'New',
          lastName: 'User',
        });

      expect(emailService.sendWelcomeEmail).toHaveBeenCalled();
    });
  });

  describe('PUT /api/auth/profile', () => {
    it('updates user profile fields', async () => {
      const mockUser = buildUser();
      User.findOne.mockResolvedValue(mockUser);

      const res = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', 'Bearer valid-token')
        .send({ firstName: 'Updated', lastName: 'Name' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockUser.update).toHaveBeenCalled();
    });

    it('rejects phone change (requires SMS verification)', async () => {
      const mockUser = buildUser({ phone: '+33600000000' });
      User.findOne.mockResolvedValue(mockUser);

      const res = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', 'Bearer valid-token')
        .send({ phone: '+33699999999' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('SMS');
    });

    it('rejects first-time phone addition without SMS verification', async () => {
      const mockUser = buildUser({ phone: null });
      User.findOne.mockResolvedValue(mockUser);

      const res = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', 'Bearer valid-token')
        .send({ phone: '+33600000000' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('returns success even when user does not exist (security)', async () => {
      User.findOne.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('generates reset token and sends email when user exists', async () => {
      const mockUser = buildUser();
      User.findOne.mockResolvedValue(mockUser);

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(200);
      expect(mockUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          resetPasswordToken: expect.any(String),
          resetPasswordExpires: expect.any(Date),
        })
      );
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalled();
    });

    it('returns 400 for invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
    });
  });
});
