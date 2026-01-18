# Supabase Email Configuration Guide for MarkSyncr

This guide walks you through configuring email authentication in Supabase using Mailgun so that signup confirmation emails are sent properly.

## Why Emails Aren't Being Sent

By default, Supabase uses their built-in email service which has **strict rate limits**:

- **Free tier**: 4 emails per hour
- **Pro tier**: 100 emails per hour

For production applications, you need to configure a custom SMTP provider. We recommend **Mailgun** for its reliability and generous free tier.

---

## Step 1: Create a Mailgun Account

### 1.1 Sign Up

1. Go to https://www.mailgun.com
2. Click **Sign Up** or **Start Sending**
3. Create an account with your email
4. Verify your email address

### 1.2 Free Tier Details

- **5,000 emails/month free** for the first 3 months
- After trial: Pay-as-you-go pricing (~$0.80 per 1,000 emails)
- No credit card required for trial

---

## Step 2: Add and Verify Your Domain

### 2.1 Add Your Domain

1. In Mailgun dashboard, go to **Sending** → **Domains**
2. Click **Add New Domain**
3. Enter your domain: `mg.marksyncr.com` (using a subdomain is recommended)
4. Select your region (US or EU)
5. Click **Add Domain**

### 2.2 Configure DNS Records

Mailgun will provide DNS records to add. Go to your domain registrar (Cloudflare, Namecheap, etc.) and add:

**Required Records:**

| Type  | Name                              | Value                             |
| ----- | --------------------------------- | --------------------------------- |
| TXT   | mg.marksyncr.com                  | `v=spf1 include:mailgun.org ~all` |
| TXT   | smtp.\_domainkey.mg.marksyncr.com | (DKIM key provided by Mailgun)    |
| CNAME | email.mg.marksyncr.com            | `mailgun.org`                     |

**Optional but Recommended:**

| Type | Name             | Value                           |
| ---- | ---------------- | ------------------------------- |
| MX   | mg.marksyncr.com | `mxa.mailgun.org` (priority 10) |
| MX   | mg.marksyncr.com | `mxb.mailgun.org` (priority 10) |

### 2.3 Verify Domain

1. After adding DNS records, wait 5-10 minutes for propagation
2. In Mailgun, click **Verify DNS Settings**
3. All records should show green checkmarks when verified

---

## Step 3: Get SMTP Credentials

### 3.1 Find Your SMTP Credentials

1. In Mailgun dashboard, go to **Sending** → **Domain Settings**
2. Select your domain (`mg.marksyncr.com`)
3. Click on **SMTP credentials** tab

### 3.2 Create SMTP User (if needed)

