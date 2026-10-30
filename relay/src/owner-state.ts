import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';

interface Receipt { id: string; sequence: number; written_at: string }
interface StoredState { count: number; last_receipt: Receipt | null }

export class OwnerState extends DurableObject<Env> {
  async readStatus(): Promise<StoredState> {
    return await this.ctx.storage.get<StoredState>('receipts') ?? { count: 0, last_receipt: null };
  }

  async writeReceipt(): Promise<Receipt> {
    return this.ctx.storage.transaction(async (storage) => {
      const previous = await storage.get<StoredState>('receipts') ?? { count: 0, last_receipt: null };
      const receipt = { id: crypto.randomUUID(), sequence: previous.count + 1, written_at: new Date().toISOString() };
      await storage.put('receipts', { count: receipt.sequence, last_receipt: receipt });
      const observed = await storage.get<StoredState>('receipts');
      if (observed?.last_receipt?.id !== receipt.id) throw new Error('Receipt not observed');
      return observed.last_receipt;
    });
  }

  async allowLoginAttempt(key: string): Promise<boolean> {
    return this.ctx.storage.transaction(async (storage) => {
      const now = Date.now();
      const active = (await storage.get<{ key: string; at: number }[]>('login_attempts') ?? [])
        .filter((entry) => now - entry.at < 60_000);
      if (active.filter((entry) => entry.key === key).length >= 8 || active.length >= 128) return false;
      active.push({ key, at: now });
      await storage.put('login_attempts', active);
      return true;
    });
  }
}
