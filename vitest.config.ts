import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

// Workspace packages are read from their TypeScript source ("source" export condition),
// so tests need no build first.
export default defineConfig({
  resolve: { conditions: ['source', ...defaultServerConditions] },
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions] } },
  test: { include: ['packages/*/tests/**/*.test.ts', 'apps/*/tests/**/*.test.ts'] },
});
