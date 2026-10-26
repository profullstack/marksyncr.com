/**
 * Vitest setup file
 * Configures testing environment for React components
 */

import '@testing-library/jest-dom/vitest';

// `server-only` throws outside a React Server Components build; route and lib
// modules that import it are plain server code under test.
import { vi } from 'vitest';
vi.mock('server-only', () => ({}));
