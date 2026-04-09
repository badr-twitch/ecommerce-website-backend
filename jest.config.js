module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  setupFiles: ['./__tests__/setup.js'],
  modulePathIgnorePatterns: ['node_modules'],
  coveragePathIgnorePatterns: ['node_modules', '__tests__', 'scripts'],
  // Prevent open handles from keeping Jest alive
  forceExit: true,
  detectOpenHandles: true,
};
