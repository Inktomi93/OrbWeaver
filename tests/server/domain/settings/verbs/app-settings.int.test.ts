// verbs: getAppSettings / getAppSettingsWithOverrides / updateAppSettings — the admin-runtime tier. Load-bearing invariants asserted:
// the admin gate (owner ∪ admin) on BOTH verbs; the OWNER-ONLY gate on a PATCH that touches a D17
// governance field (the box-governance split); the floor⊕override resolution; the null=CLEAR sentinel
// (a cleared override reads the env floor back); every successful write audits.

import { DomainForbiddenError } from "@orb/kit/errors";
import { env } from "@orb/server/foundation/env";
import { beforeEach, describe } from "vitest";
import { __resetEffectiveConfigCache } from "../../../../../packages/server/src/domain/settings/effective-config/cache.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

beforeEach(() => {
  // The resolved-config cache is module-scope (ASSUMES single-replica); reset it so each test starts from
  // the env floor regardless of order within this file.
  __resetEffectiveConfigCache();
});

describe("getAppSettings", () => {
  test("a non-admin (role:user) is REFUSED", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_u", role: "user" });
    await expect(h.svc.getAppSettings({ principal: principal(u, "user") })).rejects.toThrow(DomainForbiddenError);
  });

  test("an admin reads the resolved config (env floor before any write)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a", role: "admin" });
    const cfg = await h.svc.getAppSettings({ principal: principal(a, "admin") });
    expect(cfg.corpusAutoindex).toBe(env.CORPUS_AUTOINDEX);
    expect(cfg.logLevel).toBe(env.LOG_LEVEL);
  });
});

describe("getAppSettingsWithOverrides — the admin surface's floor-vs-override read", () => {
  test("a non-admin is REFUSED", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_u", role: "user" });
    await expect(h.svc.getAppSettingsWithOverrides({ principal: principal(u, "user") })).rejects.toThrow(DomainForbiddenError);
  });

  test("before any write: resolved is the floor and overrides is empty (nothing actively overridden)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a", role: "admin" });
    const view = await h.svc.getAppSettingsWithOverrides({ principal: principal(a, "admin") });
    expect(view.resolved.logLevel).toBe(env.LOG_LEVEL);
    // No override stored → the field is absent/nullish in the raw blob (the floor governs).
    expect(view.overrides.logLevel ?? null).toBeNull();
  });

  test("after an override: overrides carries the stored value AND resolved reflects it; a clear empties overrides", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a", role: "admin" });
    await h.svc.updateAppSettings({ principal: principal(a, "admin"), partial: { logLevel: "debug" } });
    const set = await h.svc.getAppSettingsWithOverrides({ principal: principal(a, "admin") });
    expect(set.overrides.logLevel).toBe("debug"); // an ACTIVE override is visible as a value in overrides
    expect(set.resolved.logLevel).toBe("debug");
    await h.svc.updateAppSettings({ principal: principal(a, "admin"), partial: { logLevel: null } });
    const cleared = await h.svc.getAppSettingsWithOverrides({ principal: principal(a, "admin") });
    expect(cleared.overrides.logLevel ?? null).toBeNull(); // cleared → back to floor-governed
    expect(cleared.resolved.logLevel).toBe(env.LOG_LEVEL);
  });
});

describe("updateAppSettings — admin tier", () => {
  test("an admin updates a NON-governance field; the resolved config + cache reflect it (audited)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a", role: "admin" });
    const resolved = await h.svc.updateAppSettings({
      principal: principal(a, "admin"),
      partial: { logLevel: "debug" },
    });
    expect(resolved.logLevel).toBe("debug");
    // The sync cache reflects the write before the call returned.
    expect(h.svc.getEffectiveConfig().logLevel).toBe("debug");
    expect(h.audits.map((x) => x.entry.action)).toContain("settings.updateAppSettings");
  });

  test("a non-admin is REFUSED", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_u", role: "user" });
    await expect(h.svc.updateAppSettings({ principal: principal(u, "user"), partial: { logLevel: "warn" } })).rejects.toThrow(DomainForbiddenError);
  });

  test("null=CLEAR: an override is set, then cleared, and the env floor reads back", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a", role: "admin" });
    await h.svc.updateAppSettings({
      principal: principal(a, "admin"),
      partial: { logLevel: "trace" },
    });
    expect(h.svc.getEffectiveConfig().logLevel).toBe("trace");
    const cleared = await h.svc.updateAppSettings({
      principal: principal(a, "admin"),
      partial: { logLevel: null },
    });
    expect(cleared.logLevel).toBe(env.LOG_LEVEL);
  });
});

describe("updateAppSettings — the owner-box governance split (F12: the private-endpoint allowlist)", () => {
  test("a delegated admin touching a governance field is REFUSED (requireOwner)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a", role: "admin" });
    await expect(
      h.svc.updateAppSettings({
        principal: principal(a, "admin"),
        partial: { privateEndpointAllowlist: ["10.0.0.0/8"] },
      }),
    ).rejects.toThrow(DomainForbiddenError);
  });

  test("a delegated admin clearing a governance field (null) is ALSO refused (presence, not value)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a", role: "admin" });
    await expect(
      h.svc.updateAppSettings({
        principal: principal(a, "admin"),
        partial: { privateEndpointAllowlist: null },
      }),
    ).rejects.toThrow(DomainForbiddenError);
  });

  test("the owner flips a governance field; the resolved config reflects it (audited)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const o = await seedUser(db, { id: "user_owner", role: "owner" });
    const resolved = await h.svc.updateAppSettings({
      principal: principal(o, "owner"),
      partial: { privateEndpointAllowlist: ["10.0.0.0/8", "127.0.0.1"] },
    });
    expect(resolved.privateEndpointAllowlist).toEqual(["10.0.0.0/8", "127.0.0.1"]);
    expect(h.audits.map((x) => x.entry.action)).toContain("settings.updateAppSettings");
  });

  test("the owner may also update a non-governance field (owner ⊇ admin)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const o = await seedUser(db, { id: "user_owner", role: "owner" });
    const resolved = await h.svc.updateAppSettings({
      principal: principal(o, "owner"),
      partial: { corpusAutoindex: false },
    });
    expect(resolved.corpusAutoindex).toBe(false);
  });
});
