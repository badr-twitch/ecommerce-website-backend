/**
 * Shared mock for Sequelize instance (config/database.js).
 * Returns a mock that satisfies `sequelize.define()` calls in model files.
 */
const mockModel = {
  findAll: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  findByPk: jest.fn().mockResolvedValue(null),
  findAndCountAll: jest.fn().mockResolvedValue({ count: 0, rows: [] }),
  create: jest.fn().mockResolvedValue({}),
  bulkCreate: jest.fn().mockResolvedValue([]),
  update: jest.fn().mockResolvedValue([1]),
  destroy: jest.fn().mockResolvedValue(1),
  count: jest.fn().mockResolvedValue(0),
  sum: jest.fn().mockResolvedValue(0),
  increment: jest.fn().mockResolvedValue(),
  decrement: jest.fn().mockResolvedValue(),
  belongsTo: jest.fn(),
  hasMany: jest.fn(),
  hasOne: jest.fn(),
  belongsToMany: jest.fn(),
  addScope: jest.fn(),
  scope: jest.fn().mockReturnThis(),
  prototype: {},
};

const sequelizeMock = {
  define: jest.fn(() => ({ ...mockModel })),
  authenticate: jest.fn().mockResolvedValue(),
  sync: jest.fn().mockResolvedValue(),
  fn: jest.fn(),
  col: jest.fn(),
  literal: jest.fn(),
  transaction: jest.fn().mockImplementation(async (cb) => cb({})),
  query: jest.fn().mockResolvedValue([]),
  models: {},
};

module.exports = sequelizeMock;
