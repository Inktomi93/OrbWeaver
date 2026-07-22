// The hub avatar proxy (D61 doc 03 §3). `GET /api/hub/:hub/avatar/:ref` server-proxies a remote hub's card
// art instead of the browse grid loading 48 per-vendor-CDN thumbnails client-direct (which would leak the
// user's IP + full browse pattern to four vendors as a side effect of scrolling). Session-authed like
// `/blob` — never anonymous; a disabled hub 404s (the kill switch). The upstream fetch is the sealed
// adapter's `fetchAvatar` (safeFetch host-pinned + isAllowedImageBuffer — 10 MB/dimension caps, the SNIFFED
// mime, never the remote header). An ephemeral in-process LRU + `Cache-Control: private, max-age=86400`
// serve repeat scrolls without re-fetching; NEVER CAS (D21 — CAS is the user's OWNED index; a thumbnail
// cache is infrastructure, not canon). A ref with no published art (or any upstream failure) is a 404 — the
// browse grid renders a placeholder, no foreign-existence leak.

import type { HubKey } from "@orb/contracts/hub";
import { HUB_KEYS } from "@orb/contracts/hub";
import type { Principal } from "@orb/contracts/identity";
import { DomainRateLimitError } from "@orb/kit/errors";
import type { SniffedImage } from "@orb/kit/image-sniff";
import type { Context, Hono } from "hono";

const UNAUTHORIZED = 401;
const NOT_FOUND = 404;
const TOO_MANY_REQUESTS = 429;
const MS_PER_SECOND = 1000;
const AVATAR_ROUTE = "/api/hub/:hub/avatar/:ref{.+}";
// D21 posture for an authed byte response: a shared proxy cache must not serve one user's fetch to another.
const CACHE_CONTROL = "private, max-age=86400";
const LRU_MAX_BYTES = 67_108_864; // 64 MiB ephemeral thumbnail cache
const LRU_TTL_MS = 86_400_000; // 24 h

export interface PrincipalEnv {
  // biome-ignore lint/style/useNamingConvention: `Variables` is Hono's reserved Env key (framework-fixed name).
  Variables: { principal: Principal | null };
}

export interface HubAvatarDeps {
  /** The live kill-switch reader (the SAME one the domain verbs gate on — an operator flip is live). */
  readonly isHubEnabled: (hub: HubKey) => boolean;
  /** Each adapter's `fetchAvatar` pre-bound with its host-pinned `HubIo` (compose `buildHubAvatarFetcher`) —
   *  the ONE home for this op signature; compose + `AppDeps` reference `HubAvatarDeps["fetchAvatar"]`. */
  readonly fetchAvatar: (hub: HubKey, ref: string) => Promise<{ readonly bytes: Uint8Array; readonly image: SniffedImage }>;
  /** The per-user 120/min proxy bucket (doc 03 §4; `createHubAvatarLimiter`). Consumed on a cache MISS only
   *  (cache hits don't debit); throws {@link DomainRateLimitError} when over budget → a 429 with Retry-After. */
  readonly consumeAvatarRate: (userId: string) => Promise<void>;
}

interface CacheEntry {
  readonly bytes: Uint8Array;
  readonly mime: string;
  readonly expiresAt: number;
}

/** A byte-bounded, TTL'd, insertion-order LRU (Map preserves insertion order; a hit re-inserts to the tail).
 *  Ephemeral per-process — an evicted entry is just a re-fetch. Injectable clock for deterministic tests. */
export class AvatarLru {
  private readonly entries = new Map<string, CacheEntry>();
  private totalBytes = 0;
  private readonly maxBytes: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(maxBytes: number = LRU_MAX_BYTES, ttlMs: number = LRU_TTL_MS, now: () => number = Date.now) {
    this.maxBytes = maxBytes;
    this.ttlMs = ttlMs;
    this.now = now;
  }

