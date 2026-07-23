// entry/http/hub-avatar — the session-authed hub avatar proxy + its ephemeral LRU. Pins (over a REAL Hono
// app, principal set by a test middleware): anonymous → 401; an unknown or operator-disabled hub → 404 (the
// kill switch, no upstream call); a served avatar carries the SNIFFED mime + `Cache-Control: private,
// max-age=86400`; an LRU hit serves WITHOUT re-fetching (cache hits don't debit the upstream); any upstream
// failure (no published art / blocked / non-image) → 404. Plus the AvatarLru itself: TTL expiry (injected
// clock), byte-budget eviction (oldest-first), the oversized-skip.

import type { HubKey } from "@orb/contracts/hub";
import type { Principal } from "@orb/contracts/identity";
import { DomainRateLimitError } from "@orb/kit/errors";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SniffedImage } from "@orb/kit/image-sniff";
import type { HubAvatarDeps, PrincipalEnv } from "@orb/server/entry/http";
import { AvatarLru, registerHubAvatar } from "@orb/server/entry/http";
import { Hono } from "hono";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures";

const OWNER: Principal = {
  userId: castId<UserId>("usr_owner"),
  role: "user",
  handle: castId<Handle>("owner"),
  externalId: null,
  via: "cookie",
};
const PNG: SniffedImage = { mime: "image/png", ext: "png", width: 256, height: 256, animated: false };

/** A real Hono app with the principal injected by a middleware (the app.ts seam sets it in prod). */
function makeApp(deps: HubAvatarDeps, principal: Principal | null, lru?: AvatarLru): Hono<PrincipalEnv> {
  const app = new Hono<PrincipalEnv>();
  app.use("*", async (c, next) => {
    c.set("principal", principal);
    await next();
  });
  registerHubAvatar(app, deps, lru);
  return app;
}

function makeDeps(over: Partial<HubAvatarDeps> = {}): HubAvatarDeps {
  return {
    isHubEnabled: (): boolean => true,
    fetchAvatar: (): Promise<{ bytes: Uint8Array; image: SniffedImage }> => Promise.resolve({ bytes: new Uint8Array([1, 2, 3]), image: PNG }),
    consumeAvatarRate: (): Promise<void> => Promise.resolve(),
    ...over,
  };
}

