// The CSP ↔ AppSetting seam, end to end over a REAL db: stored `forbidExternalMedia` override →
// `reloadEffectiveConfig` → the sync resolved-config cache → the `allowExternalMedia` thunk `entry/app.ts`
// hands `securityHeaders()` → the `Content-Security-Policy` header a browser receives.
//
// This is the test that would have caught the placebo: the unit suite can only prove the middleware
// honours a thunk, not that the thunk is wired to the setting an admin actually flips. Asserted BOTH
// directions (the header re-tightens on a flip back), and on the DEFAULT (no override) row — the floor
// forbids external media, so a fresh deployment ships the strict policy.
// ASSUMES(single-replica): the effective-config cache is module-scope, reset per test here.

import { Hono } from "hono";
import { beforeEach, describe } from "vitest";
import {
  __resetEffectiveConfigCache,
  getEffectiveConfig,
  reloadEffectiveConfig,
} from "../../../../packages/server/src/domain/settings/effective-config/cache.ts";
import { writeAppOverride } from "../../../../packages/server/src/domain/settings/persistence/queries.ts";
import { securityHeaders } from "../../../../packages/server/src/entry/http/security-headers.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";

const AT = 1_750_000_000_000;

/** The EXACT wiring `entry/app.ts` uses — the point of the test is that this expression is live. */
function appUnderTest(): Hono {
  const app = new Hono();
  app.use(
    "*",
    securityHeaders({
      dev: false,
      allowExternalMedia: () => !getEffectiveConfig().forbidExternalMedia,
    }),
  );
  app.get("/", (c) => c.text("ok"));
  return app;
}

async function cspOf(app: Hono): Promise<string> {
  return (await app.request("/")).headers.get("content-security-policy") ?? "";
}

beforeEach(() => {
  __resetEffectiveConfigCache();
});

describe("securityHeaders ← AppSettings.forbidExternalMedia", () => {
  test("no stored override ⇒ the born-in-DB floor forbids ⇒ no https: in the policy", async () => {
    const db = await freshDb();
    await reloadEffectiveConfig(db);
    expect(await cspOf(appUnderTest())).not.toContain("https:");
  });

  test("flipping the setting changes the NEXT response's header (both directions, one app instance)", async () => {
    const db = await freshDb();
    await reloadEffectiveConfig(db);
    const app = appUnderTest();

    const blocked = await cspOf(app);
    expect(blocked).toContain("img-src 'self' blob:");
    expect(blocked).not.toContain("https:");

    // Admin turns "Block external media" OFF; the write path reloads the cache.
    await writeAppOverride(db, { forbidExternalMedia: false, schemaVersion: 2 }, AT);
    await reloadEffectiveConfig(db);

    const allowed = await cspOf(app);
    expect(allowed).toContain("img-src 'self' blob: https:");
    expect(allowed).toContain("media-src 'self' blob: https:");

    // …and back ON — belt and suspenders returns without a restart.
    await writeAppOverride(db, { forbidExternalMedia: true, schemaVersion: 2 }, AT);
    await reloadEffectiveConfig(db);
    expect(await cspOf(app)).toBe(blocked);
  });

  test("the CLEAR sentinel (null) falls back to the forbidding floor", async () => {
    const db = await freshDb();
    await writeAppOverride(db, { forbidExternalMedia: false, schemaVersion: 2 }, AT);
    await reloadEffectiveConfig(db);
    expect(await cspOf(appUnderTest())).toContain("https:");

    await writeAppOverride(db, { forbidExternalMedia: null, schemaVersion: 2 }, AT);
    await reloadEffectiveConfig(db);
    expect(await cspOf(appUnderTest())).not.toContain("https:");
  });
});
