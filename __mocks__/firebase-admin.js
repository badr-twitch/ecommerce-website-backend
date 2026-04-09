// Auto-mock for firebase-admin
// Jest automatically uses this when any module requires 'firebase-admin'

const mockVerifyIdToken = jest.fn();
const mockGetUser = jest.fn();
const mockGetUserByEmail = jest.fn();
const mockSetCustomUserClaims = jest.fn();
const mockCreateCustomToken = jest.fn();

const mockAuth = jest.fn(() => ({
  verifyIdToken: mockVerifyIdToken,
  getUser: mockGetUser,
  getUserByEmail: mockGetUserByEmail,
  setCustomUserClaims: mockSetCustomUserClaims,
  createCustomToken: mockCreateCustomToken,
}));

const mockCert = jest.fn(() => 'mock-credential');
const mockInitializeApp = jest.fn();

const mockBucket = jest.fn(() => ({
  file: jest.fn(() => ({
    delete: jest.fn().mockResolvedValue(),
    exists: jest.fn().mockResolvedValue([true]),
  })),
}));

const mockStorage = jest.fn(() => ({
  bucket: mockBucket,
}));

const admin = {
  apps: [{}], // Non-empty so initializeApp is skipped
  initializeApp: mockInitializeApp,
  credential: {
    cert: mockCert,
  },
  auth: mockAuth,
  storage: mockStorage,
  // Expose mock functions for test assertions
  __mocks: {
    verifyIdToken: mockVerifyIdToken,
    getUser: mockGetUser,
    getUserByEmail: mockGetUserByEmail,
    setCustomUserClaims: mockSetCustomUserClaims,
    createCustomToken: mockCreateCustomToken,
    initializeApp: mockInitializeApp,
    cert: mockCert,
    bucket: mockBucket,
  },
};

module.exports = admin;
