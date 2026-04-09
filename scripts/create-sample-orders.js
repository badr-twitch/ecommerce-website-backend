const sequelize = require('../config/database');
const { User, Product, Order, OrderItem, Category } = require('../models');
const { v4: uuidv4 } = require('uuid');

// French cities and addresses for realistic data
const FRENCH_CITIES = [
  { name: 'Paris', postalCode: '75001', region: 'Île-de-France' },
  { name: 'Lyon', postalCode: '69001', region: 'Auvergne-Rhône-Alpes' },
  { name: 'Marseille', postalCode: '13001', region: 'Provence-Alpes-Côte d\'Azur' },
  { name: 'Toulouse', postalCode: '31000', region: 'Occitanie' },
  { name: 'Nice', postalCode: '06000', region: 'Provence-Alpes-Côte d\'Azur' },
  { name: 'Nantes', postalCode: '44000', region: 'Pays de la Loire' },
  { name: 'Strasbourg', postalCode: '67000', region: 'Grand Est' },
  { name: 'Montpellier', postalCode: '34000', region: 'Occitanie' },
  { name: 'Bordeaux', postalCode: '33000', region: 'Nouvelle-Aquitaine' },
  { name: 'Lille', postalCode: '59000', region: 'Hauts-de-France' },
  { name: 'Rennes', postalCode: '35000', region: 'Bretagne' },
  { name: 'Reims', postalCode: '51100', region: 'Grand Est' },
  { name: 'Saint-Étienne', postalCode: '42000', region: 'Auvergne-Rhône-Alpes' },
  { name: 'Toulon', postalCode: '83000', region: 'Provence-Alpes-Côte d\'Azur' },
  { name: 'Le Havre', postalCode: '76600', region: 'Normandie' }
];

const FRENCH_NAMES = {
  firstNames: [
    'Jean', 'Pierre', 'Michel', 'André', 'Philippe', 'Alain', 'Jean-Pierre', 'René', 'Louis', 'Claude',
    'Marie', 'Françoise', 'Monique', 'Nathalie', 'Isabelle', 'Sylvie', 'Martine', 'Brigitte', 'Catherine', 'Christine',
    'Thomas', 'Nicolas', 'Laurent', 'David', 'Christophe', 'Stéphane', 'Olivier', 'Vincent', 'Alexandre', 'Romain',
    'Sophie', 'Julie', 'Céline', 'Sandrine', 'Valérie', 'Caroline', 'Aurélie', 'Stéphanie', 'Delphine', 'Émilie'
  ],
  lastNames: [
    'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau',
    'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier',
    'Morel', 'Girard', 'Andre', 'Lefevre', 'Mercier', 'Dupont', 'Lambert', 'Bonnet', 'Francois', 'Martinez'
  ]
};

const STREET_NAMES = [
  'Rue de la Paix', 'Avenue des Champs-Élysées', 'Boulevard Saint-Michel', 'Rue de Rivoli', 'Avenue Montaigne',
  'Rue du Faubourg Saint-Honoré', 'Boulevard Haussmann', 'Rue de la Bourse', 'Avenue Victor Hugo', 'Rue Saint-Denis',
  'Boulevard de la Croix-Rousse', 'Rue Mercière', 'Place Bellecour', 'Rue de la République', 'Avenue Jean Jaurès',
  'Rue de la Canebière', 'Boulevard Michelet', 'Avenue du Prado', 'Rue d\'Antibes', 'Promenade des Anglais',
  'Rue de la République', 'Place du Capitole', 'Rue d\'Alsace-Lorraine', 'Avenue des États-Unis', 'Rue de la Pomme'
];

/** Fisher–Yates shuffle (in place). */
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Random Date within one local calendar day among the last 7 days.
 * dayIndex 0 = oldest day (today minus 6 days, 00:00–23:59:59),
 * dayIndex 6 = today from 00:00:00 up to `now`.
 */
function randomDateInLastSevenCalendarDays(now, dayIndex) {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const dayStart = new Date(todayStart);
  dayStart.setDate(dayStart.getDate() - (6 - dayIndex));

  const end = dayIndex === 6 ? new Date(now) : new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
  const t0 = dayStart.getTime();
  const t1 = end.getTime();
  if (t1 <= t0) return new Date(now);
  return new Date(t0 + Math.random() * (t1 - t0));
}

