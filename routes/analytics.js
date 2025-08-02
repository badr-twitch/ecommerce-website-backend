const express = require('express');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const router = express.Router();

// Import models
const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');

// Import middleware
const firebaseAuth = require('../middleware/firebaseAuth');
const adminAuth = require('../middleware/adminAuth');

// Apply Firebase auth and admin auth to all analytics routes
router.use(firebaseAuth, adminAuth);

// ==================== SALES ANALYTICS ====================

// @route   GET /api/admin/analytics/sales
// @desc    Get comprehensive sales analytics
// @access  Admin
router.get('/sales', async (req, res) => {
  try {
    const { period = '30', startDate, endDate } = req.query;
    
    // Calculate date range
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          [Op.between]: [new Date(startDate), new Date(endDate)]
        }
      };
    } else {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(period));
      dateFilter = {
        createdAt: {
          [Op.gte]: daysAgo
        }
      };
    }

    // Total sales metrics
    const totalSales = await Order.findAll({
      where: {
        ...dateFilter,
        status: ['delivered', 'shipped']
      },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalRevenue'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalOrders'],
        [sequelize.fn('AVG', sequelize.col('totalAmount')), 'averageOrderValue']
      ]
    });

    // Daily sales breakdown
    const dailySales = await Order.findAll({
      where: {
        ...dateFilter,
        status: ['delivered', 'shipped']
      },
      attributes: [
        [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'revenue'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'orders']
      ],
      group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
      order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']]
    });

    // Sales by status
    const salesByStatus = await Order.findAll({
      where: dateFilter,
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'revenue']
      ],
      group: ['status']
    });

    // Top performing days
    const topDays = await Order.findAll({
      where: {
        ...dateFilter,
        status: ['delivered', 'shipped']
      },
      attributes: [
        [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'revenue']
      ],
      group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
      order: [[sequelize.fn('SUM', sequelize.col('totalAmount')), 'DESC']],
      limit: 10
    });

    res.json({
      success: true,
      data: {
        summary: {
          totalRevenue: parseFloat(totalSales[0]?.dataValues?.totalRevenue || 0).toFixed(2),
          totalOrders: parseInt(totalSales[0]?.dataValues?.totalOrders || 0),
          averageOrderValue: parseFloat(totalSales[0]?.dataValues?.averageOrderValue || 0).toFixed(2)
        },
        dailySales: dailySales.map(item => ({
          date: item.dataValues.date,
          revenue: parseFloat(item.dataValues.revenue || 0).toFixed(2),
          orders: parseInt(item.dataValues.orders || 0)
        })),
        salesByStatus: salesByStatus.map(item => ({
          status: item.status,
          count: parseInt(item.dataValues.count || 0),
          revenue: parseFloat(item.dataValues.revenue || 0).toFixed(2)
        })),
        topDays: topDays.map(item => ({
          date: item.dataValues.date,
          revenue: parseFloat(item.dataValues.revenue || 0).toFixed(2)
        }))
      }
    });

  } catch (error) {
    console.error('❌ Sales analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des analytics de vente'
    });
  }
});

// ==================== CUSTOMER ANALYTICS ====================

// @route   GET /api/admin/analytics/customers
// @desc    Get comprehensive customer analytics
// @access  Admin
router.get('/customers', async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(period));

    // Customer registration trends
    const registrationTrends = await User.findAll({
      where: {
        role: 'client',
        createdAt: {
          [Op.gte]: daysAgo
        }
      },
      attributes: [
        [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'registrations']
      ],
      group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
      order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']]
    });

    // Top customers by order value
    const topCustomers = await Order.findAll({
      where: {
        status: ['delivered', 'shipped'],
        createdAt: {
          [Op.gte]: daysAgo
        }
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['firstName', 'lastName', 'email']
        }
      ],
      attributes: [
        'userId',
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalSpent'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'orderCount']
      ],
      group: ['userId', 'user.id', 'user.firstName', 'user.lastName', 'user.email'],
      order: [[sequelize.fn('SUM', sequelize.col('totalAmount')), 'DESC']],
      limit: 10
    });

    // Customer lifetime value analysis
    const customerLifetimeValue = await Order.findAll({
      where: {
        status: ['delivered', 'shipped']
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['firstName', 'lastName', 'email']
        }
      ],
      attributes: [
        'userId',
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalSpent'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'orderCount'],
        [sequelize.fn('AVG', sequelize.col('totalAmount')), 'averageOrderValue']
      ],
      group: ['userId', 'user.id', 'user.firstName', 'user.lastName', 'user.email'],
      order: [[sequelize.fn('SUM', sequelize.col('totalAmount')), 'DESC']],
      limit: 20
    });

    // New vs returning customers
    const customerTypes = await Order.findAll({
      where: {
        status: ['delivered', 'shipped'],
        createdAt: {
          [Op.gte]: daysAgo
        }
      },
      attributes: [
        'userId',
        [sequelize.fn('COUNT', sequelize.col('id')), 'orderCount']
      ],
      group: ['userId'],
      having: sequelize.literal('COUNT(id) > 1')
    });

    const returningCustomers = customerTypes.length;
    const totalCustomers = await User.count({
      where: {
        role: 'client',
        createdAt: {
          [Op.gte]: daysAgo
        }
      }
    });

    res.json({
      success: true,
      data: {
        registrationTrends: registrationTrends.map(item => ({
          date: item.dataValues.date,
          registrations: parseInt(item.dataValues.registrations)
        })),
        topCustomers: topCustomers.map(item => ({
          customer: {
            name: `${item.user?.firstName || ''} ${item.user?.lastName || ''}`,
            email: item.user?.email || ''
          },
          totalSpent: parseFloat(item.dataValues.totalSpent || 0).toFixed(2),
          orderCount: parseInt(item.dataValues.orderCount || 0)
        })),
        customerLifetimeValue: customerLifetimeValue.map(item => ({
          customer: {
            name: `${item.user?.firstName || ''} ${item.user?.lastName || ''}`,
            email: item.user?.email || ''
          },
          totalSpent: parseFloat(item.dataValues.totalSpent || 0).toFixed(2),
          orderCount: parseInt(item.dataValues.orderCount || 0),
          averageOrderValue: parseFloat(item.dataValues.averageOrderValue || 0).toFixed(2)
        })),
        customerRetention: {
          totalCustomers,
          returningCustomers,
          newCustomers: totalCustomers - returningCustomers,
          retentionRate: totalCustomers > 0 ? ((returningCustomers / totalCustomers) * 100).toFixed(2) : 0
        }
      }
    });

  } catch (error) {
    console.error('❌ Customer analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des analytics clients'
    });
  }
});

