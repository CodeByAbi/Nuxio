/**
 * Rate limiting, abstracted behind `RateLimiter` so the backing store can be
 * swapped (e.g. for Upstash Redis once running multi-instance) without
 * touching callers. Callers only ever use the module-level `rateLimit()`
 * function, which delegates to whichever `RateLimiter` is currently active
 * via `setRateLimiter()` — the service layer never depends on the concrete
 * implementation.
 */

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  /** Unix ms timestamp when the current window resets. */
  reset: number;
}

export interface RateLimiter {
  /**
   * @param key Identifier for the caller being limited (e.g. `user:${userId}` or `ip:${ip}`).
   * @param limit Max requests allowed per window.
   * @param windowMs Window size in milliseconds.
   */
  limit(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window limiter backed by an in-process `Map`. Fine for development
 * and single-instance deployments, but a `Map` is per-process and won't
 * coordinate across serverless instances — that's what `setRateLimiter` is
 * for.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly store = new Map<string, WindowEntry>();

  /** Chance per call to sweep the whole store for expired entries, so memory
   * doesn't grow unbounded from keys (e.g. per-IP) that are never hit again. */
  private static readonly SWEEP_PROBABILITY = 0.01;

  private sweepExpired(now: number): void {
    for (const [key, entry] of this.store) {
      if (entry.resetAt <= now) {
        this.store.delete(key);
      }
    }
  }

  async limit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    if (Math.random() < InMemoryRateLimiter.SWEEP_PROBABILITY) {
      this.sweepExpired(now);
    }

    const entry = this.store.get(key);

    if (!entry || entry.resetAt <= now) {
      const resetAt = now + windowMs;
      this.store.set(key, { count: 1, resetAt });
      return { success: true, remaining: limit - 1, reset: resetAt };
    }

    if (entry.count >= limit) {
      return { success: false, remaining: 0, reset: entry.resetAt };
    }

    entry.count += 1;
    return { success: true, remaining: limit - entry.count, reset: entry.resetAt };
  }
}

let activeLimiter: RateLimiter = new InMemoryRateLimiter();

/**
 * Swaps the backing implementation (e.g. to an Upstash-backed `RateLimiter`
 * once multi-instance). Call this once at startup/module-init — service
 * layer code should never call it, only import `rateLimit`.
 */
export function setRateLimiter(limiter: RateLimiter): void {
  activeLimiter = limiter;
}

export function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  return activeLimiter.limit(key, limit, windowMs);
}
