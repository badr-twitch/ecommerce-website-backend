// Mock models before importing the service
jest.mock('../../../models/Product', () => ({
  findByPk: jest.fn(),
  findAll: jest.fn(),
  count: jest.fn(),
  sum: jest.fn(),
}));

jest.mock('../../../models/StockHistory', () => ({
  create: jest.fn(),
  findAll: jest.fn(),
}));

jest.mock('../../../models/User', () => ({}));

// Mock models/index.js to prevent association loading
jest.mock('../../../models/index', () => ({}));

const Product = require('../../../models/Product');
const StockHistory = require('../../../models/StockHistory');

// Need to reset modules since inventoryService is a singleton
let inventoryService;

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();

  // Re-mock after resetModules
  jest.mock('../../../models/Product', () => ({
    findByPk: jest.fn(),
    findAll: jest.fn(),
    count: jest.fn(),
    sum: jest.fn(),
  }));
  jest.mock('../../../models/StockHistory', () => ({
    create: jest.fn(),
    findAll: jest.fn(),
  }));
  jest.mock('../../../models/User', () => ({}));
  jest.mock('../../../models/index', () => ({}));

  inventoryService = require('../../../services/inventoryService');
});

describe('InventoryService', () => {
  describe('updateStock()', () => {
    it('increases stock and creates history record', async () => {
      const mockProduct = {
        id: 'prod-1',
        name: 'Test Product',
        stockQuantity: 50,
        minStockLevel: 10,
        lastStockAlert: null,
        update: jest.fn().mockResolvedValue(),
      };
      const ProductModel = require('../../../models/Product');
      const StockHistoryModel = require('../../../models/StockHistory');

      ProductModel.findByPk.mockResolvedValue(mockProduct);
      StockHistoryModel.create.mockResolvedValue({});

      const result = await inventoryService.updateStock(
        'prod-1', 20, 'in', 'Restock', null, null, null, 'admin-1'
      );

      expect(result.success).toBe(true);
      expect(result.previousStock).toBe(50);
      expect(result.newStock).toBe(70);
      expect(result.change).toBe(20);

      expect(mockProduct.update).toHaveBeenCalledWith({ stockQuantity: 70 });
      expect(StockHistoryModel.create).toHaveBeenCalledWith({
        productId: 'prod-1',
        changeType: 'in',
        quantity: 20,
        previousStock: 50,
        newStock: 70,
        reason: 'Restock',
        referenceId: null,
        referenceType: null,
        notes: null,
        performedBy: 'admin-1',
      });
    });

    it('decreases stock correctly', async () => {
      const mockProduct = {
        id: 'prod-1',
        name: 'Test Product',
        stockQuantity: 50,
        minStockLevel: 10,
        lastStockAlert: null,
        update: jest.fn().mockResolvedValue(),
      };
      const ProductModel = require('../../../models/Product');
      const StockHistoryModel = require('../../../models/StockHistory');

      ProductModel.findByPk.mockResolvedValue(mockProduct);
      StockHistoryModel.create.mockResolvedValue({});

      const result = await inventoryService.updateStock(
        'prod-1', -10, 'out', 'Order fulfillment'
      );

      expect(result.success).toBe(true);
      expect(result.previousStock).toBe(50);
      expect(result.newStock).toBe(40);
      expect(mockProduct.update).toHaveBeenCalledWith({ stockQuantity: 40 });
    });

    it('throws when result would be negative stock', async () => {
      const mockProduct = {
        id: 'prod-1',
        stockQuantity: 5,
        update: jest.fn(),
      };
      const ProductModel = require('../../../models/Product');
      ProductModel.findByPk.mockResolvedValue(mockProduct);

      await expect(
        inventoryService.updateStock('prod-1', -10, 'out', 'Order')
      ).rejects.toThrow('Stock cannot be negative');

      expect(mockProduct.update).not.toHaveBeenCalled();
    });

    it('throws when product not found', async () => {
      const ProductModel = require('../../../models/Product');
      ProductModel.findByPk.mockResolvedValue(null);

      await expect(
        inventoryService.updateStock('nonexistent', 10, 'in', 'Restock')
      ).rejects.toThrow('Product not found');
    });

    it('reduces stock to exactly zero', async () => {
      const mockProduct = {
        id: 'prod-1',
        name: 'Test Product',
        stockQuantity: 10,
        minStockLevel: 5,
        lastStockAlert: null,
        update: jest.fn().mockResolvedValue(),
      };
      const ProductModel = require('../../../models/Product');
      const StockHistoryModel = require('../../../models/StockHistory');

      ProductModel.findByPk.mockResolvedValue(mockProduct);
      StockHistoryModel.create.mockResolvedValue({});

      const result = await inventoryService.updateStock(
        'prod-1', -10, 'out', 'Clearance'
      );

      expect(result.success).toBe(true);
      expect(result.newStock).toBe(0);
    });
  });

  describe('checkLowStockAlert()', () => {
    it('triggers alert when stock is below minimum and no recent alert', async () => {
      const mockProduct = {
        stockQuantity: 3,
        minStockLevel: 10,
        lastStockAlert: null,
        name: 'Low Stock Product',
        update: jest.fn().mockResolvedValue(),
      };

      const result = await inventoryService.checkLowStockAlert(mockProduct);

      expect(result).toBe(true);
      expect(mockProduct.update).toHaveBeenCalledWith({
        lastStockAlert: expect.any(Date),
      });
    });

    it('does not trigger alert when stock is above minimum', async () => {
      const mockProduct = {
        stockQuantity: 50,
        minStockLevel: 10,
        lastStockAlert: null,
        update: jest.fn(),
      };

      const result = await inventoryService.checkLowStockAlert(mockProduct);

      expect(result).toBe(false);
      expect(mockProduct.update).not.toHaveBeenCalled();
    });

    it('does not trigger alert if alerted within 24 hours', async () => {
      const recentAlert = new Date(Date.now() - 12 * 60 * 60 * 1000); // 12 hours ago
      const mockProduct = {
        stockQuantity: 3,
        minStockLevel: 10,
        lastStockAlert: recentAlert,
        update: jest.fn(),
      };

      const result = await inventoryService.checkLowStockAlert(mockProduct);

      expect(result).toBe(false);
      expect(mockProduct.update).not.toHaveBeenCalled();
    });
  });
});
