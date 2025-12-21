#!/usr/bin/env node

/**
 * Build script for MarkSyncr browser extension
 *
 * Builds the extension for Chrome (MV3) and Firefox (MV2)
 * Usage: node scripts/build.js [chrome|firefox|all]
 */

import { execSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  createWriteStream,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

// Build configuration
const BUILD_DIR = join(ROOT_DIR, 'dist');
const CHROME_DIR = join(BUILD_DIR, 'chrome');
const FIREFOX_DIR = join(BUILD_DIR, 'firefox');

/**
 * Clean build directories
 */
function clean() {
  console.log('🧹 Cleaning build directories...');

  if (existsSync(BUILD_DIR)) {
    rmSync(BUILD_DIR, { recursive: true });
  }

  mkdirSync(BUILD_DIR, { recursive: true });
  mkdirSync(CHROME_DIR, { recursive: true });
  mkdirSync(FIREFOX_DIR, { recursive: true });
}

/**
 * Run Vite build
 */
function buildVite() {
  console.log('📦 Building with Vite...');

  execSync('pnpm vite build', {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });
}

/**
 * Copy directory recursively (sync version)
 */
function copyDirectorySync(src, dest) {
  if (!existsSync(src)) {
    return;
  }

  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  const entries = readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectorySync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Copy manifest and assets for Chrome
 */
function buildChrome() {
  console.log('🌐 Building Chrome extension (MV3)...');

  // Copy built files
  const viteOutput = join(ROOT_DIR, 'dist-vite');
  if (existsSync(viteOutput)) {
    copyDirectorySync(viteOutput, CHROME_DIR);
  }

  // Copy Chrome manifest
  const chromeManifest = readFileSync(join(ROOT_DIR, 'src/manifest.chrome.json'), 'utf-8');
  writeFileSync(join(CHROME_DIR, 'manifest.json'), chromeManifest);

  // Copy icons
  copyIcons(CHROME_DIR);

  // Copy background script
  const bgSrc = join(ROOT_DIR, 'src/background/index.js');
  if (existsSync(bgSrc)) {
    copyFileSync(bgSrc, join(CHROME_DIR, 'background.js'));
  }

  console.log('✅ Chrome build complete');
}

/**
 * Copy manifest and assets for Firefox
 */
function buildFirefox() {
  console.log('🦊 Building Firefox extension (MV2)...');

  // Copy built files
  const viteOutput = join(ROOT_DIR, 'dist-vite');
  if (existsSync(viteOutput)) {
    copyDirectorySync(viteOutput, FIREFOX_DIR);
  }

  // Copy Firefox manifest
  const firefoxManifest = readFileSync(join(ROOT_DIR, 'src/manifest.firefox.json'), 'utf-8');
  writeFileSync(join(FIREFOX_DIR, 'manifest.json'), firefoxManifest);

  // Copy icons
  copyIcons(FIREFOX_DIR);

  // Copy background script
  const bgSrc = join(ROOT_DIR, 'src/background/index.js');
  if (existsSync(bgSrc)) {
    copyFileSync(bgSrc, join(FIREFOX_DIR, 'background.js'));
  }

  console.log('✅ Firefox build complete');
}

/**
 * Copy icons to target directory
 */
function copyIcons(targetDir) {
  const iconsDir = join(ROOT_DIR, 'public/icons');
  const targetIconsDir = join(targetDir, 'icons');

  if (!existsSync(iconsDir)) {
    console.log('   ⚠️  No icons directory found, skipping icon copy');
    return;
  }

  if (!existsSync(targetIconsDir)) {
    mkdirSync(targetIconsDir, { recursive: true });
  }

  // Copy icon files if they exist
  const iconSizes = ['16', '32', '48', '128'];
  for (const size of iconSizes) {
    const iconFile = join(iconsDir, `icon-${size}.png`);
    if (existsSync(iconFile)) {
      copyFileSync(iconFile, join(targetIconsDir, `icon-${size}.png`));
    }
  }
}

/**
 * Create ZIP packages for distribution
 */
async function createPackages() {
  console.log('📦 Creating distribution packages...');

  let archiver;
  try {
    archiver = (await import('archiver')).default;
  } catch {
    console.log('⚠️  archiver not installed, skipping ZIP creation');
    console.log('   Run: pnpm add -D archiver');
    return;
  }

  // Create Chrome ZIP
  await createZip(archiver, CHROME_DIR, join(BUILD_DIR, 'marksyncr-chrome.zip'));

  // Create Firefox ZIP (XPI)
  await createZip(archiver, FIREFOX_DIR, join(BUILD_DIR, 'marksyncr-firefox.xpi'));

  console.log('✅ Packages created');
}

/**
 * Create a ZIP file from a directory
 */
function createZip(archiver, sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`   Created: ${outputPath} (${archive.pointer()} bytes)`);
      resolve();
    });

    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

/**
 * Main build function
 */
async function main() {
  const target = process.argv[2] || 'all';

  console.log('🚀 MarkSyncr Extension Build');
  console.log(`   Target: ${target}`);
  console.log('');

  try {
    clean();
    buildVite();

    switch (target) {
      case 'chrome':
        buildChrome();
        break;
      case 'firefox':
        buildFirefox();
        break;
      case 'all':
      default:
        buildChrome();
        buildFirefox();
        break;
    }

    await createPackages();

    console.log('');
    console.log('🎉 Build complete!');
    console.log('');
    console.log('Output:');
    console.log(`   Chrome: ${CHROME_DIR}`);
    console.log(`   Firefox: ${FIREFOX_DIR}`);
    console.log('');
    console.log('To load in Chrome:');
    console.log('   1. Go to chrome://extensions');
    console.log('   2. Enable "Developer mode"');
    console.log('   3. Click "Load unpacked"');
    console.log(`   4. Select: ${CHROME_DIR}`);
    console.log('');
    console.log('To load in Firefox:');
    console.log('   1. Go to about:debugging');
    console.log('   2. Click "This Firefox"');
    console.log('   3. Click "Load Temporary Add-on"');
    console.log(`   4. Select: ${FIREFOX_DIR}/manifest.json`);
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

main();
