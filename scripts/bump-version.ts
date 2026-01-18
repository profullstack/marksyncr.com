#!/usr/bin/env node
/**
 * Version bump script for all package.json and manifest files
 * Usage: pnpm version:bump <major|minor|patch> [--dry-run]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

interface VersionParts {
  major: number;
  minor: number;
  patch: number;
}

type BumpType = 'major' | 'minor' | 'patch';

const FILES_TO_UPDATE = [
  'package.json',
  'apps/extension/package.json',
  'apps/web/package.json',
  'packages/core/package.json',
  'packages/sources/package.json',
  'packages/types/package.json',
  'apps/extension/src/manifest.chrome.json',
  'apps/extension/src/manifest.firefox.json',
  'apps/extension/src/manifest.safari.json',
] as const;

function parseVersion(version: string): VersionParts {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Invalid version format: ${version}`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

function bumpVersion(current: string, type: BumpType): string {
  const parts = parseVersion(current);

  switch (type) {
    case 'major':
      return `${parts.major + 1}.0.0`;
    case 'minor':
      return `${parts.major}.${parts.minor + 1}.0`;
    case 'patch':
      return `${parts.major}.${parts.minor}.${parts.patch + 1}`;
    default:
      throw new Error(`Invalid bump type: ${type}`);
  }
}

function getCurrentVersion(): string {
  const rootPackagePath = resolve(rootDir, 'package.json');
  const content = readFileSync(rootPackagePath, 'utf-8');
  const pkg = JSON.parse(content) as { version: string };
  return pkg.version;
}

function updateFile(filePath: string, newVersion: string, dryRun: boolean): void {
  const fullPath = resolve(rootDir, filePath);
  const content = readFileSync(fullPath, 'utf-8');
  const json = JSON.parse(content) as { version: string };
  const oldVersion = json.version;

  json.version = newVersion;

  const updatedContent = JSON.stringify(json, null, 2) + '\n';

  if (dryRun) {
    console.log(`  [DRY RUN] ${filePath}: ${oldVersion} → ${newVersion}`);
  } else {
    writeFileSync(fullPath, updatedContent, 'utf-8');
    console.log(`  ✓ ${filePath}: ${oldVersion} → ${newVersion}`);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const bumpType = args.find((arg) => ['major', 'minor', 'patch'].includes(arg)) as
    | BumpType
    | undefined;

  if (!bumpType) {
    console.error('Usage: pnpm version:bump <major|minor|patch> [--dry-run]');
    console.error('');
    console.error('Examples:');
    console.error('  pnpm version:bump patch        # 0.2.0 → 0.2.1');
    console.error('  pnpm version:bump minor        # 0.2.0 → 0.3.0');
    console.error('  pnpm version:bump major        # 0.2.0 → 1.0.0');
    console.error('  pnpm version:bump patch --dry-run  # Preview changes');
    process.exit(1);
  }

  const currentVersion = getCurrentVersion();
  const newVersion = bumpVersion(currentVersion, bumpType);

  console.log(`\nBumping version: ${currentVersion} → ${newVersion} (${bumpType})\n`);

  if (dryRun) {
    console.log('DRY RUN - No files will be modified\n');
  }

  for (const file of FILES_TO_UPDATE) {
    try {
      updateFile(file, newVersion, dryRun);
    } catch (error) {
      console.error(`  ✗ ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log('');

  if (!dryRun) {
    console.log(`✓ All files updated to version ${newVersion}`);
    console.log('\nNext steps:');
    console.log('  1. Review changes: git diff');
    console.log('  2. Commit: git commit -am "chore: bump version to ' + newVersion + '"');
    console.log('  3. Tag: git tag v' + newVersion);
  }
}

main();