  get(key: string): CacheEntry | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return;
    }
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      this.totalBytes -= entry.bytes.byteLength;
      return;
    }
    // Re-insert to move to the recency tail.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  put(key: string, bytes: Uint8Array, mime: string): void {
    const existing = this.entries.get(key);
    if (existing !== undefined) {
      this.entries.delete(key);
      this.totalBytes -= existing.bytes.byteLength;
    }
    // A single object larger than the whole budget is never cached (served once, not stored).
    if (bytes.byteLength > this.maxBytes) {
      return;
    }
    this.entries.set(key, { bytes, mime, expiresAt: this.now() + this.ttlMs });
    this.totalBytes += bytes.byteLength;
    this.evictToBudget();
  }

  private evictToBudget(): void {
    for (const [key, entry] of this.entries) {
      if (this.totalBytes <= this.maxBytes) {
        return;
      }
      this.entries.delete(key);
      this.totalBytes -= entry.bytes.byteLength;
    }
  }
}

function isHubKey(hub: string): hub is HubKey {
  return (HUB_KEYS as readonly string[]).includes(hub);
}

function serveBytes(bytes: Uint8Array, mime: string): Response {
  // DOM's `BufferSource` excludes the `SharedArrayBuffer` arm of the lib's widened `Uint8Array` default;
  // proxy bytes are always `ArrayBuffer`-backed (safeFetch / node Buffer), so narrow the view — never a copy.
  const body = bytes as Uint8Array<ArrayBuffer>;
  return new Response(body, {
    headers: { "Content-Type": mime, "Content-Length": String(bytes.byteLength), "Cache-Control": CACHE_CONTROL },
  });
}

/** Consume one point of the per-user proxy bucket; returns a 429 Response (with Retry-After) when over
 *  budget, else null (proceed). Mirrors auth-routes' `throttleLogin` shape. */
async function throttleAvatar(deps: HubAvatarDeps, c: Context<PrincipalEnv>, userId: string): Promise<Response | null> {
  try {
    await deps.consumeAvatarRate(userId);
    return null;
  } catch (err) {
    if (err instanceof DomainRateLimitError) {
      if (err.msBeforeNext !== undefined) {
        c.header("Retry-After", String(Math.max(1, Math.ceil(err.msBeforeNext / MS_PER_SECOND))));
      }
      return c.body(null, TOO_MANY_REQUESTS);
    }
    throw err;
  }
}

/** Register `GET /api/hub/:hub/avatar/:ref` on `app`. Auth-first, kill-switch-gated, LRU-cached, rate-metered
 *  on a cache miss. */
export function registerHubAvatar(app: Hono<PrincipalEnv>, deps: HubAvatarDeps, lru: AvatarLru = new AvatarLru()): void {
  app.get(AVATAR_ROUTE, async (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    const hub = c.req.param("hub");
    const ref = c.req.param("ref");
    if (!isHubKey(hub)) {
      return c.body(null, NOT_FOUND); // unknown hub key — leak-free 404
    }
    if (!deps.isHubEnabled(hub)) {
      return c.body(null, NOT_FOUND); // operator-disabled hub (the kill switch) — leak-free 404
    }

    const key = `${hub}:${ref}`;
    const cached = lru.get(key);
    if (cached !== undefined) {
      return serveBytes(cached.bytes, cached.mime); // served without an upstream call (cache hits don't debit)
    }

    // A cache MISS means an actual third-party egress — meter it (the per-user 120/min proxy bucket) so one
    // user's scripted scrolling can't get the server's IP blocked for everyone. A hit above never reaches here.
    const throttled = await throttleAvatar(deps, c, principal.userId);
    if (throttled !== null) {
      return throttled;
    }

    try {
      const { bytes, image } = await deps.fetchAvatar(hub, ref);
      lru.put(key, bytes, image.mime);
      return serveBytes(bytes, image.mime);
    } catch {
      // A ref with no published art, a blocked/oversized/non-image upstream, or any network failure → 404.
      return c.body(null, NOT_FOUND);
    }
  });
}
