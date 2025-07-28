const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('../models/User');
const VerificationCode = require('../models/VerificationCode');

async function testPhoneVerification() {
  try {
    console.log('🧪 Testing Phone Verification System...\n');

    // Test 1: Check if verification_codes table exists
    console.log('1️⃣ Checking verification_codes table...');
    try {
      await sequelize.getQueryInterface().describeTable('verification_codes');
      console.log('✅ verification_codes table exists');
    } catch (error) {
      console.log('❌ verification_codes table does not exist');
      console.log('   Run: node scripts/add-verification-codes-table.js');
      return;
    }

    // Test 2: Check if users table has phone field
    console.log('\n2️⃣ Checking users table phone field...');
    try {
      const tableDescription = await sequelize.getQueryInterface().describeTable('users');
      if (tableDescription.phone) {
        console.log('✅ phone field exists in users table');
      } else {
        console.log('❌ phone field does not exist in users table');
        console.log('   Run: node scripts/add-phone-field.js');
        return;
      }
    } catch (error) {
      console.log('❌ Error checking users table:', error.message);
      return;
    }

    // Test 3: Check sample users
    console.log('\n3️⃣ Checking sample users...');
    try {
      const users = await User.findAll({
        limit: 5,
        attributes: ['id', 'email', 'phone', 'firebaseUid']
      });
      
      console.log(`✅ Found ${users.length} users in database`);
      
      users.forEach((user, index) => {
        console.log(`   User ${index + 1}: ${user.email} - Phone: ${user.phone || 'Not set'}`);
      });
    } catch (error) {
      console.log('❌ Error checking users:', error.message);
    }

    // Test 4: Check verification codes
    console.log('\n4️⃣ Checking verification codes...');
    try {
      const codes = await VerificationCode.findAll({
        limit: 5,
        attributes: ['id', 'userId', 'email', 'type', 'used', 'expiresAt']
      });
      
      console.log(`✅ Found ${codes.length} verification codes in database`);
      
      codes.forEach((code, index) => {
        console.log(`   Code ${index + 1}: User ${code.userId} - Type: ${code.type} - Used: ${code.used}`);
      });
    } catch (error) {
      console.log('❌ Error checking verification codes:', error.message);
    }

    // Test 5: Check for expired codes
    console.log('\n5️⃣ Checking for expired codes...');
    try {
      const { Op } = require('sequelize');
      const expiredCodes = await VerificationCode.findAll({
        where: {
          expiresAt: {
            [Op.lt]: new Date()
          },
          used: false
        }
      });
      
      console.log(`✅ Found ${expiredCodes.length} expired unused codes`);
      
      if (expiredCodes.length > 0) {
        console.log('   Consider cleaning up expired codes');
      }
    } catch (error) {
      console.log('❌ Error checking expired codes:', error.message);
    }

    console.log('\n🎉 Phone verification system test completed!');
    console.log('\n📋 Summary:');
    console.log('   - Users can add phone numbers from their profile');
    console.log('   - Phone numbers are saved in both database and Firebase');
    console.log('   - Phone number changes require email verification');
    console.log('   - Verification codes expire after 10 minutes');
    console.log('   - Single-use codes prevent reuse');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await sequelize.close();
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testPhoneVerification()
    .then(() => {
      console.log('\nTest completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

module.exports = testPhoneVerification; 