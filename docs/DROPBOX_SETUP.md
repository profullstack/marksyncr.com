# Dropbox Integration Setup Guide

This guide covers how to set up your MarkSyncr app on Dropbox.com and implement the OAuth callback flow for bookmark syncing with checksum-based updates.

## Overview

The Dropbox integration follows a similar pattern to GitHub:
1. User authorizes the app via OAuth 2.0 with PKCE
2. App receives access token and refresh token
3. Bookmarks are stored as a JSON file in Dropbox
4. Updates only occur when checksum differs (avoiding unnecessary writes)

---

## Step 1: Create a Dropbox App

### 1.1 Go to Dropbox App Console

Navigate to: **https://www.dropbox.com/developers/apps**

### 1.2 Create New App

1. Click **"Create app"**
2. Choose API: **"Scoped access"** (recommended for new apps)
3. Choose access type:
   - **"App folder"** - Access limited to `/Apps/MarkSyncr/` folder (recommended for security)
   - OR **"Full Dropbox"** - Access to entire Dropbox (not recommended)
4. Name your app: `MarkSyncr` (or your preferred name)
5. Click **"Create app"**

### 1.3 Configure App Settings

In the app settings page:

#### Permissions Tab
Enable these scopes:
- `files.metadata.read` - Read file metadata
- `files.content.read` - Read file contents
- `files.content.write` - Write file contents
- `account_info.read` - Read user account info (for validation)

#### Settings Tab
1. **App key** (Client ID) - Copy this value
2. **App secret** (Client Secret) - Copy this value (keep secure!)
3. **OAuth 2 Redirect URIs** - Add your callback URLs:

```
# For web app (production) - THIS IS THE CORRECT URL
https://marksyncr.com/api/connect/dropbox/callback

# For web app (development)
http://localhost:3000/api/connect/dropbox/callback

# For browser extension (Chrome)
https://<extension-id>.chromiumapp.org/

# For browser extension (Firefox)
https://<extension-id>.extensions.allizom.org/
```

---

## Step 2: Environment Variables

Add these to your `.env` file:

```bash
# Dropbox OAuth Configuration
DROPBOX_CLIENT_ID=your_app_key_here
DROPBOX_CLIENT_SECRET=your_app_secret_here
DROPBOX_REDIRECT_URI=https://marksyncr.com/api/auth/callback/dropbox

# For development
DROPBOX_REDIRECT_URI_DEV=http://localhost:3000/api/auth/callback/dropbox
```

---

## Step 3: OAuth Flow Implementation

### 3.1 Authorization URL

The existing implementation in `packages/sources/src/oauth/dropbox-oauth.js` builds the authorization URL:

```typescript
import { buildAuthorizationUrl } from '@marksyncr/sources/oauth/dropbox-oauth';

const authUrl = buildAuthorizationUrl(
  process.env.DROPBOX_CLIENT_ID,
  process.env.DROPBOX_REDIRECT_URI,
  {
    state: generateRandomState(), // CSRF protection
    codeChallenge: pkceChallenge,  // PKCE for security
  }
);

// Redirect user to authUrl
```

### 3.2 Callback Handler

Create an API route to handle the OAuth callback:

```typescript
// apps/web/app/api/auth/callback/dropbox/route.ts

import { exchangeCodeForToken } from '@marksyncr/sources/oauth/dropbox-oauth';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return Response.redirect('/dashboard?error=dropbox_auth_failed');
  }

  if (!code || !state) {
    return Response.redirect('/dashboard?error=missing_params');
  }

  // Verify state matches stored state (CSRF protection)
  // ... state verification logic ...

  // Exchange code for tokens
  const tokens = await exchangeCodeForToken(
    code,
    process.env.DROPBOX_CLIENT_ID!,
    process.env.DROPBOX_CLIENT_SECRET!,
    process.env.DROPBOX_REDIRECT_URI!,
    codeVerifier // From PKCE flow
  );

  // Store tokens in Supabase (server-side only!)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.redirect('/login');
  }

  // Save sync source configuration
  await supabase.from('sync_sources').upsert({
    user_id: user.id,
    source_type: 'dropbox',
    access_token: tokens.access_token,      // Encrypt in production!
    refresh_token: tokens.refresh_token,    // Encrypt in production!
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    account_id: tokens.account_id,
    config: {
      path: '/Apps/MarkSyncr/bookmarks.json',
    },
    enabled: true,
  });

  return Response.redirect('/dashboard?success=dropbox_connected');
}
```

---

## Step 4: Sync Implementation with Checksum

### 4.1 Dropbox Sync Module (TypeScript)

Create `packages/sources/src/oauth/dropbox-sync.ts`:

```typescript
/**
 * Dropbox Sync Helper
 * 
 * Provides functions for syncing bookmarks to Dropbox with checksum-based updates.
 */

const DROPBOX_CONTENT_BASE = 'https://content.dropboxapi.com/2';
const DROPBOX_API_BASE = 'https://api.dropboxapi.com/2';

export interface BookmarkSyncData {
  bookmarks: Array<{
    url: string;
    title?: string;
    folderPath?: string;
    dateAdded?: number | string;
    id?: string;
  }>;
  tombstones?: Array<{
    url: string;
    deletedAt: number;
  }>;
  checksum?: string;
}

export interface BookmarkFile {
  version: string;
  metadata: {
    createdAt: string;
    lastModified: string;
    source: string;
    checksum?: string;
    contentHash?: string; // Dropbox content_hash
  };
  bookmarks: BookmarkSyncData['bookmarks'];
  tombstones?: BookmarkSyncData['tombstones'];
}

export interface GetBookmarkFileResult {
  content: BookmarkFile;
  contentHash: string; // Dropbox's content_hash for the file
  rev: string;         // Dropbox revision ID
}

export interface DropboxSyncResult {
  success: boolean;
  rev: string;
  created: boolean;
  skipped: boolean;
  bookmarkCount: number;
  error?: string;
}

/**
 * Get the bookmark file from Dropbox
 */
export async function getBookmarkFile(
  accessToken: string,
  path: string = '/Apps/MarkSyncr/bookmarks.json'
): Promise<GetBookmarkFileResult | null> {
  const response = await fetch(`${DROPBOX_CONTENT_BASE}/files/download`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path }),
    },
  });

  if (!response.ok) {
    if (response.status === 409) {
      // Path not found - file doesn't exist yet
      return null;
    }
    const error = await response.json().catch(() => ({ error_summary: 'Unknown error' }));
    throw new Error(`Failed to get bookmark file: ${error.error_summary}`);
  }

  // Get metadata from response header
  const apiResult = response.headers.get('dropbox-api-result');
  const metadata = apiResult ? JSON.parse(apiResult) : {};

  const contentString = await response.text();
  const content = JSON.parse(contentString) as BookmarkFile;

  return {
    content,
    contentHash: metadata.content_hash ?? '',
    rev: metadata.rev ?? '',
  };
}

/**
 * Update the bookmark file in Dropbox
 * Only updates if checksum differs
 */
export async function updateBookmarkFile(
  accessToken: string,
  path: string = '/Apps/MarkSyncr/bookmarks.json',
  data: BookmarkSyncData
): Promise<DropboxSyncResult> {
  if (!accessToken) {
    throw new Error('Access token is required');
  }

  // Try to get existing file to check checksum
  const existing = await getBookmarkFile(accessToken, path);
  
  const bookmarkCount = data.bookmarks.length;

  // Check if checksum matches - skip update if data hasn't changed
  if (existing && data.checksum && existing.content.metadata.checksum === data.checksum) {
    return {
      success: true,
      rev: existing.rev,
      created: false,
      skipped: true,
      bookmarkCount,
    };
  }

  const now = new Date().toISOString();

  // Build the file content
  const fileContent: BookmarkFile = {
    version: '1.0',
    metadata: {
      createdAt: existing?.content.metadata.createdAt ?? now,
      lastModified: now,
      source: 'marksyncr',
      checksum: data.checksum,
    },
    bookmarks: data.bookmarks,
    tombstones: data.tombstones,
  };

  const contentString = JSON.stringify(fileContent, null, 2);

  // Upload to Dropbox
  const response = await fetch(`${DROPBOX_CONTENT_BASE}/files/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({
        path,
        mode: existing ? { '.tag': 'update', update: existing.rev } : 'add',
        autorename: false,
        mute: true, // Don't trigger notifications
      }),
      'Content-Type': 'application/octet-stream',
    },
    body: contentString,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error_summary: 'Unknown error' }));
    throw new Error(`Failed to update bookmark file: ${error.error_summary}`);
  }

  const result = await response.json();

  return {
    success: true,
    rev: result.rev,
    created: !existing,
    skipped: false,
    bookmarkCount,
  };
}

/**
 * Sync bookmarks to Dropbox
 * Convenience function that handles the full sync flow
 */
export async function syncBookmarksToDropbox(
  accessToken: string,
  path: string,
  bookmarks: BookmarkSyncData['bookmarks'],
  tombstones: BookmarkSyncData['tombstones'] = [],
  checksum?: string
): Promise<DropboxSyncResult> {
  return updateBookmarkFile(accessToken, path, {
    bookmarks,
    tombstones,
    checksum,
  });
}

