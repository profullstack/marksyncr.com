import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const browser = process.env.BROWSER || 'chrome';

export default defineConfig(({ mode }) => {
  // Load env from root .env.local
  const rootEnvDir = resolve(__dirname, '../..');
  const env = loadEnv(mode, rootEnvDir, '');
  
  return {
    plugins: [react()],
    build: {
      outDir: `dist/${browser}`,
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'src/popup/index.html'),
          background: resolve(__dirname, 'src/background/index.js'),
          options: resolve(__dirname, 'src/options/index.html'),
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
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''),
      'import.meta.env.VITE_APP_URL': JSON.stringify(env.NEXT_PUBLIC_APP_URL || 'https://marksyncr.com'),
    },
  };
});
