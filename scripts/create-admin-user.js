const { User } = require('../models');

async function createAdminUser() {
  try {
    console.log('👑 Creating/Updating admin user...');
    
    // You can change this email to your preferred admin email
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminFirstName = process.env.ADMIN_FIRST_NAME || 'Admin';
    const adminLastName = process.env.ADMIN_LAST_NAME || 'User';
    
    console.log(`📧 Looking for user with email: ${adminEmail}`);
    
    // Try to find existing user
    let adminUser = await User.findOne({
      where: { email: adminEmail }
    });

    if (adminUser) {
      console.log(`✅ Found existing user: ${adminUser.email}`);
      
      // Update to admin role
      await adminUser.update({ role: 'admin' });
      console.log(`✅ Updated user ${adminUser.email} to admin role`);
      
    } else {
      console.log(`❌ User ${adminEmail} not found`);
      console.log('📝 Creating new admin user...');
      
      // Create new admin user
      adminUser = await User.create({
        email: adminEmail,
        firstName: adminFirstName,
        lastName: adminLastName,
        role: 'admin',
        isActive: true,
        firebaseUid: `admin-${Date.now()}` // Temporary Firebase UID
      });
      
      console.log(`✅ Created new admin user: ${adminUser.email}`);
    }

    console.log('\n🎉 Admin user setup completed!');
    console.log(`📧 Email: ${adminUser.email}`);
    console.log(`👤 Name: ${adminUser.firstName} ${adminUser.lastName}`);
    console.log(`🆔 ID: ${adminUser.id}`);
    console.log(`🔑 Role: ${adminUser.role}`);
    
    console.log('\n📝 Next steps:');
    console.log('1. Make sure your backend server is running');
    console.log('2. Run the JWT test script: node scripts/test-notifications-jwt.js');
    console.log('3. Or use the simple test: node scripts/test-notifications-simple.js');
    
    return adminUser;
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    return null;
  }
}

createAdminUser().catch(console.error); 