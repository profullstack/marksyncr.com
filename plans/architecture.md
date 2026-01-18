# MarkSyncr - Bookmark Sync Extension Architecture

## Overview

MarkSyncr is a cross-browser extension that enables two-way bookmark synchronization between browsers and external storage sources. Built with React and Tailwind CSS, with Supabase backend for paid tier cloud storage and user management.

## Business Model

### Free Tier - BYOS (Bring Your Own Storage)

- Local file sync
- GitHub sync (OAuth)
- Dropbox sync (OAuth)
- Google Drive sync (OAuth)
- User manages their own storage
- No account required

### Paid Tier - Managed Cloud

- Supabase Cloud storage (we host bookmarks)
- Simple email/password or social login
- Cross-device sync built-in
- No OAuth complexity for users
- Premium support

## Requirements Summary

- **Browsers**: Chrome and Firefox (Safari deferred)
- **Sync Direction**: Two-way bidirectional sync
- **Data Format**: Custom JSON format preserving toolbar/menu/other bookmark locations
- **Free Sources**: Local file, GitHub, Dropbox, Google Drive (all OAuth)
- **Paid Source**: Supabase Cloud (direct storage)
- **Sync Triggers**: Automatic on schedule + manual trigger option
- **Backend**: Supabase for paid user auth, cloud storage, and OAuth token management

---

## System Architecture

```mermaid
flowchart TB
    subgraph Browser Extension
        UI[React Popup UI]
        BG[Background Service Worker]
        BP[Bookmark Parser]
        SE[Sync Engine]
        BA[Browser Adapter]
    end

    subgraph Free Tier Sources
        LF[Local File System]
        GH[GitHub API]
        DB[Dropbox API]
        GD[Google Drive API]
    end

    subgraph Supabase Backend
        AUTH[Auth Service]
        TOKENS[OAuth Token Storage]
        CLOUD[Cloud Bookmark Storage]
        SUBS[Subscription Management]
    end

    UI --> BG
    BG --> SE
    SE --> BP
    BP --> BA
    BA --> BrowserBookmarks[(Browser Bookmarks API)]

    SE -->|Free Tier| LF
    SE -->|Free Tier| GH
    SE -->|Free Tier| DB
    SE -->|Free Tier| GD

    SE -->|Paid Tier| CLOUD
    BG --> AUTH
    AUTH --> TOKENS
    AUTH --> SUBS
```

---

## Data Flow - Sync Process

```mermaid
sequenceDiagram
    participant User
    participant Extension
    participant SyncEngine
    participant Source as External Source
    participant Supabase
    participant BrowserAPI as Browser Bookmarks API

    User->>Extension: Trigger Sync or Auto-Schedule
    Extension->>Supabase: Get last sync state
    Supabase-->>Extension: Return sync metadata

    Extension->>BrowserAPI: Read current bookmarks
    BrowserAPI-->>Extension: Return bookmark tree
    Extension->>SyncEngine: Convert to JSON format

    Extension->>Source: Fetch remote bookmarks
    Source-->>Extension: Return remote JSON

    SyncEngine->>SyncEngine: Compare and detect changes
    SyncEngine->>SyncEngine: Resolve conflicts

    alt Changes to push
        Extension->>Source: Update remote file
    end

    alt Changes to pull
        Extension->>BrowserAPI: Update local bookmarks
    end

    Extension->>Supabase: Update sync state
    Extension->>User: Show sync result
```

---

## JSON Bookmark Schema

```json
{
  "version": "1.0",
  "schemaVersion": 1,
  "metadata": {
    "lastModified": "2025-12-21T05:41:00.000Z",
    "lastSyncedBy": "device-uuid",
    "checksum": "sha256-hash"
  },
  "bookmarks": {
    "toolbar": {
      "id": "toolbar_root",
      "title": "Bookmarks Toolbar",
      "children": [
        {
          "id": "unique-id-1",
          "type": "bookmark",
          "title": "Example Site",
          "url": "https://example.com",
          "dateAdded": "2025-01-01T00:00:00.000Z",
          "dateModified": "2025-12-01T00:00:00.000Z"
        },
        {
          "id": "unique-id-2",
          "type": "folder",
          "title": "Work",
          "children": []
        }
      ]
    },
    "menu": {
      "id": "menu_root",
      "title": "Bookmarks Menu",
      "children": []
    },
    "other": {
      "id": "other_root",
      "title": "Other Bookmarks",
      "children": []
    }
  }
}
```

