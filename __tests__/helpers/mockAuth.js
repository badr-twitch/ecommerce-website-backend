/**
 * Test helpers for creating mock Express req/res/next objects
 */

/**
 * Create a mock Express request object
 */
function createMockReq(overrides = {}) {
  return {
    headers: {},
    body: {},
    params: {},
    query: {},
    firebaseUser: null,
    user: null,
    ...overrides,
  };
}

/**
 * Create a mock Express response object with chainable status().json()
 */
function createMockRes() {
  const res = {};
  res.statusCode = 200;
  res._json = null;

  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });

  res.json = jest.fn((data) => {
    res._json = data;
    return res;
  });

  res.send = jest.fn((data) => {
    res._body = data;
    return res;
  });

  return res;
}

/**
 * Create a mock next() function
 */
function createMockNext() {
  return jest.fn();
}

module.exports = { createMockReq, createMockRes, createMockNext };