1. Click **Add new SMTP user**
2. Enter a login name (e.g., `postmaster`)
3. Click **Create**
4. Copy the generated password (you won't see it again!)

### 3.3 Your SMTP Settings

Note these values for Supabase configuration:

| Setting       | Value                                                 |
| ------------- | ----------------------------------------------------- |
| **SMTP Host** | `smtp.mailgun.org` (US) or `smtp.eu.mailgun.org` (EU) |
| **Port**      | `587` (TLS) or `465` (SSL)                            |
| **Username**  | `postmaster@mg.marksyncr.com`                         |
| **Password**  | Your SMTP password from step 3.2                      |

---

## Step 4: Configure Supabase SMTP

### 4.1 Open Supabase Dashboard

1. Go to https://supabase.com/dashboard
2. Select your MarkSyncr project
3. Navigate to **Project Settings** (gear icon in sidebar)

### 4.2 Configure SMTP Settings

1. Go to **Authentication** section
2. Scroll down to **SMTP Settings**
3. Toggle **Enable Custom SMTP** to ON
4. Fill in the following:

| Field                | Value                                         |
| -------------------- | --------------------------------------------- |
| **Sender email**     | `noreply@mg.marksyncr.com`                    |
| **Sender name**      | `MarkSyncr`                                   |
| **Host**             | `smtp.mailgun.org`                            |
| **Port number**      | `587`                                         |
| **Minimum interval** | `60` (seconds between emails to same address) |
| **Username**         | `postmaster@mg.marksyncr.com`                 |
| **Password**         | Your Mailgun SMTP password                    |

5. Click **Save**

### 4.3 Test the Configuration

1. Click **Send test email** button
2. Enter your email address
3. Check your inbox for the test email
4. If it doesn't arrive, check spam folder

---

## Step 5: Configure URL Settings

### 5.1 Set Site URL

1. In Supabase dashboard, go to **Authentication** → **URL Configuration**
2. Set **Site URL** to: `https://marksyncr.com`

### 5.2 Add Redirect URLs

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

## Step 6: Configure Email Templates (Optional)

### 6.1 Customize Email Templates

1. Go to **Authentication** → **Email Templates**
2. You can customize these templates:
   - **Confirm signup** - Sent when user signs up
   - **Invite user** - Sent when admin invites a user
   - **Magic Link** - Sent for passwordless login
   - **Change Email Address** - Sent when user changes email
   - **Reset Password** - Sent for password reset

### 6.2 Example: Customize Confirm Signup Template

**Subject:**

```
Confirm your MarkSyncr account
```

**Body:**

```html
<h2>Welcome to MarkSyncr!</h2>

<p>Thanks for signing up. Please confirm your email address by clicking the button below:</p>

<p>
  <a
    href="{{ .ConfirmationURL }}"
    style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;"
  >
    Confirm Email Address
  </a>
</p>

<p>Or copy and paste this URL into your browser:</p>
<p>{{ .ConfirmationURL }}</p>

<p>This link will expire in 24 hours.</p>

<p>If you didn't create an account with MarkSyncr, you can safely ignore this email.</p>

<p>
  Best regards,<br />
  The MarkSyncr Team
</p>
```

---

## Step 7: Enable Email Confirmations

### 7.1 Check Email Auth Settings

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
2. **Verify domain DNS** - Ensure SPF, DKIM records are properly set
3. **Check Mailgun logs** - Go to Mailgun dashboard → Logs → Messages to see delivery status
4. **Check Supabase logs** - Go to Supabase dashboard → Logs → Auth
5. **Test SMTP connection** - Use a tool like https://www.smtper.net to test

### Common Errors

| Error                       | Solution                                   |
| --------------------------- | ------------------------------------------ |
| "Email rate limit exceeded" | Wait or upgrade Supabase plan              |
| "Invalid SMTP credentials"  | Double-check username and password         |
| "Connection refused"        | Check port number (try 587 instead of 465) |
| "Domain not verified"       | Complete DNS verification in Mailgun       |
| "Sender not authorized"     | Use an email from your verified domain     |

### Mailgun Logs

To debug email delivery issues:

1. Go to Mailgun dashboard → **Sending** → **Logs**
2. Filter by your domain
3. Look for:
   - **Delivered** - Email was accepted by recipient's server
   - **Dropped** - Email was rejected (check reason)
   - **Bounced** - Recipient server rejected the email
   - **Complained** - Recipient marked as spam

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

- [ ] Created Mailgun account
- [ ] Added domain (`mg.marksyncr.com`) in Mailgun
- [ ] Added DNS records (SPF, DKIM, CNAME)
- [ ] Verified domain in Mailgun
- [ ] Created SMTP credentials in Mailgun
- [ ] Configured SMTP in Supabase dashboard
- [ ] Sent test email successfully
- [ ] Set Site URL to `https://marksyncr.com`
- [ ] Added redirect URLs
- [ ] Enabled email confirmation in Auth settings
- [ ] Tested signup flow end-to-end

---

## Mailgun Pricing Reference

| Plan          | Emails/Month | Price               |
| ------------- | ------------ | ------------------- |
| Trial         | 5,000        | Free (3 months)     |
| Foundation    | 50,000       | $35/month           |
| Scale         | 100,000      | $90/month           |
| Pay-as-you-go | Variable     | ~$0.80/1,000 emails |

For most startups, the trial period followed by pay-as-you-go is sufficient.

---

## Support

If you're still having issues:

1. Check Supabase status: https://status.supabase.com
2. Check Mailgun status: https://status.mailgun.com
3. Mailgun documentation: https://documentation.mailgun.com
4. Supabase Discord: https://discord.supabase.com