---

## Supabase Database Schema

```mermaid
erDiagram
    users {
        uuid id PK
        string email
        timestamp created_at
        timestamp last_login
        boolean is_paid
        timestamp subscription_expires_at
    }

    oauth_tokens {
        uuid id PK
        uuid user_id FK
        string provider
        string access_token_encrypted
        string refresh_token_encrypted
        timestamp expires_at
        timestamp created_at
    }

    cloud_bookmarks {
        uuid id PK
        uuid user_id FK
        jsonb bookmark_data
        string checksum
        timestamp last_modified
        integer version
    }

    sync_state {
        uuid id PK
        uuid user_id FK
        string device_id
        string source_type
        string source_path
        string last_checksum
        timestamp last_sync_at
        jsonb sync_metadata
    }

    users ||--o{ oauth_tokens : has
    users ||--o{ sync_state : has
    users ||--o| cloud_bookmarks : has
```

---

## Project Structure - Monorepo

```
marksyncr/
├── apps/
│   ├── web/                          # marksyncr.com web app
│   │   ├── src/
│   │   │   ├── app/                  # Next.js app router
│   │   │   │   ├── page.tsx          # Landing page
│   │   │   │   ├── dashboard/        # User dashboard
│   │   │   │   ├── pricing/          # Pricing page
│   │   │   │   ├── auth/             # Auth pages
│   │   │   │   └── api/              # API routes
│   │   │   ├── components/           # Web-specific components
│   │   │   └── styles/
│   │   ├── public/
│   │   ├── next.config.js
│   │   ├── tailwind.config.js
│   │   └── package.json
│   │
│   └── extension/                    # Browser extension
│       ├── src/
│       │   ├── background/
│       │   │   ├── index.ts          # Service worker entry
│       │   │   ├── sync-scheduler.ts # Auto-sync scheduling
│       │   │   └── message-handler.ts
│       │   ├── popup/
│       │   │   ├── App.tsx           # Main popup component
│       │   │   ├── index.tsx         # Popup entry point
│       │   │   └── components/
│       │   │       ├── SourceSelector.tsx
│       │   │       ├── SyncStatus.tsx
│       │   │       ├── Settings.tsx
│       │   │       └── AuthButton.tsx
│       │   └── adapters/
│       │       ├── browser-adapter.ts
│       │       ├── chrome-adapter.ts
│       │       └── firefox-adapter.ts
│       ├── public/
│       │   ├── manifest.chrome.json
│       │   ├── manifest.firefox.json
│       │   ├── icons/
│       │   └── popup.html
│       ├── vite.config.ts
│       └── package.json
│
├── packages/
│   ├── core/                         # Shared sync logic
│   │   ├── src/
│   │   │   ├── bookmark-parser.ts
│   │   │   ├── bookmark-serializer.ts
│   │   │   ├── sync-engine.ts
│   │   │   ├── conflict-resolver.ts
│   │   │   └── diff-engine.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── sources/                      # Storage source integrations
│   │   ├── src/
│   │   │   ├── base-source.ts
│   │   │   ├── local-file.ts
│   │   │   ├── github.ts
│   │   │   ├── dropbox.ts
│   │   │   ├── google-drive.ts
│   │   │   └── supabase-cloud.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── types/                        # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── bookmark.ts
│   │   │   ├── sync.ts
│   │   │   ├── source.ts
│   │   │   └── user.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── ui/                           # Shared UI components
│       ├── src/
│       │   ├── Button.tsx
│       │   ├── Card.tsx
│       │   ├── Input.tsx
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   └── 002_cloud_bookmarks.sql
│   ├── functions/
│   │   ├── oauth-callback/
│   │   └── stripe-webhook/
│   └── config.toml
│
├── tests/
│   ├── core/
│   │   ├── sync-engine.test.ts
│   │   ├── bookmark-parser.test.ts
│   │   └── conflict-resolver.test.ts
│   └── e2e/
│       └── extension.test.ts
│
├── package.json                      # Root package.json
├── pnpm-workspace.yaml               # pnpm workspace config
├── turbo.json                        # Turborepo config
├── tsconfig.base.json                # Shared TS config
└── README.md
```

