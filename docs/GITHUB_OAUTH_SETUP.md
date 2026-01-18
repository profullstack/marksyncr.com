# GitHub Integration Setup Guide

This guide covers how to set up your MarkSyncr app on GitHub.com and implement the OAuth callback flow for bookmark syncing.

## Overview

The GitHub integration allows users to:

1. Authorize the app via OAuth 2.0
2. Auto-create a `marksyncr-bookmarks` repository
3. Store bookmarks as a JSON file in the repository
4. Updates only occur when checksum differs (avoiding unnecessary commits)

---

## Step 1: Create a GitHub OAuth App

### 1.1 Go to GitHub Developer Settings

Navigate to: **https://github.com/settings/developers**

Or: GitHub → Settings → Developer settings → OAuth Apps

### 1.2 Create New OAuth App

1. Click **"New OAuth App"**
2. Fill in the application details:

| Field                          | Value                                               |
| ------------------------------ | --------------------------------------------------- |
| **Application name**           | `MarkSyncr` (or your preferred name)                |
| **Homepage URL**               | `https://marksyncr.com`                             |
| **Application description**    | Bookmark sync across browsers                       |
| **Authorization callback URL** | `https://marksyncr.com/api/connect/github/callback` |

3. Click **"Register application"**

### 1.3 Get Your Credentials

After creating the app:

