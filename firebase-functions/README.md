# Firebase Functions - Automatic User Cleanup

These Firebase Functions automatically clean up your database and storage when a user is deleted from Firebase Auth (either from Firebase Console or programmatically).

## 🚀 **What These Functions Do**

### **onUserDeleted**
- Automatically triggers when a user is deleted from Firebase Auth
- Cleans up all database records (orders, payments, addresses, etc.)
- Uses transactions for data consistency
- Logs all cleanup operations

### **onUserDeletedStorage**
- Automatically triggers when a user is deleted from Firebase Auth
- Removes all user files from Firebase Storage
- Cleans up profile photos and other user assets

## 📋 **Prerequisites**

1. **Firebase CLI installed:**
   ```bash
   npm install -g firebase-tools
   ```

2. **Firebase project initialized:**
   ```bash
   firebase login
   firebase init functions
   ```

3. **Environment variables set:**
   - `DATABASE_URL`: Your PostgreSQL connection string
   - `NODE_ENV`: Set to 'production' for SSL

## 🛠️ **Deployment Steps**

### **1. Install Dependencies**
```bash
cd firebase-functions
npm install
```

### **2. Set Environment Variables**
```bash
firebase functions:config:set database.url="your-postgresql-connection-string"
firebase functions:config:set app.environment="production"
```

### **3. Deploy Functions**
```bash
firebase deploy --only functions
```

### **4. Verify Deployment**
```bash
firebase functions:list
```

## 🔍 **Testing the Functions**

### **Test Database Cleanup:**
1. Create a test user in your app
2. Add some data (orders, payments, addresses)
3. Delete the user from Firebase Console
4. Check your database - all related data should be gone

### **Test Storage Cleanup:**
1. Upload a profile photo for a user
2. Delete the user from Firebase Console
3. Check Firebase Storage - user's files should be deleted

## 📊 **Monitoring**

### **View Function Logs:**
```bash
firebase functions:log --only onUserDeleted
firebase functions:log --only onUserDeletedStorage
```

### **Check Function Status:**
```bash
firebase functions:list
```

## ⚠️ **Important Notes**

- **Backup First**: Always backup your database before deploying
- **Test Environment**: Test on a development environment first
- **Monitoring**: Monitor function logs after deployment
- **Costs**: Firebase Functions have usage costs in production

## 🆘 **Troubleshooting**

### **Function Not Triggering:**
- Check Firebase Console → Functions → Logs
- Verify user deletion actually happened
- Check function deployment status

### **Database Connection Issues:**
- Verify `DATABASE_URL` is correct
- Check database permissions
- Ensure SSL settings are correct for production

### **Storage Cleanup Issues:**
- Check Storage bucket permissions
- Verify file paths are correct
- Check function logs for specific errors

## 🔒 **Security Considerations**

- Functions run with admin privileges
- Database connection uses service account
- All operations are logged for audit
- Transactions ensure data consistency

## 📈 **Performance**

- Functions run asynchronously
- Database operations use transactions
- Storage cleanup is non-blocking
- Functions have timeout limits (540s default) 