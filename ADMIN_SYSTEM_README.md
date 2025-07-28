# 🏗️ Admin System Documentation

## 📋 Overview

The admin system provides comprehensive management capabilities for your ecommerce website. It includes role-based access control, product management, category management, order management, and user management.

## 🔐 Authentication & Authorization

### User Roles
- **`client`**: Regular customer account (default)
- **`admin`**: Full administrative access

### Admin Authentication Flow
1. User logs in with Firebase Authentication
2. Backend checks user role in database
3. Admin routes are protected with `firebaseAuth` + `adminAuth` middleware
4. Only users with `role: 'admin'` can access admin features

## 🛠️ Setup Instructions

### 1. Make Your Account Admin

Run this command in the backend directory:

```bash
node scripts/make-admin.js your-email@example.com
```

### 2. Access Admin Panel

1. Log in to your account
2. Navigate to `/admin` in your browser
3. You should see the admin dashboard

## 📊 Admin Features

### Dashboard
- **Statistics Overview**: Total users, products, categories, orders
- **Recent Orders**: Latest 10 orders with customer details
- **Top Products**: Best-selling products

### Product Management
- **View All Products**: Paginated list with search and filters
- **Add New Product**: Complete product creation form
- **Edit Product**: Update product details, price, stock
- **Delete Product**: Remove products from catalog
- **Product Categories**: Associate products with categories

### Category Management
- **View All Categories**: List with product counts
- **Add New Category**: Create new product categories
- **Edit Category**: Update category name, description, image
- **Delete Category**: Remove categories (only if no products)

### Order Management
- **View All Orders**: Complete order history with customer details
- **Order Details**: Full order information with items
- **Update Status**: Change order status (pending → processing → shipped → delivered)
- **Order Tracking**: Monitor order progress

### User Management
- **View All Users**: List of all customer accounts
- **User Details**: Profile information and activity
- **Activate/Deactivate**: Toggle user account status
- **User Analytics**: Registration dates, order history

## 🔌 API Endpoints

### Dashboard
```
GET /api/admin/dashboard
```

### Products
```
GET    /api/admin/products          # List all products
POST   /api/admin/products          # Create new product
PUT    /api/admin/products/:id      # Update product
DELETE /api/admin/products/:id      # Delete product
```

### Categories
```
GET    /api/admin/categories        # List all categories
POST   /api/admin/categories        # Create new category
PUT    /api/admin/categories/:id    # Update category
DELETE /api/admin/categories/:id    # Delete category
```

### Orders
```
GET    /api/admin/orders            # List all orders
PUT    /api/admin/orders/:id/status # Update order status
```

### Users
```
GET    /api/admin/users             # List all users
PUT    /api/admin/users/:id/status  # Toggle user status
```

## 🎨 Frontend Components

### Admin Context (`AdminContext.jsx`)
- Manages admin authentication state
- Provides admin data and functions
- Handles admin-specific API calls

### Admin Dashboard (`AdminDashboard.jsx`)
- Main admin interface
- Tabbed navigation (Dashboard, Products, Categories, Orders, Users)
- Real-time data updates
- Responsive design with modern UI

### Header Integration
- Admin link appears in user dropdown for admin users
- Automatic role detection
- Seamless navigation

## 🔒 Security Features

### Authentication
- Firebase Authentication required
- JWT token validation
- Session management

### Authorization
- Role-based access control
- Admin-only route protection
- Database-level role validation

### Data Protection
- Input validation and sanitization
- SQL injection prevention
- XSS protection
- CSRF protection

## 📱 User Interface

### Modern Design
- **Glassmorphism**: Translucent panels with backdrop blur
- **Gradient Accents**: Blue to purple gradients
- **Smooth Animations**: Hover effects and transitions
- **Responsive Layout**: Works on all devices

### Navigation
- **Tabbed Interface**: Easy switching between sections
- **Breadcrumb Navigation**: Clear location indication
- **Search & Filters**: Quick data access
- **Pagination**: Handle large datasets

### Interactive Elements
- **Real-time Updates**: Live data refresh
- **Toast Notifications**: Success/error feedback
- **Confirmation Dialogs**: Safe deletion
- **Loading States**: User feedback during operations

## 🚀 Usage Examples

### Making a User Admin
```bash
cd ecommerce-website-backend
node scripts/make-admin.js admin@umod.fr
```

### Adding a Product
1. Go to `/admin`
2. Click "Produits" tab
3. Click "Ajouter un produit"
4. Fill in product details
5. Select category
6. Save

### Managing Orders
1. Go to `/admin`
2. Click "Commandes" tab
3. View order details
4. Update status as needed
5. Track delivery progress

### User Management
1. Go to `/admin`
2. Click "Utilisateurs" tab
3. View user list
4. Activate/deactivate accounts
5. Monitor user activity

## 🔧 Configuration

### Environment Variables
```env
# Required for admin functionality
FIREBASE_SERVICE_ACCOUNT=your-firebase-service-account
FIREBASE_DATABASE_URL=your-firebase-database-url
```

### Database Schema
```sql
-- User table with role field
CREATE TABLE users (
  id UUID PRIMARY KEY,
  role ENUM('client', 'admin') DEFAULT 'client',
  -- other fields...
);
```

## 🐛 Troubleshooting

### Common Issues

**1. "Access Denied" Error**
- Check if user has admin role in database
- Verify Firebase authentication
- Ensure proper middleware setup

**2. Admin Link Not Showing**
- Check user role in database
- Verify admin context is working
- Check browser console for errors

**3. API Errors**
- Check server logs for detailed errors
- Verify database connections
- Ensure all required fields are provided

### Debug Commands
```bash
# Check user role
SELECT email, role FROM users WHERE email = 'your-email@example.com';

# Test admin authentication
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/admin/dashboard
```

## 📈 Future Enhancements

### Planned Features
- **Analytics Dashboard**: Sales charts and metrics
- **Inventory Management**: Stock alerts and reordering
- **Customer Support**: Ticket system integration
- **Marketing Tools**: Email campaigns and promotions
- **Advanced Reporting**: Custom reports and exports

### Technical Improvements
- **Real-time Updates**: WebSocket integration
- **Bulk Operations**: Mass product/category updates
- **Advanced Search**: Full-text search capabilities
- **Export Features**: CSV/PDF data export
- **Audit Logging**: Track all admin actions

## 📞 Support

For admin system issues:
1. Check this documentation
2. Review server logs
3. Test with different user accounts
4. Verify database permissions

---

**🎯 The admin system is now fully operational!** 

Your ecommerce website now has a complete administrative interface for managing products, categories, orders, and users. The system is secure, scalable, and ready for production use. 