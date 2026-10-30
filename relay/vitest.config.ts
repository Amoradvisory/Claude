import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [cloudflareTest({
    wrangler: { configPath: './wrangler.jsonc' },
    miniflare: { bindings: {
      OWNER_SETUP_SECRET: 'local-test-only-owner-secret-not-for-deployment-0123456789',
      PUBLIC_ORIGIN: 'https://speedcar.test',
    } },
  })],
  test: { maxWorkers: 1, include: ['test/**/*.test.ts'] },
});