describe("registerHubAvatar", () => {
  test("anonymous caller → 401, no upstream call", async () => {
    const fetchAvatar = vi.fn(() => Promise.resolve({ bytes: new Uint8Array([1]), image: PNG }));
    const res = await makeApp(makeDeps({ fetchAvatar }), null).request("/api/hub/chub/avatar/a/b");
    expect(res.status).toBe(401);
    expect(fetchAvatar).not.toHaveBeenCalled();
  });

  test("an unknown hub key → 404, no upstream call", async () => {
    const fetchAvatar = vi.fn(() => Promise.resolve({ bytes: new Uint8Array([1]), image: PNG }));
    const res = await makeApp(makeDeps({ fetchAvatar }), OWNER).request("/api/hub/nope/avatar/a/b");
    expect(res.status).toBe(404);
    expect(fetchAvatar).not.toHaveBeenCalled();
  });

  test("a disabled hub (kill switch off) → 404, no upstream call", async () => {
    const fetchAvatar = vi.fn(() => Promise.resolve({ bytes: new Uint8Array([1]), image: PNG }));
    const res = await makeApp(makeDeps({ isHubEnabled: () => false, fetchAvatar }), OWNER).request("/api/hub/chub/avatar/a/b");
    expect(res.status).toBe(404);
    expect(fetchAvatar).not.toHaveBeenCalled();
  });

  test("serves the bytes with the sniffed mime + private cache header; the multi-segment ref rides through", async () => {
    const bytes = new Uint8Array([7, 7, 7]);
    const fetchAvatar = vi.fn((_hub: HubKey, ref: string) => {
      expect(ref).toBe("rickrocka/world_rp"); // the `:ref{.+}` param captures slashes
      return Promise.resolve({ bytes, image: PNG });
    });
    const res = await makeApp(makeDeps({ fetchAvatar }), OWNER).request("/api/hub/chartavern/avatar/rickrocka/world_rp");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=86400");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  test("an LRU hit serves without a second upstream fetch", async () => {
    const fetchAvatar = vi.fn(() => Promise.resolve({ bytes: new Uint8Array([4, 2]), image: PNG }));
    const app = makeApp(makeDeps({ fetchAvatar }), OWNER, new AvatarLru());
    await app.request("/api/hub/chub/avatar/a/b");
    await app.request("/api/hub/chub/avatar/a/b");
    expect(fetchAvatar).toHaveBeenCalledTimes(1); // second request is a cache hit
  });

  test("an upstream failure → 404 (no published art / blocked / non-image)", async () => {
    const res = await makeApp(makeDeps({ fetchAvatar: () => Promise.reject(new Error("blocked <html>secret</html>")) }), OWNER).request(
      "/api/hub/chub/avatar/a/gone",
    );
    expect(res.status).toBe(404);
  });

  test("a cache MISS over the per-user rate bucket → 429 with Retry-After, no upstream fetch", async () => {
    const fetchAvatar = vi.fn(() => Promise.resolve({ bytes: new Uint8Array([1]), image: PNG }));
    const consumeAvatarRate = vi.fn(() =>
      Promise.reject(new DomainRateLimitError("rate limit exceeded (hub:hub.avatar)", { msBeforeNext: 30_000, remainingPoints: 0 })),
    );
    const res = await makeApp(makeDeps({ fetchAvatar, consumeAvatarRate }), OWNER).request("/api/hub/chub/avatar/a/b");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(fetchAvatar).not.toHaveBeenCalled(); // throttled before any third-party egress
  });

  test("an LRU hit does NOT debit the rate bucket (cache hits don't debit)", async () => {
    const consumeAvatarRate = vi.fn(() => Promise.resolve());
    const app = makeApp(makeDeps({ consumeAvatarRate }), OWNER, new AvatarLru());
    await app.request("/api/hub/chub/avatar/a/b"); // miss — debits once
    await app.request("/api/hub/chub/avatar/a/b"); // hit — no debit
    expect(consumeAvatarRate).toHaveBeenCalledTimes(1);
  });
});

describe("AvatarLru", () => {
  test("put/get round-trips with the stored mime", () => {
    const lru = new AvatarLru();
    lru.put("chub:a", new Uint8Array([1, 2]), "image/webp");
    expect(lru.get("chub:a")).toEqual({ bytes: new Uint8Array([1, 2]), mime: "image/webp", expiresAt: expect.any(Number) });
    expect(lru.get("chub:missing")).toBeUndefined();
  });

  test("an entry past its TTL is evicted on read (injected clock)", () => {
    let clock = 1000;
    const lru = new AvatarLru(1_000_000, 100, () => clock);
    lru.put("chub:a", new Uint8Array([1]), "image/png");
    clock = 1050;
    expect(lru.get("chub:a")).toBeDefined(); // within TTL
    clock = 1101;
    expect(lru.get("chub:a")).toBeUndefined(); // past TTL
  });

  test("evicts oldest entries when over the byte budget", () => {
    const lru = new AvatarLru(10, 100_000); // 10-byte budget
    lru.put("a", new Uint8Array(6), "image/png");
    lru.put("b", new Uint8Array(6), "image/png"); // total 12 > 10 → evict "a"
    expect(lru.get("a")).toBeUndefined();
    expect(lru.get("b")).toBeDefined();
  });

  test("a single object larger than the whole budget is never cached", () => {
    const lru = new AvatarLru(10, 100_000);
    lru.put("big", new Uint8Array(20), "image/png");
    expect(lru.get("big")).toBeUndefined();
  });
});