// ==================== PRODUCT ANALYTICS ====================

// @route   GET /api/admin/analytics/products
// @desc    Get comprehensive product analytics
// @access  Admin
router.get('/products', async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(period));

    // Top selling products
    const topProducts = await OrderItem.findAll({
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'price', 'mainImage']
        },
        {
          model: Order,
          as: 'order',
          where: {
            status: ['delivered', 'shipped'],
            createdAt: {
              [Op.gte]: daysAgo
            }
          },
          attributes: []
        }
      ],
      attributes: [
        'productId',
        [sequelize.fn('SUM', sequelize.col('quantity')), 'totalSold'],
        [sequelize.fn('SUM', sequelize.literal('quantity * "product"."price"')), 'totalRevenue']
      ],
      group: ['productId', 'product.id', 'product.name', 'product.price', 'product.mainImage'],
      order: [[sequelize.fn('SUM', sequelize.col('quantity')), 'DESC']],
      limit: 10
    });

    // Product performance by category
    const productsByCategory = await OrderItem.findAll({
      include: [
        {
          model: Product,
          as: 'product',
          include: [
            {
              model: Category,
              as: 'category',
              attributes: ['name']
            }
          ],
          attributes: ['id', 'name', 'price']
        },
        {
          model: Order,
          as: 'order',
          where: {
            status: ['delivered', 'shipped'],
            createdAt: {
              [Op.gte]: daysAgo
            }
          },
          attributes: []
        }
      ],
      attributes: [
        'productId',
        [sequelize.fn('SUM', sequelize.col('quantity')), 'totalSold'],
        [sequelize.fn('SUM', sequelize.literal('quantity * "product"."price"')), 'totalRevenue']
      ],
      group: ['productId', 'product.id', 'product.name', 'product.price', 'product.category.name'],
      order: [[sequelize.fn('SUM', sequelize.literal('quantity * "product"."price"')), 'DESC']]
    });

    // Low stock products
    const lowStockProducts = await Product.findAll({
      where: {
        stockQuantity: {
          [Op.lte]: 10
        }
      },
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['name']
        }
      ],
      order: [['stockQuantity', 'ASC']],
      limit: 10
    });

    // Product conversion rates (views to purchases)
    const productConversion = await Product.findAll({
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['name']
        }
      ],
      attributes: [
        'id',
        'name',
        'price',
        'stockQuantity',
        [sequelize.fn('COUNT', sequelize.col('orderItems.id')), 'purchaseCount']
      ],
      include: [
        {
          model: OrderItem,
          as: 'orderItems',
          include: [
            {
              model: Order,
              as: 'order',
              where: {
                status: ['delivered', 'shipped'],
                createdAt: {
                  [Op.gte]: daysAgo
                }
              },
              attributes: []
            }
          ],
          attributes: []
        }
      ],
      group: ['Product.id', 'category.id', 'category.name'],
      order: [[sequelize.fn('COUNT', sequelize.col('orderItems.id')), 'DESC']],
      limit: 10
    });

    res.json({
      success: true,
      data: {
        topProducts: topProducts.map(item => ({
          product: {
            id: item.product.id,
            name: item.product.name,
            price: item.product.price,
            image: item.product.mainImage
          },
          totalSold: parseInt(item.dataValues.totalSold || 0),
          totalRevenue: parseFloat(item.dataValues.totalRevenue || 0).toFixed(2)
        })),
        productsByCategory: productsByCategory.map(item => ({
          product: {
            name: item.product.name,
            price: item.product.price
          },
          category: item.product.category?.name || 'Uncategorized',
          totalSold: parseInt(item.dataValues.totalSold || 0),
          totalRevenue: parseFloat(item.dataValues.totalRevenue || 0).toFixed(2)
        })),
        lowStockProducts: lowStockProducts.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          stockQuantity: item.stockQuantity,
          category: item.category?.name || 'Uncategorized'
        })),
        productConversion: productConversion.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          stockQuantity: item.stockQuantity,
          category: item.category?.name || 'Uncategorized',
          purchaseCount: parseInt(item.dataValues.purchaseCount || 0)
        }))
      }
    });

  } catch (error) {
    console.error('❌ Product analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des analytics produits'
    });
  }
});

