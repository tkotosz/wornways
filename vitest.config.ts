import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

// Workspace packages are read from their TypeScript source ("source" export condition),
// so tests need no build first.

// Local time is UTC in the tests, however they are started, so the times in test files
// (activity names after the part of the day, periods) read the same on every machine. The
// test workers start after this and take it over.
process.env['TZ'] = 'UTC';

export default defineConfig({
  resolve: { conditions: ['source', ...defaultServerConditions] },
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions] } },
  test: { include: ['packages/*/tests/**/*.test.ts', 'apps/*/tests/**/*.test.ts'] },
});