1. **Client ID** - Copy this value (visible on the app page)
2. **Client Secret** - Click "Generate a new client secret" and copy it immediately (you won't see it again!)

⚠️ **Important**: Keep your Client Secret secure. Never commit it to version control.

---

## Step 2: Environment Variables

Add these to your `.env` file:

```bash
# GitHub OAuth Configuration
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
```

For development, add a second OAuth App with:

- **Authorization callback URL**: `http://localhost:3000/api/connect/github/callback`

---

## Step 3: OAuth Flow

### 3.1 How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     GitHub OAuth Flow                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User clicks "Connect GitHub" in dashboard                    │
│     └─> GET /api/connect/github                                  │
│                                                                  │
│  2. Server generates state token, stores in cookie               │
│     └─> Redirects to GitHub authorization URL                    │
│                                                                  │
│  3. User authorizes on GitHub                                    │
│     └─> GitHub redirects to callback URL with code               │
│                                                                  │
│  4. Server handles callback                                      │
│     └─> GET /api/connect/github/callback?code=xxx&state=xxx      │
│     └─> Verifies state matches cookie                            │
│     └─> Exchanges code for access token                          │
│     └─> Auto-creates marksyncr-bookmarks repository              │
│     └─> Stores connection in sync_sources table                  │
│                                                                  │
│  5. User redirected to dashboard with success message            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Authorization URL

The OAuth module builds the authorization URL:

```typescript
import { buildAuthorizationUrl } from '@marksyncr/sources/oauth/github-oauth';

const authUrl = buildAuthorizationUrl(
  process.env.GITHUB_CLIENT_ID,
  'https://marksyncr.com/api/connect/github/callback',
  state // Random string for CSRF protection
);

// Result: https://github.com/login/oauth/authorize?client_id=xxx&redirect_uri=xxx&scope=repo&state=xxx
```

### 3.3 OAuth Scope

The app requests the `repo` scope which provides:

- Full control of private repositories
- Read/write access to code, commit statuses, repository invitations, collaborators, and deployment statuses

This is required to:

- Create the `marksyncr-bookmarks` repository
- Read and write the `bookmarks.json` file

---

## Step 4: Repository Auto-Creation

When a user connects GitHub, the app automatically:

1. Checks if `marksyncr-bookmarks` repository exists
2. If not, creates it as a **private** repository
3. Initializes with a README explaining the repository purpose
4. Stores the repository configuration in the database

### Repository Structure

```
marksyncr-bookmarks/
├── README.md           # Auto-generated explanation
└── bookmarks.json      # Bookmark data (created on first sync)
```

### bookmarks.json Format

```json
{
  "version": "1.0",
  "metadata": {
    "createdAt": "2025-01-01T00:00:00.000Z",
    "lastModified": "2025-01-01T12:00:00.000Z",
    "source": "marksyncr",
    "checksum": "sha256_hash_of_bookmarks"
  },
  "bookmarks": [
    {
      "url": "https://example.com",
      "title": "Example Site",
      "folderPath": "Bookmarks Bar/Tech",
      "dateAdded": 1704067200000
    }
  ],
  "tombstones": [
    {
      "url": "https://deleted-site.com",
      "deletedAt": 1704153600000
    }
  ]
}
```

---

## Step 5: Sync Implementation

### 5.1 Checksum-Based Updates

The sync only commits changes when the bookmark data has changed:

```typescript
import { syncBookmarksToGitHub } from '@marksyncr/sources/oauth/github-sync';

const result = await syncBookmarksToGitHub(
  accessToken,
  'username/marksyncr-bookmarks',
  'main',
  'bookmarks.json',
  bookmarks,
  tombstones,
  checksum
);

// Result:
// { success: true, sha: 'abc123', created: false, bookmarkCount: 150 }
```

### 5.2 Sync Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Sync Flow with Checksum                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Generate checksum from local bookmarks                       │
│     └─> SHA-256 hash of sorted, normalized bookmark data         │
│                                                                  │
│  2. Fetch existing file from GitHub                              │
│     └─> GET /repos/:owner/:repo/contents/:path                   │
│     └─> Extract metadata.checksum from file content              │
│                                                                  │
│  3. Compare checksums                                            │
│     ├─> If MATCH: Skip commit (no changes)                       │
│     └─> If DIFFERENT: Proceed to commit                          │
│                                                                  │
│  4. Commit new file (only if checksum differs)                   │
│     └─> PUT /repos/:owner/:repo/contents/:path                   │
│     └─> Include SHA of existing file for update                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step 6: Database Schema

The `sync_sources` table stores GitHub connections:

```sql
-- Relevant columns for GitHub
CREATE TABLE sync_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  provider TEXT NOT NULL,                    -- 'github'
  provider_user_id TEXT,                     -- GitHub user ID
  provider_username TEXT,                    -- GitHub username
  access_token TEXT,                         -- GitHub access token
  token_type TEXT,                           -- 'bearer'
  scope TEXT,                                -- 'repo'
  repository TEXT,                           -- 'username/marksyncr-bookmarks'
  branch TEXT DEFAULT 'main',                -- Branch name
  file_path TEXT DEFAULT 'bookmarks.json',   -- File path in repo
  config JSONB,                              -- Additional config
  connected_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(user_id, provider)
);
```

---

## Step 7: Error Handling

### Common Errors

| Error               | Cause                      | Solution                         |
| ------------------- | -------------------------- | -------------------------------- |
| `state_mismatch`    | CSRF protection triggered  | User should try connecting again |
| `invalid_token`     | Token validation failed    | Re-authorize the app             |
| `repo_setup_failed` | Couldn't create repository | Check GitHub permissions         |
| `db_error`          | Database save failed       | Check Supabase connection        |

### Rate Limits

GitHub API has rate limits:

- **Authenticated requests**: 5,000 per hour
- **Search API**: 30 per minute

The sync implementation respects these limits by:

- Only syncing when checksums differ
- Batching operations where possible

---

## Step 8: Security Considerations

1. **Never expose Client Secret** - Keep it server-side only
2. **Validate state parameter** - Prevents CSRF attacks
3. **Store tokens securely** - Consider encryption at rest
4. **Use HTTPS** - All OAuth redirects must use HTTPS in production
5. **Minimal scope** - Only request `repo` scope (required for private repos)

---

## Step 9: Testing Checklist

Before deploying, verify:

- [ ] OAuth flow completes successfully
- [ ] State parameter is validated
- [ ] Repository is auto-created
- [ ] Tokens are stored in database
- [ ] Sync creates/updates bookmarks.json
- [ ] Checksum comparison prevents unnecessary commits
- [ ] Error handling covers all edge cases
- [ ] Disconnect removes the connection

---

## Comparison: GitHub vs Dropbox

| Feature             | GitHub              | Dropbox             |
| ------------------- | ------------------- | ------------------- |
| File storage        | Repository          | App folder          |
| Version control     | Git commits         | Revisions           |
| Checksum field      | `metadata.checksum` | `metadata.checksum` |
| Update mode         | SHA-based           | Revision-based      |
| Rate limits         | 5000/hour           | Varies by endpoint  |
| Token expiry        | No expiry           | 4 hours             |
| Refresh token       | No                  | Yes                 |
| Auto-create storage | Yes (repo)          | Yes (folder)        |

---

## API Routes

| Route                            | Method | Description            |
| -------------------------------- | ------ | ---------------------- |
| `/api/connect/github`            | GET    | Initiates OAuth flow   |
| `/api/connect/github/callback`   | GET    | Handles OAuth callback |
| `/api/connect/github/disconnect` | POST   | Disconnects GitHub     |

---

## Troubleshooting

### "Application suspended"

Your OAuth app may have been suspended by GitHub. Check your email for notifications.

### "Redirect URI mismatch"

The callback URL in your OAuth app settings must exactly match the one used in the code.

### "Bad credentials"

The access token may have been revoked. User needs to reconnect.

### "Repository not found"

The repository may have been deleted. Reconnecting will create a new one.
