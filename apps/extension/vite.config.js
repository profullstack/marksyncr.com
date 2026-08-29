import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'fs';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));

// Deliberately NOT `process.env.BROWSER`: that is a standard Linux env var
// (xdg-open et al) and is commonly set to something like `true` or `firefox`,
// which silently redirected the build into dist/<whatever> and shipped a zip
// missing the popup, options page, service worker and icons.
const TARGETS = ['chrome', 'firefox', 'safari'];
const requested = process.env.EXT_BROWSER;
if (requested && !TARGETS.includes(requested)) {
  throw new Error(
    `EXT_BROWSER must be one of ${TARGETS.join(', ')} (got "${requested}")`
  );
}
const browser = requested || 'chrome';

// Plugin to move HTML files from src/* to root after build
function moveHtmlPlugin() {
  return {
    name: 'move-html-files',
    closeBundle() {
      const distDir = resolve(__dirname, `dist/${browser}`);
      const srcDir = resolve(distDir, 'src');

      if (existsSync(srcDir)) {
        // Move popup/index.html
        const popupSrc = resolve(srcDir, 'popup');
        const popupDest = resolve(distDir, 'popup');
        if (existsSync(popupSrc)) {
          if (!existsSync(popupDest)) mkdirSync(popupDest, { recursive: true });
          const popupHtml = resolve(popupSrc, 'index.html');
          if (existsSync(popupHtml)) {
            renameSync(popupHtml, resolve(popupDest, 'index.html'));
          }
        }

        // Move options/index.html
        const optionsSrc = resolve(srcDir, 'options');
        const optionsDest = resolve(distDir, 'options');
        if (existsSync(optionsSrc)) {
          if (!existsSync(optionsDest)) mkdirSync(optionsDest, { recursive: true });
          const optionsHtml = resolve(optionsSrc, 'index.html');
          if (existsSync(optionsHtml)) {
            renameSync(optionsHtml, resolve(optionsDest, 'index.html'));
          }
        }

        // Move the shield's warning page to /blocked.html at the package root.
        // The redirect rule names that exact path and it is declared as a
        // web_accessible_resource, so it cannot live under src/ or a subfolder.
        const blockedHtml = resolve(srcDir, 'blocked', 'index.html');
        if (existsSync(blockedHtml)) {
          renameSync(blockedHtml, resolve(distDir, 'blocked.html'));
        }

        // Clean up the src directory
        rmSync(srcDir, { recursive: true, force: true });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load env from root .env.local
  const rootEnvDir = resolve(__dirname, '../..');
  const env = loadEnv(mode, rootEnvDir, '');

  return {
    plugins: [react(), moveHtmlPlugin()],
    build: {
      outDir: `dist/${browser}`,
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'src/popup/index.html'),
          background: resolve(__dirname, 'src/background/index.js'),
          options: resolve(__dirname, 'src/options/index.html'),
          blocked: resolve(__dirname, 'src/blocked/index.html'),
        },
        output: {
          entryFileNames: '[name]/index.js',
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
      // Don't minify for easier debugging during development
      minify: process.env.NODE_ENV === 'production',
      sourcemap: process.env.NODE_ENV !== 'production',
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    // Map NEXT_PUBLIC_ vars from web/.env.local to VITE_ vars for the extension
    define: {
      'process.env.BROWSER': JSON.stringify(browser),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_URL || ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
      ),
      'import.meta.env.VITE_APP_URL': JSON.stringify(
        env.NEXT_PUBLIC_APP_URL || 'https://marksyncr.com'
      ),
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
    },
  };
});
