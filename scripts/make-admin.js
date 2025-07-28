const User = require('../models/User');
const sequelize = require('../config/database');

async function makeAdmin(email) {
  try {
    // Connect to database
    await sequelize.authenticate();
    console.log('✅ Connected to database');

    // Find user by email
    const user = await User.findOne({ where: { email } });
    
    if (!user) {
      console.log('❌ User not found with email:', email);
      return;
    }

    // Update user role to admin
    await user.update({ role: 'admin' });
    
    console.log('✅ User updated successfully:');
    console.log('- Name:', user.firstName, user.lastName);
    console.log('- Email:', user.email);
    console.log('- Role:', user.role);
    console.log('- Firebase UID:', user.firebaseUid);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await sequelize.close();
  }
}

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.log('❌ Please provide an email address');
  console.log('Usage: node make-admin.js <email>');
  process.exit(1);
}

makeAdmin(email); 