export default {
  getBookmarkFile,
  updateBookmarkFile,
  syncBookmarksToDropbox,
};
```

---

## Step 5: Token Refresh

Dropbox access tokens expire. Implement automatic refresh:

```typescript
// packages/sources/src/oauth/dropbox-token-manager.ts

import { refreshAccessToken } from './dropbox-oauth.js';

export interface TokenInfo {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export async function ensureValidToken(
  tokenInfo: TokenInfo,
  clientId: string,
  clientSecret: string
): Promise<TokenInfo> {
  // Check if token expires within 5 minutes
  const expiresIn = tokenInfo.expiresAt.getTime() - Date.now();
  const FIVE_MINUTES = 5 * 60 * 1000;

  if (expiresIn > FIVE_MINUTES) {
    // Token is still valid
    return tokenInfo;
  }

  // Refresh the token
  const newTokens = await refreshAccessToken(
    tokenInfo.refreshToken,
    clientId,
    clientSecret
  );

  return {
    accessToken: newTokens.access_token,
    refreshToken: tokenInfo.refreshToken, // Refresh token doesn't change
    expiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
  };
}
```

---

## Step 6: Database Schema

Ensure your `sync_sources` table supports Dropbox:

```sql
-- Already in supabase/migrations/003_sync_sources.sql
-- Verify these columns exist:

ALTER TABLE sync_sources ADD COLUMN IF NOT EXISTS
  token_expires_at TIMESTAMPTZ;

ALTER TABLE sync_sources ADD COLUMN IF NOT EXISTS
  account_id TEXT;

-- Add constraint for source types
ALTER TABLE sync_sources DROP CONSTRAINT IF EXISTS valid_source_type;
ALTER TABLE sync_sources ADD CONSTRAINT valid_source_type
  CHECK (source_type IN ('github', 'dropbox', 'google_drive', 'local'));
```

---

## Step 7: Checksum Comparison Flow

The sync flow with checksum comparison:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Sync Flow with Checksum                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Generate checksum from local bookmarks                       │
│     └─> SHA-256 hash of sorted, normalized bookmark data         │
│                                                                  │
│  2. Fetch existing file from Dropbox                             │
│     └─> GET /files/download                                      │
│     └─> Extract metadata.checksum from file content              │
│                                                                  │
│  3. Compare checksums                                            │
│     ├─> If MATCH: Skip upload (return skipped: true)             │
│     └─> If DIFFERENT: Proceed to upload                          │
│                                                                  │
│  4. Upload new file (only if checksum differs)                   │
│     └─> POST /files/upload with mode: 'update'                   │
│     └─> Include new checksum in metadata                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step 8: Error Handling

Handle common Dropbox API errors:

| Error Code | Meaning | Action |
|------------|---------|--------|
| 401 | Invalid/expired token | Refresh token or re-authenticate |
| 409 | Conflict (path not found, etc.) | Check error_summary for details |
| 429 | Rate limited | Implement exponential backoff |
| 500+ | Server error | Retry with backoff |

```typescript
export class DropboxApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorSummary: string
  ) {
    super(message);
    this.name = 'DropboxApiError';
  }
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof DropboxApiError) {
    return error.statusCode === 429 || error.statusCode >= 500;
  }
  return false;
}
```

---

## Step 9: Testing Checklist

Before deploying, verify:

- [ ] OAuth flow completes successfully
- [ ] Tokens are stored securely (encrypted in database)
- [ ] Token refresh works before expiration
- [ ] File creation works for new users
- [ ] Checksum comparison prevents unnecessary uploads
- [ ] File updates work with correct revision
- [ ] Error handling covers all edge cases
- [ ] Rate limiting is respected

---

## Security Considerations

1. **Never expose client secret** - Keep it server-side only
2. **Encrypt tokens at rest** - Use encryption for stored tokens
3. **Use PKCE** - Already implemented in dropbox-oauth.js
4. **Validate state parameter** - Prevent CSRF attacks
5. **Use App Folder access** - Limits exposure if token is compromised
6. **Implement token rotation** - Refresh tokens before expiration

---

## Comparison: GitHub vs Dropbox

| Feature | GitHub | Dropbox |
|---------|--------|---------|
| File storage | Repository | App folder |
| Version control | Git commits | Revisions |
| Checksum field | `metadata.checksum` | `metadata.checksum` |
| Update mode | SHA-based | Revision-based |
| Rate limits | 5000/hour | Varies by endpoint |
| Token expiry | No expiry | 4 hours |
| Refresh token | No | Yes |

---

## Next Steps

1. Create the TypeScript sync module (`dropbox-sync.ts`)
2. Add Vitest tests for the sync module
3. Implement the callback API route
4. Add UI for connecting Dropbox in dashboard
5. Test end-to-end flow
