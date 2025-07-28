# 👥 User Role Management Guide

## 🔐 **Overview**

Your ecommerce website now has a complete user role management system that allows you to control who has admin access and who doesn't.

## 🎯 **User Roles**

### **Client (Default)**
- **Access**: Customer features only
- **Can**: Browse products, make purchases, manage profile
- **Cannot**: Access admin panel or manage the website

### **Admin**
- **Access**: Full administrative control
- **Can**: Manage products, categories, orders, users
- **Cannot**: Be deactivated by other admins

## 🛠️ **How to Manage User Roles**

### **Method 1: Command Line (Quick Setup)**

Make someone admin via command line:
```bash
cd ecommerce-website-backend
node scripts/make-admin.js user@example.com
```

### **Method 2: Admin Panel (Recommended)**

1. **Access Admin Panel**
   - Log in as an admin
   - Go to `/admin`
   - Click "Utilisateurs" tab

2. **View All Users**
   - See all users (clients and admins)
   - View registration dates
   - Check current roles and status

3. **Change User Roles**
   - Click "Rendre Admin" to make someone admin
   - Click "Rendre Client" to remove admin rights
   - Confirmation dialog for safety

4. **Manage User Status**
   - Activate/deactivate user accounts
   - Admins cannot be deactivated

## 🔒 **Security Features**

### **Role Protection**
- **Self-Protection**: Admins cannot change their own role
- **Admin Protection**: Admin accounts cannot be deactivated
- **Confirmation Dialogs**: Prevent accidental role changes

### **Access Control**
- **Firebase Authentication**: Required for all admin actions
- **Database Validation**: Server-side role verification
- **Session Management**: Automatic logout on token expiry

## 📊 **Admin Panel Features**

### **User Management Tab**
- **User List**: All users with roles and status
- **Registration Date**: When user joined
- **Role Display**: Clear visual indicators
- **Bulk Actions**: Quick role/status changes

### **Role Indicators**
- **🟣 Admin**: Purple badge for administrators
- **🔵 Client**: Blue badge for regular customers
- **🟢 Active**: Green badge for active accounts
- **🔴 Inactive**: Red badge for deactivated accounts

## 🚀 **Quick Start Guide**

### **Step 1: Make Your Account Admin**
```bash
cd ecommerce-website-backend
node scripts/make-admin.js your-email@example.com
```

### **Step 2: Access Admin Panel**
1. Log in to your account
2. Navigate to `/admin`
3. You'll see the admin dashboard

### **Step 3: Manage Other Users**
1. Click "Utilisateurs" tab
2. Find the user you want to manage
3. Click role/status buttons as needed

## 📋 **API Endpoints**

### **Get All Users**
```
GET /api/admin/users
```

### **Change User Role**
```
PUT /api/admin/users/:id/role
Body: { "role": "admin" | "client" }
```

### **Toggle User Status**
```
PUT /api/admin/users/:id/status
```

## 🎯 **Best Practices**

### **Admin Management**
1. **Limit Admin Access**: Only give admin rights to trusted users
2. **Regular Reviews**: Periodically review admin list
3. **Documentation**: Keep track of who has admin access
4. **Backup Admins**: Always have multiple admin accounts

### **Security Tips**
1. **Strong Passwords**: Ensure all admin accounts have strong passwords
2. **Regular Monitoring**: Check admin panel regularly for suspicious activity
3. **Role Audits**: Periodically review user roles
4. **Access Logs**: Monitor admin actions (future feature)

## 🔧 **Troubleshooting**

### **Common Issues**

**1. "Cannot change own role"**
- **Solution**: Use command line or have another admin change it
- **Prevention**: This is a security feature to prevent lockouts

**2. "Cannot deactivate admin"**
- **Solution**: Change role to client first, then deactivate
- **Prevention**: This prevents accidental admin deactivation

**3. "User not found"**
- **Solution**: Check email spelling in command line
- **Prevention**: Verify user exists before role changes

### **Debug Commands**
```bash
# Check user role in database
SELECT email, role, isActive FROM users WHERE email = 'user@example.com';

# List all admins
SELECT email, firstName, lastName FROM users WHERE role = 'admin';

# Check user status
SELECT email, isActive, createdAt FROM users ORDER BY createdAt DESC;
```

## 📈 **Future Enhancements**

### **Planned Features**
- **Role Hierarchy**: Different admin levels (super admin, moderator)
- **Permission System**: Granular permissions for different admin functions
- **Audit Logging**: Track all role changes and admin actions
- **Bulk Operations**: Change multiple users at once
- **Email Notifications**: Notify users when their role changes

### **Advanced Security**
- **Two-Factor Authentication**: For admin accounts
- **IP Whitelisting**: Restrict admin access to specific IPs
- **Session Timeout**: Automatic logout for inactive admin sessions
- **Activity Monitoring**: Real-time admin activity tracking

## 🎉 **Success Indicators**

### **When Everything Works**
- ✅ Admin can access `/admin` panel
- ✅ User list shows all users with roles
- ✅ Role changes work with confirmation dialogs
- ✅ Status changes work for non-admin users
- ✅ Self-protection prevents accidental lockouts

### **Testing Checklist**
- [ ] Make user admin via command line
- [ ] Access admin panel
- [ ] View user list
- [ ] Change user role (admin ↔ client)
- [ ] Toggle user status (active ↔ inactive)
- [ ] Verify self-protection works
- [ ] Test confirmation dialogs

---

**🎯 Your user role management system is now fully operational!**

You have complete control over who can access admin features and manage your ecommerce website. The system is secure, user-friendly, and ready for production use. 