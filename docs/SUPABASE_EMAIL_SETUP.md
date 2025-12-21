# Supabase Email Configuration Guide for MarkSyncr

This guide walks you through configuring email authentication in Supabase so that signup confirmation emails are sent properly.

## Why Emails Aren't Being Sent

By default, Supabase uses their built-in email service which has **strict rate limits**:
- **Free tier**: 4 emails per hour
- **Pro tier**: 100 emails per hour

For production applications, you need to configure a custom SMTP provider.

## Step 1: Choose an SMTP Provider

Here are recommended providers with free tiers:

### Option A: Resend (Recommended)
- **Free tier**: 3,000 emails/month, 100 emails/day
- **Website**: https://resend.com
- **Pros**: Easy setup, great developer experience, good deliverability

### Option B: SendGrid
- **Free tier**: 100 emails/day forever
- **Website**: https://sendgrid.com
- **Pros**: Established provider, good documentation

### Option C: Mailgun
- **Free tier**: 5,000 emails/month for 3 months, then pay-as-you-go
- **Website**: https://mailgun.com
- **Pros**: Powerful API, good for transactional emails

### Option D: Postmark
- **Free tier**: 100 emails/month
- **Website**: https://postmarkapp.com
- **Pros**: Excellent deliverability, fast delivery

---

## Step 2: Set Up Resend (Recommended)

### 2.1 Create a Resend Account
1. Go to https://resend.com
2. Sign up with your email or GitHub
3. Verify your email address

### 2.2 Add Your Domain
1. In Resend dashboard, go to **Domains**
2. Click **Add Domain**
3. Enter your domain: `marksyncr.com`
4. Add the DNS records Resend provides to your domain registrar:
   - **MX record** for receiving bounces
   - **TXT record** for SPF
   - **CNAME records** for DKIM
5. Wait for verification (usually 5-10 minutes)

### 2.3 Get Your API Key
1. Go to **API Keys** in Resend dashboard
2. Click **Create API Key**
3. Name it: `marksyncr-supabase`
4. Copy the API key (starts with `re_`)

### 2.4 Get SMTP Credentials
Resend provides SMTP access. Use these settings:
- **Host**: `smtp.resend.com`
- **Port**: `465` (SSL) or `587` (TLS)
- **Username**: `resend`
- **Password**: Your API key (the `re_...` key)

---

## Step 3: Configure Supabase SMTP

### 3.1 Open Supabase Dashboard
1. Go to https://supabase.com/dashboard
2. Select your MarkSyncr project
3. Navigate to **Project Settings** (gear icon in sidebar)

### 3.2 Configure SMTP Settings
1. Go to **Authentication** section
2. Scroll down to **SMTP Settings**
3. Toggle **Enable Custom SMTP** to ON
4. Fill in the following:

| Field | Value (Resend) |
|-------|----------------|
| **Sender email** | `noreply@marksyncr.com` |
| **Sender name** | `MarkSyncr` |
| **Host** | `smtp.resend.com` |
| **Port number** | `465` |
| **Minimum interval** | `60` (seconds between emails to same address) |
| **Username** | `resend` |
| **Password** | Your Resend API key (`re_...`) |

5. Click **Save**

### 3.3 Test the Configuration
1. Click **Send test email** button
2. Enter your email address
3. Check your inbox for the test email
4. If it doesn't arrive, check spam folder

---

## Step 4: Configure URL Settings

### 4.1 Set Site URL
1. In Supabase dashboard, go to **Authentication** → **URL Configuration**
2. Set **Site URL** to: `https://marksyncr.com`

### 4.2 Add Redirect URLs
Add these URLs to **Redirect URLs**:

```
https://marksyncr.com/auth/callback
https://marksyncr.com/auth/reset-password
https://marksyncr.com/dashboard
http://localhost:3000/auth/callback
http://localhost:3000/auth/reset-password
http://localhost:3000/dashboard
```

Click **Save**.

---

## Step 5: Configure Email Templates (Optional)

### 5.1 Customize Email Templates
1. Go to **Authentication** → **Email Templates**
2. You can customize these templates:
   - **Confirm signup** - Sent when user signs up
   - **Invite user** - Sent when admin invites a user
   - **Magic Link** - Sent for passwordless login
   - **Change Email Address** - Sent when user changes email
   - **Reset Password** - Sent for password reset

### 5.2 Example: Customize Confirm Signup Template

**Subject:**
```
Confirm your MarkSyncr account
```

**Body:**
```html
<h2>Welcome to MarkSyncr!</h2>

<p>Thanks for signing up. Please confirm your email address by clicking the button below:</p>

<p>
  <a href="{{ .ConfirmationURL }}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
    Confirm Email Address
  </a>
</p>

<p>Or copy and paste this URL into your browser:</p>
<p>{{ .ConfirmationURL }}</p>

<p>This link will expire in 24 hours.</p>

<p>If you didn't create an account with MarkSyncr, you can safely ignore this email.</p>

<p>
  Best regards,<br>
  The MarkSyncr Team
</p>
```

---

## Step 6: Enable Email Confirmations

### 6.1 Check Email Auth Settings
1. Go to **Authentication** → **Providers**
2. Click on **Email**
3. Ensure these settings:
   - **Enable Email provider**: ON
   - **Confirm email**: ON (for requiring email confirmation)
   - **Secure email change**: ON (recommended)
   - **Secure password change**: ON (recommended)

---

## Troubleshooting

### Email not arriving?

1. **Check spam/junk folder** - First place to look
2. **Verify domain DNS** - Ensure SPF, DKIM, DMARC records are set
3. **Check Resend logs** - Go to Resend dashboard → Emails to see delivery status
4. **Check Supabase logs** - Go to Supabase dashboard → Logs → Auth
5. **Test SMTP connection** - Use a tool like https://www.smtper.net to test

### Common errors:

| Error | Solution |
|-------|----------|
| "Email rate limit exceeded" | Wait or upgrade Supabase plan |
| "Invalid SMTP credentials" | Double-check API key and username |
| "Connection refused" | Check port number (try 587 instead of 465) |
| "Domain not verified" | Complete DNS verification in Resend |

### Rate Limits

| Provider | Free Tier Limit |
|----------|-----------------|
| Supabase built-in | 4/hour |
| Resend | 100/day, 3000/month |
| SendGrid | 100/day |
| Mailgun | 5000/month (3 months) |

---

## Alternative: Disable Email Confirmation

If you want users to sign in immediately without email confirmation (not recommended for production):

1. Go to **Authentication** → **Providers** → **Email**
2. Toggle **Confirm email** to OFF
3. Users will be able to sign in immediately after signup

⚠️ **Warning**: This reduces security and allows fake email signups.

---

## Environment Variables

Make sure your Railway deployment has these environment variables set:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

These should already be configured if your app is working.

---

## Quick Checklist

- [ ] Created Resend account
- [ ] Added and verified domain in Resend
- [ ] Got Resend API key
- [ ] Configured SMTP in Supabase dashboard
- [ ] Sent test email successfully
- [ ] Set Site URL to `https://marksyncr.com`
- [ ] Added redirect URLs
- [ ] Enabled email confirmation in Auth settings
- [ ] Tested signup flow end-to-end

---

## Support

If you're still having issues:
1. Check Supabase status: https://status.supabase.com
2. Check Resend status: https://status.resend.com
3. Supabase Discord: https://discord.supabase.com
4. Resend Discord: https://discord.gg/resend
