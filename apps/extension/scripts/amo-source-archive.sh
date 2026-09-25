#!/usr/bin/env bash
#
# Build the source-code archive Mozilla requires alongside every AMO submission.
#
# The add-on package is bundled by Vite (not minified, but concatenated), which
# AMO policy treats as machine-generated. Reviewers need the original sources
# plus instructions that reproduce the exact same files, uploaded through
# `web-ext sign --upload-source-code`. Without it the listing gets flagged
# ("Sources missing").
#
# The archive is `git archive` of the commit being released (the whole
# monorepo, so pnpm-lock.yaml resolves every workspace), with:
#   README.md          reviewer build instructions (the policy asks for a
#                      top-level README)
#   PROJECT_README.md  the repository's own README, moved aside
#   .env.production    the public build-time values vite.config.js reads, so
#                      the reviewer's build matches byte for byte
#
# Usage: apps/extension/scripts/amo-source-archive.sh <output.zip>
# Records NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_URL and
# NEXT_PUBLIC_SUPABASE_ANON_KEY from the environment, i.e. the values the
# build just used. Run it in the same environment as the build.

set -euo pipefail

OUT="${1:?usage: amo-source-archive.sh <output.zip>}"
OUT="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"

REPO_ROOT="$(git rev-parse --show-toplevel)"
COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD)"
VERSION="$(node -p "require('$REPO_ROOT/apps/extension/package.json').version")"
PNPM_VERSION="$(node -p "require('$REPO_ROOT/package.json').packageManager.split('@')[1]")"


STAGE="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/amo-source.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

git -C "$REPO_ROOT" archive --format=tar HEAD | tar -x -C "$STAGE"

mv "$STAGE/README.md" "$STAGE/PROJECT_README.md"

# Public values only: vite.config.js inlines these into the bundle (the anon
# key is a publishable client key). An unset one is left out, so the rebuild
# takes the same fallback the release build did.
: > "$STAGE/.env.production"
for var in NEXT_PUBLIC_APP_URL NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY; do
  if [[ -n "${!var:-}" ]]; then
    echo "${var}=${!var}" >> "$STAGE/.env.production"
  fi
done

cat > "$STAGE/README.md" <<EOF
# MarkSyncr ${VERSION}: source code for Mozilla Add-ons review

This archive is the complete, unmodified source of MarkSyncr ${VERSION}, taken
from commit \`${COMMIT}\` of the public repository
https://github.com/profullstack/marksyncr.com (MIT licensed).

The add-on package is **not minified**. It is bundled with Vite, which
concatenates modules into the files under \`popup/\`, \`options/\`,
\`background/\`, \`blocked/\`, \`chunks/\` and \`assets/\`. Everything in it is
produced from this archive by the steps below. All third-party code comes from
npm through pnpm, pinned by \`pnpm-lock.yaml\`; nothing is vendored in
pre-built form.

## Build environment

- Linux or macOS (the release is built on GitHub Actions \`ubuntu-latest\`)
- Node.js 22.x (https://nodejs.org)
- pnpm ${PNPM_VERSION} (pinned by \`packageManager\` in \`package.json\`)
- network access to the npm registry during \`pnpm install\` only

## Build steps

From the directory containing this README:

\`\`\`sh
corepack enable                     # provides pnpm ${PNPM_VERSION}
pnpm install --frozen-lockfile
cd apps/extension
NODE_ENV=production node scripts/build.js firefox
\`\`\`

The add-on is written to \`apps/extension/dist/firefox/\`, and the same files
zipped as \`apps/extension/dist/marksyncr-firefox.zip\`. Compare the directory
with the submitted package, for example:

\`\`\`sh
mkdir submitted && unzip -q /path/to/submitted.xpi -d submitted
diff -r submitted apps/extension/dist/firefox
\`\`\`

\`META-INF/\` (Mozilla's signature) is the only expected difference.

\`NODE_ENV=production\` matters: without it Vite also emits source maps, which
adds \`.map\` files and \`sourceMappingURL\` comments that are not in the
submitted package.

## What the build does

\`apps/extension/scripts/build.js\`:

1. \`scripts/build-filters.js\` converts the vendored EasyList, EasyPrivacy and
   phishing lists in \`apps/extension/filters/*.txt\` into declarativeNetRequest
   rulesets in \`public/rules/*.json\`. It runs offline.
2. \`vite build\` (config: \`apps/extension/vite.config.js\`) bundles the React
   popup and options pages, the background script and the blocked-page
   warning. Minification is turned off.
3. Copies \`src/manifest.firefox.json\` to \`manifest.json\`, minus the
   \`http://localhost\` host permissions used only in development, and copies
   the icons and rulesets.

The extension code lives in \`apps/extension/src/\`. The shared libraries it
imports are the workspace packages under \`packages/\` (\`core\`, \`sources\`,
\`types\`, \`vault\`), used directly from source with no separate build step.
\`apps/web/\` is the marksyncr.com website. It is not part of the add-on and is
included only because the lockfile covers the whole workspace.

## Build-time configuration

\`.env.production\` holds the build-time values \`vite.config.js\` reads
(the website URL the add-on talks to, and the Supabase project URL and
publishable key when set). They are public. Vite reads the file
automatically, so no environment variables need to be exported.
EOF

rm -f "$OUT"
(cd "$STAGE" && zip -qrX "$OUT" .)
echo "Wrote $OUT ($(du -h "$OUT" | cut -f1)) from ${COMMIT}"
