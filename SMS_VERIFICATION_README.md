# 📱 SMS Verification System - UMOD Ecommerce

## Overview
This system replaces email verification with SMS verification for phone number changes and deletions. It uses Twilio as the SMS service provider.

## 🔧 Setup Instructions

### 1. Install Dependencies
```bash
npm install twilio
```

### 2. Environment Variables
Add these to your `.env` file:

```env
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number
```

### 3. Get Twilio Credentials
1. Sign up at [Twilio](https://www.twilio.com/)
2. Get your Account SID and Auth Token from the Twilio Console
3. Get a Twilio phone number for sending SMS

## 🚀 How It Works

### Flow:
1. **User clicks "Changer" or "Supprimer"** on phone number
2. **System sends SMS** to current phone number with 6-digit code
3. **User enters code** in verification modal
4. **After verification**, user can change/delete phone number

### API Endpoints:

#### `POST /api/auth/send-phone-verification`
- Sends SMS verification code to current phone number
- Requires authentication
- Returns success/error message

#### `POST /api/auth/verify-current-phone`
- Verifies the SMS code
- Marks code as used
- Returns verification success

#### `POST /api/auth/set-new-phone`
- Sets new phone number (after verification)
- Updates database and Firebase custom claims

#### `DELETE /api/auth/remove-phone`
- Removes phone number (after verification)
- Updates database and Firebase custom claims

## 🧪 Testing

### Test SMS Configuration:
```bash
node scripts/test-sms.js
```

### Test Phone Verification Flow:
1. Go to profile page
2. Click "Changer" on phone number
3. Check phone for SMS
4. Enter verification code
5. Change phone number

## 📱 SMS Message Format
```
UMOD: Votre code de vérification est 123456. Ce code expire dans 10 minutes.
```

## 🔐 Security Features
- ✅ **6-digit verification codes**
- ✅ **10-minute expiration**
- ✅ **Single-use codes**
- ✅ **Current phone verification** before any changes
- ✅ **Database storage** of verification codes
- ✅ **Firebase custom claims** synchronization

## 🛠️ Files Modified

### Backend:
- `services/smsService.js` - New SMS service
- `routes/auth.js` - Updated to use SMS instead of email
- `package.json` - Added Twilio dependency

### Frontend:
- `pages/ProfilePage.jsx` - Updated UI text and flow

## 💰 Cost Considerations
- Twilio charges per SMS sent
- Free trial available for testing
- Consider rate limiting for production

## 🔄 Migration from Email
- Removed email verification for phone changes
- Kept email service for other features (password reset, etc.)
- Updated all UI text from "email" to "SMS"

## 🚨 Troubleshooting

### SMS Not Received:
1. Check Twilio account balance
2. Verify phone number format (+33...)
3. Check Twilio logs in console
4. Ensure phone number is valid

### Configuration Issues:
1. Verify environment variables
2. Check Twilio credentials
3. Run test script for debugging

## 📞 Support
For issues with SMS delivery, check:
- Twilio Console logs
- Account status and balance
- Phone number formatting
- Regional SMS restrictions 