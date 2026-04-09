const admin = require('firebase-admin');
const { createMockReq, createMockRes, createMockNext } = require('../../helpers/mockAuth');
const { buildUser } = require('../../helpers/factories');

// Mock the User model
jest.mock('../../../models/User', () => ({
  findOne: jest.fn(),
}));

const User = require('../../../models/User');

// Import the middleware AFTER mocks are set up
// firebaseAuth.js also imports firebase-admin and tries to init,
// but our __mocks__/firebase-admin.js handles that
const firebaseAuth = require('../../../middleware/firebaseAuth');

describe('firebaseAuth middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = createMockReq();
    res = createMockRes();
    next = createMockNext();
    jest.clearAllMocks();
  });

  describe('missing or malformed token', () => {
    it('returns 401 when no Authorization header', async () => {
      await firebaseAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res._json.success).toBe(false);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when Authorization header does not start with Bearer', async () => {
      req.headers.authorization = 'Basic some-token';

      await firebaseAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when Authorization header is "Bearer " with empty token', async () => {
      req.headers.authorization = 'Bearer ';

      await firebaseAuth(req, res, next);

      // Even with empty string, it calls verifyIdToken which will fail
      // The middleware extracts token after 'Bearer '
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('valid token', () => {
    const mockDecodedToken = {
      uid: 'firebase-uid-123',
      email: 'test@example.com',
      email_verified: true,
    };

    beforeEach(() => {
      req.headers.authorization = 'Bearer valid-token-123';
      admin.__mocks.verifyIdToken.mockResolvedValue(mockDecodedToken);
    });

    it('sets req.firebaseUser and req.user when user exists in DB', async () => {
      const mockUser = buildUser({ firebaseUid: 'firebase-uid-123' });
      User.findOne.mockResolvedValue(mockUser);

      await firebaseAuth(req, res, next);

      expect(admin.auth().verifyIdToken).toHaveBeenCalledWith('valid-token-123');
      expect(req.firebaseUser).toEqual(mockDecodedToken);
      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalled();
    });

    it('sets req.firebaseUser but not req.user when user not in DB (registration)', async () => {
      User.findOne.mockResolvedValue(null);

      await firebaseAuth(req, res, next);

      expect(req.firebaseUser).toEqual(mockDecodedToken);
      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalled();
    });

    it('looks up user by firebaseUid', async () => {
      User.findOne.mockResolvedValue(null);

      await firebaseAuth(req, res, next);

      expect(User.findOne).toHaveBeenCalledWith({
        where: { firebaseUid: 'firebase-uid-123' },
      });
    });
  });

  describe('token verification errors', () => {
    beforeEach(() => {
      req.headers.authorization = 'Bearer expired-token';
    });

    it('returns 401 for expired token', async () => {
      admin.__mocks.verifyIdToken.mockRejectedValue({
        code: 'auth/id-token-expired',
        message: 'Token expired',
      });

      await firebaseAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res._json.message).toBe('Token expiré');
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 for revoked token', async () => {
      admin.__mocks.verifyIdToken.mockRejectedValue({
        code: 'auth/id-token-revoked',
        message: 'Token revoked',
      });

      await firebaseAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res._json.message).toBe('Token révoqué');
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 500 for other Firebase errors', async () => {
      admin.__mocks.verifyIdToken.mockRejectedValue(new Error('Unknown Firebase error'));

      await firebaseAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireEmailVerified', () => {
    const { requireEmailVerified } = require('../../../middleware/firebaseAuth');

    it('calls next() when email is verified', () => {
      req.firebaseUser = { email_verified: true };

      requireEmailVerified(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('returns 403 when email is not verified', () => {
      req.firebaseUser = { email_verified: false };

      requireEmailVerified(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 when firebaseUser is null', () => {
      req.firebaseUser = null;

      requireEmailVerified(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
