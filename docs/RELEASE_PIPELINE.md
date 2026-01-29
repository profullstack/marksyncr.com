# Extension Release Pipeline

Automated publishing of the MarkSyncr browser extension to Chrome Web Store, Firefox Add-ons (AMO), and Microsoft Edge Add-ons via GitHub Actions.

## How It Works

1. Push a semver Git tag (e.g. `v0.7.0`)
2. The workflow builds the extension, validates the tag version against `manifest.json`, and uploads ZIPs as artifacts
3. Three parallel jobs publish to Chrome, Firefox, and Edge
4. Or trigger manually from the Actions tab with `workflow_dispatch`

## Prerequisites

- Existing store listings on all three platforms
- Manifest V3 extension (already in place)
- All secrets configured in GitHub (see below)

## Secrets Configuration

Go to **Settings > Secrets and variables > Actions** in your GitHub repo and add these secrets.

### Build Environment

These are embedded into the extension at build time:

| Secret | Description | Example |
|--------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJhbG...` |
| `NEXT_PUBLIC_APP_URL` | Production app URL | `https://marksyncr.com` |

### Chrome Web Store

| Secret | Description | How to obtain |
|--------|-------------|---------------|
| `CHROME_EXTENSION_ID` | Extension ID from CWS dashboard | Chrome Web Store Developer Dashboard > your extension > URL contains the ID |
| `CHROME_CLIENT_ID` | OAuth2 client ID | Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client ID |
| `CHROME_CLIENT_SECRET` | OAuth2 client secret | Same location as client ID |
| `CHROME_REFRESH_TOKEN` | OAuth2 refresh token | See [Obtaining a Chrome refresh token](#obtaining-a-chrome-refresh-token) |

### Firefox Add-ons (AMO)

| Secret | Description | How to obtain |
|--------|-------------|---------------|
| `FIREFOX_JWT_ISSUER` | API key (JWT issuer) | https://addons.mozilla.org/en-US/developers/addon/api/key/ |
| `FIREFOX_JWT_SECRET` | API secret (JWT secret) | Same page as above |

The Firefox addon ID (`marksyncr@marksyncr.com`) is embedded in `manifest.firefox.json` under `browser_specific_settings.gecko.id`.

### Microsoft Edge Add-ons

| Secret | Description | How to obtain |
|--------|-------------|---------------|
| `EDGE_PRODUCT_ID` | Product ID | Partner Center > your extension > Product ID |
| `EDGE_CLIENT_ID` | Azure AD app client ID | Azure Portal > App registrations > your app |
| `EDGE_CLIENT_SECRET` | Azure AD app client secret | Azure Portal > App registrations > Certificates & secrets |

## Obtaining a Chrome Refresh Token

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the **Chrome Web Store API**
3. Create an **OAuth 2.0 Client ID** (type: Web application)
4. Add `https://developers.google.com/oauthplayground` as an authorized redirect URI
5. Go to [OAuth Playground](https://developers.google.com/oauthplayground/)
6. Click the gear icon, check "Use your own OAuth credentials", enter your client ID and secret
7. In Step 1, enter scope: `https://www.googleapis.com/auth/chromewebstore`
8. Authorize and exchange the authorization code for tokens
9. Copy the **refresh token** from Step 2

## Setting Up Edge API Access

1. Go to [Azure Portal](https://portal.azure.com/) > **App registrations** > **New registration**
2. Name: `MarkSyncr Edge Publishing`, Supported account types: **Personal Microsoft accounts only**
3. After creation, note the **Application (client) ID**
4. Go to **Certificates & secrets** > **New client secret** and note the value
5. Go to **API permissions** > **Add a permission** > **APIs my organization uses** > search for `Microsoft Edge Addons` > add `Product.ReadWrite`
6. In [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/), go to your extension settings and link the Azure AD app

## Triggering a Release

### Via Git Tag

```bash
# Ensure manifest versions match the tag
git tag v0.7.0
git push origin v0.7.0
```

### Via Manual Dispatch

1. Go to **Actions** > **Extension Release Pipeline**
2. Click **Run workflow**
3. Set `publish` to `true` to publish, or `false` for build-only

### Version Mismatch Protection

When triggered by a tag, the workflow extracts the version from the tag (`v0.7.0` -> `0.7.0`) and compares it against the version in `manifest.chrome.json`. If they don't match, the build fails immediately. Use the `version:bump` script before tagging:

```bash
pnpm version:bump    # updates all package.json + manifest files
git add -A && git commit -m "v0.7.0"
git tag v0.7.0
git push origin master --tags
```

## Workflow Architecture

```
push tag v*.*.*
       |
   [build job]
   - checkout + install
   - validate version
   - pnpm turbo build --filter=@marksyncr/extension...
   - upload chrome + firefox ZIPs as artifacts
       |
       +---> [chrome-release]   (parallel)
       |     - download chrome ZIP
       |     - OAuth2 token exchange
       |     - PUT upload to CWS API
       |     - POST publish
       |
       +---> [firefox-release]  (parallel)
       |     - download firefox ZIP
       |     - unzip + web-ext sign --channel listed
       |
       +---> [edge-release]     (parallel)
             - download chrome ZIP (Edge uses same format)
             - client_credentials token
             - POST upload + poll status
             - POST publish submission
```

## Artifacts

Build ZIPs are stored as GitHub Actions artifacts for 30 days. You can download them from the workflow run summary for manual testing or submission.

## Troubleshooting

### Build fails: version mismatch

The tag version doesn't match `manifest.chrome.json`. Run `pnpm version:bump` and commit before tagging.

### Chrome: "Failed to obtain access token"

- Verify `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, and `CHROME_REFRESH_TOKEN` are correct
- Refresh tokens can expire if unused for 6 months or if the OAuth consent is revoked
- Re-generate from [OAuth Playground](https://developers.google.com/oauthplayground/)

### Chrome: upload succeeds but publish fails

- The extension may have policy violations flagged by automated review
- Check the [Developer Dashboard](https://chrome.google.com/webstore/devconsole/) for details
- `PUBLISHED_WITH_FRICTION_WARNING` is treated as success (warnings are informational)

### Firefox: web-ext sign fails

- Verify `FIREFOX_JWT_ISSUER` and `FIREFOX_JWT_SECRET` at https://addons.mozilla.org/en-US/developers/addon/api/key/
- The addon ID in `manifest.firefox.json` must match your AMO listing
- AMO may reject the submission if validation fails (CSP issues, prohibited APIs, etc.)
- Check the AMO developer hub for validation details

### Edge: authentication fails

- Verify Azure AD app registration is configured for personal Microsoft accounts
- Ensure `Microsoft Edge Addons API` permission is granted
- Client secrets expire - check the expiry date in Azure Portal

### Edge: upload processing times out

- The workflow polls for up to 5 minutes. Large extensions may need longer
- Check [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/) for submission status
- You can re-run the publish step manually if the upload eventually succeeds

### Build fails: missing environment variables

If the extension builds but doesn't work (empty Supabase URL, etc.), ensure these secrets are set:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`

These are embedded at build time via Vite's `define` config.

## Security Notes

- All credentials are stored as GitHub encrypted secrets
- Access tokens are masked in logs via `::add-mask::`
- The workflow uses `permissions: contents: read` (least privilege)
- Rotate secrets quarterly:
  - Chrome: refresh token + client secret
  - Firefox: JWT secret
  - Edge: Azure AD client secret
