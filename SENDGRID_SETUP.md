# SendGrid Setup Guide

## Common 403 Forbidden Error Fixes

If you're getting a `403 Forbidden` error from SendGrid, follow these steps:

### 1. Verify Your API Key

1. Go to [SendGrid Dashboard](https://app.sendgrid.com/)
2. Navigate to **Settings** → **API Keys**
3. Make sure your API key has **Mail Send** permissions
4. If creating a new key, select **Full Access** or at minimum **Mail Send** permission
5. Copy the API key and add it to your `.env` file:
   ```
   SENDGRID_API_KEY=SG.your_actual_api_key_here
   ```

### 2. Verify Your Sender Email

SendGrid requires you to verify the "from" email address:

1. Go to **Settings** → **Sender Authentication**
2. Click **Verify a Single Sender**
3. Enter your email address (e.g., `noreply@umod.ma`)
4. Complete the verification process (check your email)
5. Once verified, update your `.env`:
   ```
   SENDGRID_FROM_EMAIL=noreply@umod.ma
   SENDGRID_FROM_NAME=UMOD
   ```

### 3. Check API Key Restrictions

1. Go to **Settings** → **API Keys**
2. Click on your API key
3. Check if there are any **IP Access** restrictions
4. If restricted, either:
   - Add your server's IP address to the allowed list, OR
   - Remove the restriction (for development)

### 4. Domain Authentication (Recommended for Production)

For production, you should authenticate your entire domain:

1. Go to **Settings** → **Sender Authentication**
2. Click **Authenticate Your Domain**
3. Follow the DNS setup instructions
4. This allows you to send from any email on your domain

### 5. Test Your Setup

After completing the above steps:

1. Restart your backend server
2. Try the forgot password flow again
3. Check the console logs for detailed error messages

### Quick Checklist

- [ ] API key is set in `.env` as `SENDGRID_API_KEY`
- [ ] API key has "Mail Send" permissions
- [ ] From email is verified in SendGrid
- [ ] `SENDGRID_FROM_EMAIL` matches the verified email
- [ ] No IP restrictions blocking your server
- [ ] Backend server restarted after `.env` changes

### Troubleshooting

**Error: "The from address does not match a verified Sender Identity"**
- Solution: Verify the sender email in SendGrid dashboard

**Error: "API key does not have access to Mail Send"**
- Solution: Create a new API key with Mail Send permissions

**Error: "IP address not allowed"**
- Solution: Remove IP restrictions or add your server IP to allowed list

### Support

If issues persist:
1. Check SendGrid dashboard for detailed error messages
2. Review SendGrid activity logs: **Activity** → **Email Activity**
3. Contact SendGrid support if needed