// ==================== EXPORT REPORTS ====================

// @route   POST /api/admin/analytics/export
// @desc    Export analytics data to CSV
// @access  Admin
router.post('/export', async (req, res) => {
  try {
    const { reportType, startDate, endDate, format = 'csv' } = req.body;
    
    let data = [];
    let filename = '';
    
    const dateFilter = startDate && endDate ? {
      createdAt: {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      }
    } : {};

    switch (reportType) {
      case 'sales':
        const salesData = await Order.findAll({
          where: {
            ...dateFilter,
            status: ['delivered', 'shipped']
          },
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['firstName', 'lastName', 'email']
            }
          ],
          order: [['createdAt', 'DESC']]
        });
        
        data = salesData.map(order => ({
          'Order ID': order.id,
          'Order Number': order.orderNumber,
          'Customer Name': `${order.user?.firstName || ''} ${order.user?.lastName || ''}`,
          'Customer Email': order.user?.email || '',
          'Status': order.status,
          'Total Amount': order.totalAmount,
          'Created Date': new Date(order.createdAt).toLocaleDateString('fr-FR'),
          'Updated Date': new Date(order.updatedAt).toLocaleDateString('fr-FR')
        }));
        filename = `sales-report-${new Date().toISOString().split('T')[0]}.csv`;
        break;

      case 'customers':
        const customersData = await User.findAll({
          where: {
            role: 'client',
            ...dateFilter
          },
          include: [
            {
              model: Order,
              as: 'orders',
              where: {
                status: ['delivered', 'shipped']
              },
              attributes: [
                [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalSpent'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'orderCount']
              ],
              required: false
            }
          ],
          attributes: ['id', 'firstName', 'lastName', 'email', 'createdAt'],
          order: [['createdAt', 'DESC']]
        });
        
        data = customersData.map(customer => ({
          'Customer ID': customer.id,
          'First Name': customer.firstName,
          'Last Name': customer.lastName,
          'Email': customer.email,
          'Registration Date': new Date(customer.createdAt).toLocaleDateString('fr-FR'),
          'Total Spent': customer.orders?.[0]?.dataValues?.totalSpent || 0,
          'Order Count': customer.orders?.[0]?.dataValues?.orderCount || 0
        }));
        filename = `customers-report-${new Date().toISOString().split('T')[0]}.csv`;
        break;

      case 'products':
        const productsData = await Product.findAll({
          include: [
            {
              model: Category,
              as: 'category',
              attributes: ['name']
            },
            {
              model: OrderItem,
              as: 'orderItems',
              include: [
                {
                  model: Order,
                  as: 'order',
                  where: {
                    status: ['delivered', 'shipped'],
                    ...dateFilter
                  },
                  attributes: []
                }
              ],
              attributes: [
                [sequelize.fn('SUM', sequelize.col('quantity')), 'totalSold'],
                [sequelize.fn('SUM', sequelize.literal('quantity * "Product"."price"')), 'totalRevenue']
              ]
            }
          ],
          attributes: ['id', 'name', 'price', 'stockQuantity', 'createdAt'],
          order: [['createdAt', 'DESC']]
        });
        
        data = productsData.map(product => ({
          'Product ID': product.id,
          'Product Name': product.name,
          'Category': product.category?.name || 'Uncategorized',
          'Price': product.price,
          'Stock Quantity': product.stockQuantity,
          'Total Sold': product.orderItems?.[0]?.dataValues?.totalSold || 0,
          'Total Revenue': product.orderItems?.[0]?.dataValues?.totalRevenue || 0,
          'Created Date': new Date(product.createdAt).toLocaleDateString('fr-FR')
        }));
        filename = `products-report-${new Date().toISOString().split('T')[0]}.csv`;
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Type de rapport invalide'
        });
    }

    res.json({
      success: true,
      data: {
        filename,
        data,
        recordCount: data.length
      }
    });

  } catch (error) {
    console.error('❌ Export analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'export des données'
    });
  }
});

module.exports = router; 