# MarkSyncr

Cross-browser bookmark sync extension with cloud storage support.

## Overview

MarkSyncr is a browser extension that enables two-way bookmark synchronization between browsers and external storage sources. Sync your bookmarks across devices using your own storage (GitHub, Dropbox, Google Drive) or our managed cloud service.

## Features

- **Two-way sync**: Changes sync bidirectionally between browser and storage
- **Preserve bookmark structure**: Maintains toolbar, menu, and folder hierarchy
- **Multiple storage options**:
  - Local file (free)
  - GitHub repository (free)
  - Dropbox (free)
  - Google Drive (free)
  - MarkSyncr Cloud (paid)
- **Cross-browser support**: Chrome and Firefox (Safari planned for Pro)
- **Automatic & manual sync**: Schedule syncs or trigger manually
- **Conflict resolution**: Smart handling of concurrent changes
- **Cross-device sync**: Track sync status across all your devices

## Project Structure

This is a monorepo managed with pnpm workspaces and Turborepo:

```
marksyncr/
├── apps/
│   ├── web/              # Next.js web app (marksyncr.com)
│   └── extension/        # Browser extension (Chrome/Firefox)
├── packages/
│   ├── core/             # Sync engine, diff, conflict resolution
│   ├── sources/          # Storage integrations (GitHub, Dropbox, etc.)
│   └── types/            # Shared JSDoc types
├── supabase/
│   └── migrations/       # Database schema
└── plans/
    └── architecture.md   # System design documentation
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/marksyncr.git
cd marksyncr

# Install dependencies
pnpm install

# Set up git hooks (runs build and tests before each commit)
./scripts/setup-hooks.sh

# Start development
pnpm dev

# Build all packages
pnpm build

# Run tests
pnpm test
```

## Development

### Apps

- **Web App**: `cd apps/web && pnpm dev` - Runs on http://localhost:3000
- **Extension**: `cd apps/extension && pnpm dev` - Builds to `dist/` for loading in browser

### Building the Extension

```bash
# Build for all browsers
cd apps/extension
pnpm build

# Build for specific browser
pnpm build:chrome
pnpm build:firefox
```

### Loading the Extension

**Chrome:**
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `apps/extension/dist/chrome`

**Firefox:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `apps/extension/dist/firefox/manifest.json`

## Configuration

### Environment Variables

Copy `.env.example` to `.env.local` in each app directory:

**apps/web/.env.local:**
```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
STRIPE_SECRET_KEY=your-stripe-secret
STRIPE_WEBHOOK_SECRET=your-webhook-secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your-publishable-key
```

### Supabase Setup

1. Create a new Supabase project
2. Run the migration in `supabase/migrations/001_initial_schema.sql`
3. Configure OAuth providers (GitHub, Google) in Supabase Auth settings
4. Update environment variables with your project credentials

### Stripe Setup

1. Create a Stripe account
2. Create products and prices for Pro and Team plans
3. Set up webhook endpoint pointing to `/api/webhooks/stripe`
4. Update environment variables with your Stripe keys

## Tech Stack

- **Frontend**: React 19, Tailwind CSS
- **Build**: Vite (extension), Next.js 16 (web)
- **Backend**: Supabase (auth, database, storage)
- **Payments**: Stripe
- **Testing**: Vitest
- **Monorepo**: pnpm workspaces, Turborepo

## Architecture

### Bookmark Schema

Bookmarks are stored in a custom JSON format that preserves:
- Toolbar, menu, and other bookmark locations
- Folder hierarchy with nested children
- Metadata (created, modified timestamps)
- Content-based IDs for portable identification

### Sync Engine

The sync engine implements two-way sync with:
- Change detection via checksums
- Conflict resolution strategies (newer-wins, local-wins, remote-wins, merge)
- Field-level merging for non-conflicting changes
- Version tracking for optimistic concurrency

### Storage Sources

Each storage source implements a common interface:
- `read()` - Fetch bookmark data
- `write(data)` - Save bookmark data
- `isAvailable()` - Check connectivity
- `validateCredentials()` - Verify authentication

## Pricing

| Feature | Free | Pro ($5/mo) | Team ($12/mo) |
|---------|------|-------------|---------------|
| Bookmarks | Unlimited | Unlimited | Unlimited |
| GitHub/Dropbox/Drive | ✓ | ✓ | ✓ |
| Local File | ✓ | ✓ | ✓ |
| MarkSyncr Cloud | - | ✓ | ✓ |
| Safari Support | - | ✓ | ✓ |
| Version History | - | 30 days | 1 year |
| Shared Folders | - | - | ✓ |
| Team Management | - | - | ✓ |

## Deployment

### Web App (Railway - Recommended)

Railway provides Docker-based deployment with automatic builds.

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize project (from repo root)
railway init

# Deploy
railway up
```

**Environment Variables to configure in Railway:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_PRO_MONTHLY_PRICE_ID`
- `STRIPE_PRO_YEARLY_PRICE_ID`
- `STRIPE_TEAM_MONTHLY_PRICE_ID`
- `STRIPE_TEAM_YEARLY_PRICE_ID`
- `NEXT_PUBLIC_APP_URL` (your Railway domain)

### Docker Deployment

```bash
# Build the Docker image
docker build -t marksyncr-web -f apps/web/Dockerfile .

# Run locally
docker run -p 3000:3000 --env-file .env marksyncr-web

# Or use docker-compose
docker-compose up web
```

### Development with Docker

```bash
# Start development mode with hot reload
docker-compose --profile dev up web-dev
```

### Extension (Chrome Web Store / Firefox Add-ons)

1. Build the extension: `pnpm build`
2. ZIP files are created in `apps/extension/dist/`
3. Upload to respective stores:
   - Chrome: https://chrome.google.com/webstore/devconsole
   - Firefox: https://addons.mozilla.org/developers/

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `pnpm test`
5. Submit a pull request

## License

MIT

## Support

- Documentation: https://docs.marksyncr.com
- Issues: https://github.com/yourusername/marksyncr/issues
- Email: support@marksyncr.com
