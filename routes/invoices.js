const express = require('express');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Product = require('../models/Product');
const User = require('../models/User');
const firebaseAuth = require('../middleware/firebaseAuth');
const invoiceService = require('../services/invoiceService');
const { validateId } = require('../middleware/validateInput');

const router = express.Router();

// @route   GET /api/orders/:id/invoice
// @desc    Download PDF invoice for an order
// @access  Private
router.get('/:id/invoice', validateId, firebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Find user
    const user = await User.findOne({ where: { firebaseUid: req.firebaseUser.uid } });
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }

    // Build query — restrict to user's own orders (unless admin)
    const whereClause = { id };
    if (user.role !== 'admin') {
      whereClause.userId = user.id;
    }

    const order = await Order.findOne({
      where: whereClause,
      include: [{
        model: OrderItem,
        as: 'orderItems',
        include: [{ model: Product, as: 'product', attributes: ['name', 'sku', 'mainImage'] }]
      }]
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Commande non trouvée'
      });
    }

    // Generate PDF
    const pdfBuffer = await invoiceService.generateInvoice(order, order.orderItems, user);

    // Send PDF
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=facture-${order.orderNumber}.pdf`,
      'Content-Length': pdfBuffer.length
    });

    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la génération de la facture'
    });
  }
});

module.exports = router;
