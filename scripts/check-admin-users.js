const { User } = require('../models');

async function checkAdminUsers() {
  try {
    console.log('🔍 Checking admin users in database...');
    
    // Get all users
    const allUsers = await User.findAll({
      attributes: ['id', 'email', 'firstName', 'lastName', 'role', 'firebaseUid']
    });

    console.log(`📊 Total users: ${allUsers.length}`);
    
    // Find admin users
    const adminUsers = allUsers.filter(user => user.role === 'admin');
    
    if (adminUsers.length > 0) {
      console.log(`✅ Found ${adminUsers.length} admin user(s):`);
      adminUsers.forEach(user => {
        console.log(`   - ${user.email} (ID: ${user.id}, Firebase UID: ${user.firebaseUid || 'None'})`);
      });
    } else {
      console.log('❌ No admin users found in database');
    }

    // Show all users
    console.log('\n📋 All users:');
    allUsers.forEach(user => {
      console.log(`   - ${user.email} (Role: ${user.role}, ID: ${user.id})`);
    });

    return adminUsers;
  } catch (error) {
    console.error('❌ Error checking admin users:', error);
    return [];
  }
}

checkAdminUsers().catch(console.error); 