---

## Conflict Resolution Strategy

```mermaid
flowchart TD
    A[Detect Change] --> B{Same bookmark modified?}
    B -->|No| C[Apply change directly]
    B -->|Yes| D{Compare timestamps}
    D -->|Remote newer| E[Use remote version]
    D -->|Local newer| F[Use local version]
    D -->|Same time| G{Compare by field}
    G --> H[Merge non-conflicting fields]
    H --> I{URL conflict?}
    I -->|Yes| J[Prefer most recent URL change]
    I -->|No| K[Merge complete]

    L[Deleted remotely] --> M{Modified locally?}
    M -->|Yes| N[Keep local - user intent unclear]
    M -->|No| O[Delete locally]

    P[Deleted locally] --> Q{Modified remotely?}
    Q -->|Yes| R[Restore with remote changes]
    Q -->|No| S[Delete remotely]
```

---

## Browser Adapter Pattern

The extension uses an adapter pattern to handle differences between Chrome and Firefox bookmark APIs:

| Feature           | Chrome   | Firefox                                  |
| ----------------- | -------- | ---------------------------------------- |
| Manifest Version  | V3       | V2 or V3                                 |
| Service Worker    | Required | Optional                                 |
| Bookmark Root IDs | 0, 1, 2  | toolbar**\_**, menu**\_**, unfiled**\_** |
| Promises          | Native   | webextension-polyfill                    |

---

## OAuth Flow - Free Tier

```mermaid
sequenceDiagram
    participant User
    participant Extension
    participant Supabase
    participant Provider as GitHub/Dropbox/Google Drive

    User->>Extension: Click Connect Provider
    Extension->>Supabase: Request OAuth URL
    Supabase-->>Extension: Return auth URL with state
    Extension->>Provider: Open OAuth popup
    User->>Provider: Authorize app
    Provider->>Supabase: Redirect with auth code
    Supabase->>Provider: Exchange code for tokens
    Supabase->>Supabase: Encrypt and store tokens
    Supabase-->>Extension: Return success
    Extension->>User: Show connected status
```

---

## Paid Tier Flow

```mermaid
sequenceDiagram
    participant User
    participant WebApp as marksyncr.com
    participant Extension
    participant Supabase
    participant Stripe

    User->>WebApp: Visit pricing page
    User->>WebApp: Click Subscribe
    WebApp->>Stripe: Create checkout session
    Stripe-->>User: Redirect to payment
    User->>Stripe: Complete payment
    Stripe->>Supabase: Webhook - payment success
    Supabase->>Supabase: Update user subscription
    User->>Extension: Login with account
    Extension->>Supabase: Verify subscription
    Supabase-->>Extension: Return paid status
    Extension->>User: Enable cloud sync
```

---

## Key Technical Decisions

### 1. Build Tool: Vite

- Fast HMR for development
- Excellent TypeScript support
- Easy to configure for extension builds

### 2. State Management: Zustand

- Lightweight
- Works well with React
- Easy persistence to extension storage

### 3. Supabase Edge Functions

- Handle OAuth token exchange securely
- Keep client secrets server-side
- Provide webhook endpoints if needed

### 4. Bookmark ID Mapping

- Browser bookmark IDs are not portable
- Use content-based hashing for stable IDs
- Map browser IDs to stable IDs during sync

---

## Security Considerations

1. **OAuth Tokens**: Stored encrypted in Supabase, never in extension storage
2. **Local File Access**: Uses File System Access API with user permission
3. **Cross-Origin**: All API calls go through background service worker
4. **Supabase RLS**: Row-level security ensures users only access their own data

---

## Future Considerations (Safari)

Safari Web Extensions require:

- Xcode project wrapper
- Different manifest format
- App Store distribution
- Native app container

Recommend deferring Safari until Chrome/Firefox are stable.
