import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
import { createHash } from 'node:crypto';

export default defineConfig({
  plugins: [cloudflareTest({
    wrangler: { configPath: './wrangler.jsonc' },
    miniflare: { bindings: {
      OWNER_SETUP_SECRET: 'local-test-only-owner-secret-not-for-deployment-0123456789',
      PUBLIC_ORIGIN: 'https://speedcar.test',
      PHONE_DEVICE_ID: '11111111-1111-4111-8111-111111111111',
      PHONE_TOKEN_HASH: createHash('sha256').update('test-phone-token-' + 'a'.repeat(48)).digest('hex'),
      PHONE_MODEL: '2510ERA8BG',
    } },
  })],
  test: { maxWorkers: 1, include: ['test/**/*.test.ts'] },
});
