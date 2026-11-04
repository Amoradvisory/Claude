import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import type { OwnerState } from './owner-state';
import type { PhoneLink } from './phone-link';

export interface Env {
  OAUTH_KV: KVNamespace;
  OWNER_STATE: DurableObjectNamespace<OwnerState>;
  OWNER_SETUP_SECRET: string;
  PUBLIC_ORIGIN: string;
  OAUTH_PROVIDER: OAuthHelpers;
  PHONE_LINK: DurableObjectNamespace<PhoneLink>;
  PHONE_TOKEN_HASH?: string;
  PHONE_DEVICE_ID?: string;
  PHONE_MODEL?: string;
}

export const scope = 'speedcar:test';
export const phoneScope = 'speedcar:phone';
export const owner = 'speed-car-owner';

export function configuredOrigin(env: Env): string | undefined {
  try {
    const url = new URL(env.PUBLIC_ORIGIN);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.origin !== env.PUBLIC_ORIGIN || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) return;
    if (!env.OWNER_SETUP_SECRET || env.OWNER_SETUP_SECRET.length < 43 || env.OWNER_SETUP_SECRET.startsWith('REPLACE_')) return;
    return url.origin;
  } catch { return; }
}

export const sensitiveScopes=['speedcar:location','speedcar:notifications','speedcar:screen'];
