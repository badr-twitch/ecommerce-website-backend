const PDFDocument = require('pdfkit');

class InvoiceService {
  /**
   * Generate a PDF invoice for an order.
   * @param {Object} order - The order object
   * @param {Array} orderItems - The order items array
   * @param {Object} user - The user object (optional)
   * @returns {Promise<Buffer>} - PDF buffer
   */
  async generateInvoice(order, orderItems, user) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        // Header
        this._drawHeader(doc, order);

        // Customer & billing info
        this._drawCustomerInfo(doc, order);

        // Items table
        this._drawItemsTable(doc, orderItems);

        // Totals
        this._drawTotals(doc, order);

        // Footer
        this._drawFooter(doc, order);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  _drawHeader(doc, order) {
    // Company info
    doc.fontSize(20).font('Helvetica-Bold').text('UMOD', 50, 50);
    doc.fontSize(10).font('Helvetica')
      .text('E-commerce', 50, 75)
      .text('Casablanca, Maroc', 50, 88);

    // Invoice info (right side)
    doc.fontSize(10).font('Helvetica-Bold')
      .text('FACTURE', 400, 50, { align: 'right' });
    doc.fontSize(9).font('Helvetica')
      .text(`N: INV-${order.orderNumber}`, 400, 68, { align: 'right' })
      .text(`Date: ${new Date(order.createdAt).toLocaleDateString('fr-FR')}`, 400, 81, { align: 'right' })
      .text(`Commande: ${order.orderNumber}`, 400, 94, { align: 'right' });

    // Separator
    doc.moveTo(50, 115).lineTo(545, 115).stroke('#cccccc');
  }

  _drawCustomerInfo(doc, order) {
    const y = 130;

    // Billing address
    doc.fontSize(10).font('Helvetica-Bold').text('Facturation', 50, y);
    doc.fontSize(9).font('Helvetica')
      .text(`${order.customerFirstName} ${order.customerLastName}`, 50, y + 15)
      .text(order.billingAddress || order.shippingAddress, 50, y + 28)
      .text(`${order.billingCity || order.shippingCity}, ${order.billingPostalCode || order.shippingPostalCode}`, 50, y + 41)
      .text(order.billingCountry || order.shippingCountry || 'Maroc', 50, y + 54);

    if (order.customerEmail) {
      doc.text(order.customerEmail, 50, y + 67);
    }

    // Shipping address
    doc.fontSize(10).font('Helvetica-Bold').text('Livraison', 300, y);
    doc.fontSize(9).font('Helvetica')
      .text(`${order.customerFirstName} ${order.customerLastName}`, 300, y + 15)
      .text(order.shippingAddress, 300, y + 28)
      .text(`${order.shippingCity}, ${order.shippingPostalCode}`, 300, y + 41)
      .text(order.shippingCountry || 'Maroc', 300, y + 54);

    if (order.customerPhone) {
      doc.text(order.customerPhone, 300, y + 67);
    }
  }

  _drawItemsTable(doc, orderItems) {
    const tableTop = 230;

    // Table header
    doc.fontSize(9).font('Helvetica-Bold');
    doc.rect(50, tableTop, 495, 20).fill('#f3f4f6');
    doc.fillColor('#374151')
      .text('Produit', 55, tableTop + 5)
      .text('SKU', 280, tableTop + 5)
      .text('Qte', 355, tableTop + 5, { width: 40, align: 'center' })
      .text('Prix unit.', 400, tableTop + 5, { width: 70, align: 'right' })
      .text('Total', 475, tableTop + 5, { width: 65, align: 'right' });

    // Table rows
    doc.font('Helvetica').fontSize(9).fillColor('#000000');
    let y = tableTop + 25;

    for (const item of orderItems) {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }

      const name = item.productName || item.product?.name || 'Produit';
      const sku = item.productSku || item.product?.sku || '-';
      const truncatedName = name.length > 35 ? name.substring(0, 35) + '...' : name;

      doc.text(truncatedName, 55, y)
        .text(sku, 280, y)
        .text(String(item.quantity), 355, y, { width: 40, align: 'center' })
        .text(this._formatPrice(item.unitPrice), 400, y, { width: 70, align: 'right' })
        .text(this._formatPrice(item.totalPrice || item.unitPrice * item.quantity), 475, y, { width: 65, align: 'right' });

      y += 18;

      // Light separator
      doc.moveTo(50, y - 3).lineTo(545, y - 3).stroke('#e5e7eb');
    }

    this._tableEndY = y + 5;
  }

  _drawTotals(doc, order) {
    const y = Math.max(this._tableEndY || 400, 400);
    const x = 380;

    doc.fontSize(9).font('Helvetica');

    doc.text('Sous-total:', x, y)
      .text(this._formatPrice(order.subtotal), 475, y, { width: 65, align: 'right' });

    if (order.taxAmount > 0) {
      doc.text('TVA (20%):', x, y + 16)
        .text(this._formatPrice(order.taxAmount), 475, y + 16, { width: 65, align: 'right' });
    }

    if (order.shippingAmount > 0) {
      doc.text('Livraison:', x, y + 32)
        .text(this._formatPrice(order.shippingAmount), 475, y + 32, { width: 65, align: 'right' });
    }

    if (order.discountAmount > 0) {
      doc.text('Remise:', x, y + 48)
        .fillColor('#16a34a')
        .text('-' + this._formatPrice(order.discountAmount), 475, y + 48, { width: 65, align: 'right' })
        .fillColor('#000000');
    }

    // Total
    const totalY = y + (order.discountAmount > 0 ? 70 : order.shippingAmount > 0 ? 54 : 38);
    doc.moveTo(x, totalY - 5).lineTo(545, totalY - 5).stroke('#000000');
    doc.fontSize(11).font('Helvetica-Bold')
      .text('TOTAL:', x, totalY)
      .text(this._formatPrice(order.totalAmount), 475, totalY, { width: 65, align: 'right' });

    // Payment info
    const payY = totalY + 25;
    doc.fontSize(8).font('Helvetica').fillColor('#6b7280')
      .text(`Paiement: ${order.paymentMethod || 'Carte bancaire'}`, x, payY)
      .text(`Statut: ${order.paymentStatus === 'paid' ? 'Paye' : order.paymentStatus}`, x, payY + 12);

    if (order.paymentTransactionId) {
      doc.text(`Ref: ${order.paymentTransactionId}`, x, payY + 24);
    }
  }

  _drawFooter(doc, order) {
    const pageHeight = doc.page.height;
    const footerY = pageHeight - 80;

    doc.moveTo(50, footerY).lineTo(545, footerY).stroke('#e5e7eb');

    doc.fontSize(8).font('Helvetica').fillColor('#9ca3af')
      .text('UMOD E-commerce — Casablanca, Maroc', 50, footerY + 10, { align: 'center' })
      .text('Merci pour votre confiance !', 50, footerY + 22, { align: 'center' })
      .text(`Facture generee le ${new Date().toLocaleDateString('fr-FR')}`, 50, footerY + 34, { align: 'center' });
  }

  _formatPrice(amount) {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'MAD'
    }).format(amount || 0);
  }
}

module.exports = new InvoiceService();