const createSampleOrders = async () => {
  try {
    console.log('🔄 Starting to create 100 realistic sample orders for the last 7 days...');

    // Get existing users (we need at least one user)
    const users = await User.findAll({ limit: 20 });
    if (users.length === 0) {
      console.log('❌ No users found. Please create at least one user first.');
      return;
    }

    // Get existing products
    const products = await Product.findAll({ 
      include: [{ model: Category, as: 'category' }],
      limit: 50 
    });
    if (products.length === 0) {
      console.log('❌ No products found. Please create at least one product first.');
      return;
    }

    console.log(`✅ Found ${users.length} users and ${products.length} products`);

    // Generate 100 orders spread across the last 7 calendar days (varied date/time each)
    const orders = [];
    const now = new Date();

    // ~14–15 orders per day (100 total), shuffled so sequence is not day-blocked
    const daySlots = [];
    for (let d = 0; d < 7; d++) {
      const count = d < 2 ? 15 : 14; // 2*15 + 5*14 = 100
      for (let k = 0; k < count; k++) daySlots.push(d);
    }
    shuffleInPlace(daySlots);

    // Order status distribution for realistic patterns
    const statusDistribution = {
      'pending': 0.15,      // 15% pending
      'confirmed': 0.10,    // 10% confirmed
      'processing': 0.20,   // 20% processing
      'shipped': 0.25,      // 25% shipped
      'delivered': 0.25,    // 25% delivered
      'cancelled': 0.03,    // 3% cancelled
      'refunded': 0.02      // 2% refunded
    };

    // Payment method distribution
    const paymentMethods = ['card', 'paypal', 'bank_transfer', 'cash_on_delivery'];
    const paymentMethodWeights = [0.65, 0.20, 0.10, 0.05]; // 65% card, 20% paypal, etc.

    // Shipping methods
    const shippingMethods = ['Standard', 'Express', 'Colissimo', 'Chronopost'];
    const shippingMethodWeights = [0.50, 0.25, 0.20, 0.05];

    console.log('📦 Creating 100 realistic orders (last 7 calendar days, random time each)...');

    for (let i = 1; i <= 100; i++) {
      const dayIndex = daySlots[i - 1];
      const orderDate = randomDateInLastSevenCalendarDays(now, dayIndex);

      // Select random status based on distribution
      const statusRandom = Math.random();
      let cumulative = 0;
      let selectedStatus = 'pending';
      for (const [status, probability] of Object.entries(statusDistribution)) {
        cumulative += probability;
        if (statusRandom <= cumulative) {
          selectedStatus = status;
          break;
        }
      }

      // Select payment method
      const paymentRandom = Math.random();
      cumulative = 0;
      let selectedPaymentMethod = 'card';
      for (let j = 0; j < paymentMethods.length; j++) {
        cumulative += paymentMethodWeights[j];
        if (paymentRandom <= cumulative) {
          selectedPaymentMethod = paymentMethods[j];
          break;
        }
      }

      // Select shipping method
      const shippingRandom = Math.random();
      cumulative = 0;
      let selectedShippingMethod = 'Standard';
      for (let j = 0; j < shippingMethods.length; j++) {
        cumulative += shippingMethodWeights[j];
        if (shippingRandom <= cumulative) {
          selectedShippingMethod = shippingMethods[j];
          break;
        }
      }

      // Generate random customer data
      const firstName = FRENCH_NAMES.firstNames[Math.floor(Math.random() * FRENCH_NAMES.firstNames.length)];
      const lastName = FRENCH_NAMES.lastNames[Math.floor(Math.random() * FRENCH_NAMES.lastNames.length)];
      const city = FRENCH_CITIES[Math.floor(Math.random() * FRENCH_CITIES.length)];
      const streetName = STREET_NAMES[Math.floor(Math.random() * STREET_NAMES.length)];
      const streetNumber = Math.floor(Math.random() * 200) + 1;

      // Generate realistic order amounts
      const subtotal = Math.floor(Math.random() * 8576) + 214; // 214-8790 DH (20-820 EUR)
      const taxAmount = Math.round(subtotal * 0.20 * 100) / 100; // 20% VAT
      const shippingAmount = selectedShippingMethod === 'Express' ? 161 : 
                           selectedShippingMethod === 'Chronopost' ? 268 : 0;
      const discountAmount = Math.random() < 0.15 ? Math.round(subtotal * 0.10 * 100) / 100 : 0; // 15% chance of 10% discount
      const totalAmount = subtotal + taxAmount + shippingAmount - discountAmount;

      // Generate order number with date
      const orderDateStr = orderDate.toISOString().slice(0, 10).replace(/-/g, '');
      const orderNumber = `ORD-${orderDateStr}-${String(i).padStart(3, '0')}`;

      // Set appropriate timestamps based on status
      let confirmedAt = null, shippedAt = null, deliveredAt = null, cancelledAt = null;
      const statusTimeOffset = Math.random() * 24 * 60 * 60 * 1000; // Random time within the day

      if (['confirmed', 'processing', 'shipped', 'delivered'].includes(selectedStatus)) {
        confirmedAt = new Date(orderDate.getTime() + statusTimeOffset);
      }
      if (['processing', 'shipped', 'delivered'].includes(selectedStatus)) {
        shippedAt = new Date(orderDate.getTime() + (2 * 24 * 60 * 60 * 1000) + statusTimeOffset);
      }
      if (['delivered'].includes(selectedStatus)) {
        deliveredAt = new Date(orderDate.getTime() + (4 * 24 * 60 * 60 * 1000) + statusTimeOffset);
      }
      if (['cancelled'].includes(selectedStatus)) {
        cancelledAt = new Date(orderDate.getTime() + statusTimeOffset);
      }

      // Payment status based on order status
      let paymentStatus = 'pending';
      if (['confirmed', 'processing', 'shipped', 'delivered'].includes(selectedStatus)) {
        paymentStatus = 'paid';
      } else if (['cancelled', 'refunded'].includes(selectedStatus)) {
        paymentStatus = 'refunded';
      }

      // Generate tracking number for shipped/delivered orders
      const trackingNumber = ['shipped', 'delivered'].includes(selectedStatus) ? 
        `TRK${Math.random().toString(36).substring(2, 10).toUpperCase()}` : null;

      const orderData = {
        orderNumber,
        status: selectedStatus,
        totalAmount,
        subtotal,
        taxAmount,
        shippingAmount,
        discountAmount,
        currency: 'MAD',
        customerFirstName: firstName,
        customerLastName: lastName,
        customerEmail: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
        customerPhone: `+33${Math.floor(Math.random() * 90000000) + 10000000}`,
        billingAddress: `${streetNumber} ${streetName}`,
        billingCity: city.name,
        billingPostalCode: city.postalCode,
        billingCountry: 'France',
        shippingAddress: `${streetNumber} ${streetName}`,
        shippingCity: city.name,
        shippingPostalCode: city.postalCode,
        shippingCountry: 'France',
        paymentMethod: selectedPaymentMethod,
        paymentStatus,
        paymentTransactionId: `txn_${orderNumber.replace(/[^A-Z0-9]/g, '')}`,
        shippingMethod: selectedShippingMethod,
        trackingNumber,
        estimatedDeliveryDate: selectedStatus === 'shipped' ? 
          new Date(orderDate.getTime() + (5 * 24 * 60 * 60 * 1000)) : null,
        actualDeliveryDate: selectedStatus === 'delivered' ? deliveredAt : null,
        customerNotes: generateCustomerNotes(selectedStatus),
        internalNotes: `Sample order ${i}/100 - ${selectedStatus}`,
        confirmedAt,
        shippedAt,
        deliveredAt,
        cancelledAt,
        createdAt: orderDate,
        updatedAt: orderDate
      };

      orders.push(orderData);
    }

    // Create orders in batches to avoid overwhelming the database
    const batchSize = 10;
    for (let i = 0; i < orders.length; i += batchSize) {
      const batch = orders.slice(i, i + batchSize);
      
      for (const orderData of batch) {
        const user = users[Math.floor(Math.random() * users.length)];
        
        // Create the order
        const order = await Order.create({
          id: uuidv4(),
          userId: user.id,
          ...orderData
        });

        // Add 1-4 random products to each order
        const numItems = Math.floor(Math.random() * 4) + 1;
        const selectedProducts = [];
        
        for (let j = 0; j < numItems; j++) {
          const product = products[Math.floor(Math.random() * products.length)];
          if (!selectedProducts.find(p => p.id === product.id)) {
            selectedProducts.push(product);
          }
        }

        // Create order items
        for (const product of selectedProducts) {
          const quantity = Math.floor(Math.random() * 3) + 1;
          const unitPrice = product.price || Math.floor(Math.random() * 100) + 10;
          
          await OrderItem.create({
            id: uuidv4(),
            orderId: order.id,
            productId: product.id,
            quantity: quantity,
            unitPrice: unitPrice,
            totalPrice: quantity * unitPrice,
            discountAmount: 0.00,
            productName: product.name || 'Product Name',
            productSku: product.sku || `SKU-${product.id.substring(0, 8)}`,
            productImage: product.mainImage || product.imageUrl || null
          });
        }

        console.log(`✅ Created order ${orderData.orderNumber} (${orderData.status}) with ${selectedProducts.length} items`);
      }

      console.log(`📦 Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(orders.length / batchSize)}`);
    }

    console.log('🎉 Sample orders created successfully!');
    console.log(`📊 Created ${orders.length} realistic orders spread across the last 7 calendar days`);
    console.log('📈 Orders distributed across different statuses and payment methods');
    console.log('🔍 You can now test the bulk operations in the admin dashboard');

  } catch (error) {
    console.error('❌ Error creating sample orders:', error);
  } finally {
    if (sequelize) {
      await sequelize.close();
    }
  }
};

// Helper function to generate realistic customer notes
function generateCustomerNotes(status) {
  const notes = {
    'pending': [
      'Commande en attente de validation',
      'Nouvelle commande',
      'En attente de confirmation',
      'Commande passée'
    ],
    'confirmed': [
      'Commande confirmée',
      'En cours de préparation',
      'Commande validée'
    ],
    'processing': [
      'En cours de préparation',
      'En cours de traitement',
      'Préparation en cours'
    ],
    'shipped': [
      'Expédié via Colissimo',
      'Expédié via Chronopost',
      'En route vers le client',
      'Expédition effectuée'
    ],
    'delivered': [
      'Livré avec succès',
      'Livraison effectuée',
      'Commande livrée',
      'Livraison terminée'
    ],
    'cancelled': [
      'Annulé par le client',
      'Commande annulée',
      'Annulation demandée'
    ],
    'refunded': [
      'Remboursé - produit défectueux',
      'Remboursement effectué',
      'Retour accepté'
    ]
  };

  const statusNotes = notes[status] || notes['pending'];
  return statusNotes[Math.floor(Math.random() * statusNotes.length)];
}

// Run the script
createSampleOrders(); 