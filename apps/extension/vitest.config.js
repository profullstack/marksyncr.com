import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

const alias = { '@': resolve(import.meta.dirname, 'src') };

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    globals: true,
    setupFiles: ['./vitest.setup.js'],
    // vitest 4 removed environmentMatchGlobs: React component tests (.jsx)
    // run in jsdom as their own project, everything else in node.
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['__tests__/**/*.test.js'],
        },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['__tests__/**/*.test.jsx'],
        },
      },
    ],
  },
});
