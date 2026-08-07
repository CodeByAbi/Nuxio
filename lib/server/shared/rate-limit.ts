/**
 * In-memory sliding-window-ish (fixed-window) rate limiter for development
 * and single-instance deployments. Per ADR/Phase 7 plan this is swapped for
 * a Redis-backed implementation behind the same `rateLimit` signature once
 * running multi-instance, since a `Map` is per-process and won't coordinate
 * across serverless instances. The signature is `async` from the start (even
 * though the in-memory path never awaits anything) so a Redis-backed
 * implementation is a true drop-in — callers already `await` it.
 */

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  /** Unix ms timestamp when the current window resets. */
  reset: number;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, WindowEntry>();

/** Chance per call to sweep the whole store for expired entries, so memory
 * doesn't grow unbounded from keys (e.g. per-IP) that are never hit again. */
const SWEEP_PROBABILITY = 0.01;

function sweepExpired(now: number): void {
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

/**
 * @param key Identifier for the caller being limited (e.g. `user:${userId}` or `ip:${ip}`).
 * @param limit Max requests allowed per window.
 * @param windowMs Window size in milliseconds.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const now = Date.now();
  if (Math.random() < SWEEP_PROBABILITY) {
    sweepExpired(now);
  }

  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { success: true, remaining: limit - 1, reset: resetAt };
  }

  if (entry.count >= limit) {
    return { success: false, remaining: 0, reset: entry.resetAt };
  }

  entry.count += 1;
  return { success: true, remaining: limit - entry.count, reset: entry.resetAt };
}
