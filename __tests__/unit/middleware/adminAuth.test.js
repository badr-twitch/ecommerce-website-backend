const { createMockReq, createMockRes, createMockNext } = require('../../helpers/mockAuth');
const { buildUser } = require('../../helpers/factories');

// Mock the User model
jest.mock('../../../models/User', () => ({
  findOne: jest.fn(),
}));

const User = require('../../../models/User');
const adminAuth = require('../../../middleware/adminAuth');

describe('adminAuth middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = createMockReq();
    res = createMockRes();
    next = createMockNext();
    jest.clearAllMocks();
  });

  it('returns 401 when req.firebaseUser is missing', async () => {
    req.firebaseUser = null;

    await adminAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res._json.success).toBe(false);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 when user not found in database', async () => {
    req.firebaseUser = { uid: 'firebase-uid-123' };
    User.findOne.mockResolvedValue(null);

    await adminAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when user is inactive', async () => {
    req.firebaseUser = { uid: 'firebase-uid-123' };
    const inactiveUser = buildUser({ isActive: false, role: 'admin' });
    User.findOne.mockResolvedValue(inactiveUser);

    await adminAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res._json.error).toContain('désactivé');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user role is not admin', async () => {
    req.firebaseUser = { uid: 'firebase-uid-123' };
    const clientUser = buildUser({ role: 'client', isActive: true });
    User.findOne.mockResolvedValue(clientUser);

    await adminAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res._json.error).toContain('administrateur');
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.user and calls next() for active admin user', async () => {
    req.firebaseUser = { uid: 'firebase-uid-123' };
    const adminUser = buildUser({ role: 'admin', isActive: true });
    User.findOne.mockResolvedValue(adminUser);

    await adminAuth(req, res, next);

    expect(req.user).toEqual(adminUser);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('looks up user by firebaseUid', async () => {
    req.firebaseUser = { uid: 'firebase-uid-456' };
    User.findOne.mockResolvedValue(buildUser({ role: 'admin', isActive: true }));

    await adminAuth(req, res, next);

    expect(User.findOne).toHaveBeenCalledWith({
      where: { firebaseUid: 'firebase-uid-456' },
    });
  });

  it('returns 500 on unexpected errors', async () => {
    req.firebaseUser = { uid: 'firebase-uid-123' };
    User.findOne.mockRejectedValue(new Error('DB connection failed'));

    await adminAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});
