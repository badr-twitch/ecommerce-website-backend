# 📱 Phone Number Verification System

## Overview

This system implements a secure phone number verification process that requires email verification for any phone number changes. Once a phone number is set, it cannot be changed directly - users must go through an email verification process.

## 🔐 Security Features

- **One-time phone number setting**: Phone numbers cannot be changed directly
- **Email verification required**: All phone number changes require email verification
- **6-digit verification codes**: Secure 6-digit codes sent via email
- **10-minute expiration**: Codes expire after 10 minutes for security
- **Single-use codes**: Each code can only be used once
- **Firebase integration**: Phone numbers are stored in both database and Firebase custom claims

## 🏗️ Architecture

### Database Schema

#### `verification_codes` Table
```sql
CREATE TABLE verification_codes (
  id SERIAL PRIMARY KEY,
  userId INTEGER REFERENCES users(id),
  email VARCHAR NOT NULL,
  code VARCHAR(6) NOT NULL,
  type ENUM('phone_change', 'phone_verification') DEFAULT 'phone_change',
  expiresAt TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  newPhoneNumber VARCHAR,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);
```

#### Indexes
- `(userId, type, used)` - For finding valid codes for a user
- `(email, code, used)` - For code verification
- `(expiresAt)` - For cleanup of expired codes

### API Endpoints

#### 1. Send Phone Verification Email
```
POST /api/auth/send-phone-verification
```
**Purpose**: Send verification email for phone number change
**Body**: `{ "newPhoneNumber": "+33 6 12 34 56 78" }`
**Response**: Success message with expiration time

#### 2. Verify Phone Change
```
POST /api/auth/verify-phone-change
```
**Purpose**: Verify and apply phone number change
**Body**: `{ "verificationCode": "123456" }`
**Response**: Success message with new phone number

#### 3. Remove Phone Number
```
DELETE /api/auth/remove-phone
```
**Purpose**: Remove user's phone number
**Response**: Success message

## 🔄 User Flow

### First Time Phone Setup
1. User enters phone number in profile
2. Phone number is saved directly (no verification needed)
3. Phone number is stored in both database and Firebase custom claims

### Phone Number Change
1. User clicks "Changer" button next to current phone number
2. User enters new phone number
3. System sends 6-digit verification code to user's email
4. User enters verification code
5. System verifies code and updates phone number
6. Phone number is updated in both database and Firebase

### Phone Number Removal
1. User clicks "Supprimer" button
2. Confirmation dialog appears
3. User confirms deletion
4. Phone number is removed from both database and Firebase

## 📧 Email Templates

### Phone Change Verification Email
- **Subject**: "📱 Vérification du changement de numéro de téléphone - UMOD"
- **Content**: 
  - User's name
  - New phone number
  - 6-digit verification code
  - Security warnings
  - Expiration information

## 🛠️ Implementation Details

### Backend Components

#### 1. VerificationCode Model
- Handles verification code storage and validation
- Includes expiration and usage tracking
- Supports multiple verification types

#### 2. Email Service
- Sends HTML and text email templates
- Handles email configuration and error handling
- Supports multiple email templates

#### 3. Auth Routes
- `send-phone-verification`: Generates and sends verification codes
- `verify-phone-change`: Validates codes and updates phone numbers
- `remove-phone`: Removes phone numbers with confirmation

#### 4. Profile Update Protection
- Prevents direct phone number changes in profile updates
- Redirects users to verification process
- Maintains data integrity

### Frontend Components

#### 1. Profile Page Updates
- Conditional phone number display
- Change/Remove buttons for existing numbers
- Modal for verification process
- Real-time validation and feedback

#### 2. Verification Modal
- Two-step verification process
- Step 1: Enter new phone number
- Step 2: Enter verification code
- Error handling and user feedback

#### 3. State Management
- Phone verification states
- Loading states for API calls
- Form validation and error handling

## 🔧 Setup Instructions

### 1. Database Migration
```bash
cd ecommerce-website-backend
node scripts/add-verification-codes-table.js
```

### 2. Email Configuration
Ensure your `.env` file has email settings:
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

### 3. Restart Services
```bash
# Backend
cd ecommerce-website-backend
npm run dev

# Frontend
cd ecommerce-website-frontend
npm run dev
```

## 🧪 Testing

### Test Custom Claims
Use the test button in the profile page to verify Firebase custom claims functionality.

### Test Phone Verification
1. Add a phone number to your profile
2. Try to change it using the verification process
3. Check email for verification code
4. Verify the change works correctly

## 🔒 Security Considerations

1. **Code Expiration**: 10-minute expiration prevents long-term code reuse
2. **Single Use**: Codes are marked as used after verification
3. **Email Verification**: Ensures user has access to their email
4. **Rate Limiting**: Consider implementing rate limiting for code generation
5. **Audit Trail**: All verification attempts are logged

## 🚀 Future Enhancements

1. **SMS Verification**: Add SMS verification as an alternative
2. **Rate Limiting**: Implement rate limiting for verification attempts
3. **Audit Logging**: Add detailed audit logs for security
4. **Multiple Phone Numbers**: Support for multiple phone numbers per user
5. **Phone Number Validation**: Enhanced phone number validation and formatting

## 📝 Notes

- Phone numbers are stored in both PostgreSQL database and Firebase custom claims
- The system automatically syncs phone numbers between database and Firebase
- Users must have a phone number before they can change it
- All phone number changes require email verification for security
- The system prevents direct phone number changes through the profile update API 