const dotenv = require('dotenv');
const sequelize = require('../config/database');

// Load environment variables
dotenv.config();

// Import models
const Category = require('../models/Category');
const Product = require('../models/Product');

async function seedData() {
  try {
    console.log('🌱 Début du seeding de la base de données...');
    
    // Test connection
    await sequelize.authenticate();
    console.log('✅ Connexion à PostgreSQL établie avec succès.');
    
    // Check if data already exists
    const existingCategories = await Category.count();
    const existingProducts = await Product.count();
    
    if (existingCategories > 0 || existingProducts > 0) {
      console.log('📊 Données déjà présentes dans la base de données:');
      console.log(`   - ${existingCategories} catégories`);
      console.log(`   - ${existingProducts} produits`);
      console.log('✅ Seeding ignoré - données déjà existantes.');
      process.exit(0);
    }
    
    // Create categories
    const categories = await Category.bulkCreate([
      {
        name: 'Électronique',
        slug: 'electronique',
        description: 'Produits électroniques et gadgets',
        image: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400&h=300&fit=crop',
        isActive: true
      },
      {
        name: 'Mode',
        slug: 'mode',
        description: 'Vêtements et accessoires de mode',
        image: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=400&h=300&fit=crop',
        isActive: true
      },
      {
        name: 'Maison & Jardin',
        slug: 'maison-jardin',
        description: 'Articles pour la maison et le jardin',
        image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=300&fit=crop',
        isActive: true
      },
      {
        name: 'Sport & Loisirs',
        slug: 'sport-loisirs',
        description: 'Équipements sportifs et articles de loisirs',
        image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop',
        isActive: true
      },
      {
        name: 'Livre & Culture',
        slug: 'livre-culture',
        description: 'Livres, musique et articles culturels',
        image: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&h=300&fit=crop',
        isActive: true
      }
    ], { returning: true });

    console.log('✅ Catégories créées avec succès.');

    // Create products
    const products = await Product.bulkCreate([
      // Électronique
      {
        name: 'Smartphone Premium Pro',
        description: 'Le dernier smartphone avec des fonctionnalités avancées, appareil photo haute résolution et batterie longue durée.',
        shortDescription: 'Smartphone haut de gamme avec appareil photo pro',
        price: 9652.80,
        originalPrice: 10720.00,
        currency: 'MAD',
        sku: 'SMART-PRO-001',
        stockQuantity: 50,
        weight: 180,
        dimensions: { length: 15, width: 7.5, height: 0.8 },
        images: [
          'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=300&fit=crop',
          'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400&h=300&fit=crop'
        ],
        mainImage: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=300&fit=crop',
        tags: ['smartphone', 'premium', 'pro', 'camera'],
        isActive: true,
        isFeatured: true,
        isOnSale: true,
        salePercentage: 10,
        brand: 'TechPro',
        model: 'Premium Pro',
        warranty: '2 ans',
        categoryId: categories[0].id
      },
      {
        name: 'Ordinateur Portable Gaming',
        description: 'Ordinateur portable optimisé pour le gaming avec processeur haute performance et carte graphique dédiée.',
        shortDescription: 'PC portable gaming haute performance',
        price: 13939.20,
        currency: 'MAD',
        sku: 'LAPTOP-GAMING-001',
        stockQuantity: 25,
        weight: 2500,
        dimensions: { length: 35, width: 25, height: 2.5 },
        images: [
          'https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=400&h=300&fit=crop',
          'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=400&h=300&fit=crop'
        ],
        mainImage: 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=400&h=300&fit=crop',
        tags: ['gaming', 'laptop', 'performance', 'graphics'],
        isActive: true,
        isFeatured: true,
        brand: 'GameTech',
        model: 'Gaming Pro',
        warranty: '3 ans',
        categoryId: categories[0].id
      },
      {
        name: 'Écouteurs Sans Fil',
        description: 'Écouteurs bluetooth avec réduction de bruit active et qualité audio exceptionnelle.',
        shortDescription: 'Écouteurs bluetooth haute qualité',
        price: 2144.00,
        originalPrice: 2680.00,
        currency: 'MAD',
        sku: 'HEADPHONES-001',
        stockQuantity: 100,
        weight: 150,
        dimensions: { length: 8, width: 6, height: 3 },
        images: [
          'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=300&fit=crop',
          'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=400&h=300&fit=crop'
        ],
        mainImage: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=300&fit=crop',
        tags: ['écouteurs', 'bluetooth', 'audio', 'sans fil'],
        isActive: true,
        isOnSale: true,
        salePercentage: 20,
        brand: 'AudioPro',
        model: 'Wireless Pro',
        warranty: '1 an',
        categoryId: categories[0].id
      },

      // Mode
      {
        name: 'Veste en Cuir Premium',
        description: 'Veste en cuir véritable de haute qualité, parfaite pour toutes les occasions.',
        shortDescription: 'Veste cuir premium élégante',
        price: 3216.00,
        currency: 'MAD',
        sku: 'JACKET-LEATHER-001',
        stockQuantity: 30,
        weight: 800,
        dimensions: { length: 70, width: 50, height: 5 },
        images: [
          'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400&h=300&fit=crop',
          'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400&h=300&fit=crop'
        ],
        mainImage: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400&h=300&fit=crop',
        tags: ['veste', 'cuir', 'premium', 'élégant'],
        isActive: true,
        isFeatured: true,
        brand: 'FashionPro',
        model: 'Leather Classic',
        warranty: '1 an',
        categoryId: categories[1].id
      },
      {
        name: 'Sneakers Sportives',
        description: 'Sneakers confortables et stylées, parfaites pour le sport et le quotidien.',
        shortDescription: 'Sneakers confortables et modernes',
        price: 964.80,
        originalPrice: 1286.40,
        currency: 'MAD',
        sku: 'SNEAKERS-001',
        stockQuantity: 75,
        weight: 400,
        dimensions: { length: 30, width: 12, height: 8 },
        images: [
          'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400&h=300&fit=crop',
          'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=400&h=300&fit=crop'
        ],
        mainImage: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400&h=300&fit=crop',
        tags: ['sneakers', 'sport', 'confortable', 'moderne'],
        isActive: true,
        isOnSale: true,
        salePercentage: 25,
        brand: 'SportStyle',
        model: 'Urban Runner',
        warranty: '6 mois',
        categoryId: categories[1].id
      },

      // Maison & Jardin
      {
        name: 'Machine à Café Automatique',
        description: 'Machine à café automatique avec broyeur intégré et préparation de café de qualité professionnelle.',
        shortDescription: 'Machine café automatique premium',
        price: 4824.00,
        currency: 'MAD',
        sku: 'COFFEE-MACHINE-001',
        stockQuantity: 20,
        weight: 8500,
        dimensions: { length: 35, width: 25, height: 45 },
        images: [
          'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&h=300&fit=crop',
          'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&h=300&fit=crop'
        ],
        mainImage: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&h=300&fit=crop',
        tags: ['café', 'machine', 'automatique', 'premium'],
        isActive: true,
        isFeatured: true,
        brand: 'CoffeePro',
        model: 'Auto Espresso',
        warranty: '2 ans',
        categoryId: categories[2].id
      },
      {
        name: 'Set de Casseroles Premium',
        description: 'Set complet de casseroles en acier inoxydable de haute qualité, parfait pour la cuisine.',
        shortDescription: 'Set casseroles inox premium',
        price: 2144.00,
        originalPrice: 299.99,
        currency: 'MAD',
        sku: 'POTS-SET-001',
        stockQuantity: 40,
        weight: 3500,
        dimensions: { length: 50, width: 30, height: 20 },
        images: [
          'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=300&fit=crop',
          'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=400&h=300&fit=crop'
        ],
        mainImage: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=300&fit=crop',
        tags: ['casseroles', 'cuisine', 'inox', 'premium'],
        isActive: true,
        isOnSale: true,
        salePercentage: 33,
        brand: 'KitchenPro',
        model: 'Stainless Set',
        warranty: '5 ans',
        categoryId: categories[2].id
      },

      // Sport & Loisirs
      {
        name: 'Vélo de Route Professionnel',
        description: 'Vélo de route léger et performant, idéal pour la compétition et les longues distances.',
        shortDescription: 'Vélo route professionnel',
        price: 26800.00,
        currency: 'MAD',
        sku: 'BIKE-ROAD-001',
        stockQuantity: 10,
        weight: 8500,
        dimensions: { length: 180, width: 60, height: 100 },
        images: [
          'https://images.unsplash.com/photo-1507035895480-2b3156c31fc8?w=400&h=300&fit=crop',
          'https://images.unsplash.com/photo-1576435728678-68d0fbf94e91?w=400&h=300&fit=crop'
        ],
        mainImage: 'https://images.unsplash.com/photo-1507035895480-2b3156c31fc8?w=400&h=300&fit=crop',
        tags: ['vélo', 'route', 'professionnel', 'performance'],
        isActive: true,
        isFeatured: true,
        brand: 'BikePro',
        model: 'Road Master',
        warranty: '3 ans',
        categoryId: categories[3].id
      },
      {
        name: 'Tapis de Yoga Premium',
        description: 'Tapis de yoga antidérapant et écologique, parfait pour la pratique du yoga.',
        shortDescription: 'Tapis yoga antidérapant premium',
        price: 857.60,
        originalPrice: 99.99,
        currency: 'MAD',
        sku: 'YOGA-MAT-001',
        stockQuantity: 60,
        weight: 1500,
        dimensions: { length: 180, width: 60, height: 0.5 },
        images: [
          'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&h=300&fit=crop',
          'https://images.unsplash.com/photo-1593811167562-9cef47bfc4d7?w=400&h=300&fit=crop'
        ],
        mainImage: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&h=300&fit=crop',
        tags: ['yoga', 'tapis', 'antidérapant', 'écologique'],
        isActive: true,
        isOnSale: true,
        salePercentage: 20,
        brand: 'YogaPro',
        model: 'Eco Mat',
        warranty: '1 an',
        categoryId: categories[3].id
      },

      // Livre & Culture
      {
        name: 'Collection Romans Bestsellers',
        description: 'Collection de 10 romans bestsellers dans une édition limitée avec couverture cartonnée.',
        shortDescription: 'Collection romans bestsellers',
        price: 1608.00,
        currency: 'MAD',
        sku: 'BOOKS-COLLECTION-001',
        stockQuantity: 25,
        weight: 2500,
        dimensions: { length: 25, width: 18, height: 15 },
        images: [
          'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&h=300&fit=crop',
          'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400&h=300&fit=crop'
        ],
        mainImage: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&h=300&fit=crop',
        tags: ['livres', 'romans', 'bestsellers', 'collection'],
        isActive: true,
        isFeatured: true,
        brand: 'BookPro',
        model: 'Bestseller Collection',
        warranty: 'N/A',
        categoryId: categories[4].id
      },
      {
        name: 'Guitare Acoustique Premium',
        description: 'Guitare acoustique de qualité professionnelle avec un son exceptionnel.',
        shortDescription: 'Guitare acoustique professionnelle',
        price: 9648.00,
        originalPrice: 12864.00,
        currency: 'MAD',
        sku: 'GUITAR-ACOUSTIC-001',
        stockQuantity: 15,
        weight: 2500,
        dimensions: { length: 100, width: 40, height: 15 },
        images: [
          'https://images.unsplash.com/photo-1525201548942-d8732f6617a0?w=400&h=300&fit=crop',
          'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=300&fit=crop'
        ],
        mainImage: 'https://images.unsplash.com/photo-1525201548942-d8732f6617a0?w=400&h=300&fit=crop',
        tags: ['guitare', 'acoustique', 'musique', 'professionnel'],
        isActive: true,
        isOnSale: true,
        salePercentage: 25,
        brand: 'MusicPro',
        model: 'Acoustic Master',
        warranty: '2 ans',
        categoryId: categories[4].id
      }
    ], { returning: true });

    console.log('✅ Produits créés avec succès.');
    console.log(`📊 ${categories.length} catégories et ${products.length} produits ajoutés à la base de données.`);
    
    console.log('🎉 Seeding terminé avec succès !');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors du seeding:', error);
    process.exit(1);
  }
}

seedData(); 