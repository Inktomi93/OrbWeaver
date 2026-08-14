// verb: testHealth — probe + throttle + circuit-breaker. Asserts the 60s throttle, the success/revoked
// classifications + their row side-effects, the 3-strike breaker (with clock advance past the window),
// the inactive-credential probe (invariant #5), and the SID-01 honesty invariant: a `custom_openai` row is
// really dialled (through the injected endpoint probe) and a provider with no probe arm reports `unchecked`
// — this file previously asserted the defect (an unprobed `ok` for every non-openrouter provider).

import { userCredentials } from "@orb/db";
import { createCredentialsService } from "@orb/server/domain/credentials";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedCredential, seedUser } from "../_support.ts";

const MINUTE_MS = 61_000;

describe("testHealth", () => {
  test("a healthy probe returns ok and clears a stale revocation", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const cred = await svc.add({ principal: principal(owner), provider: "openrouter", key: "k" });
    await svc.markRevokedByUser({ principal: principal(owner), credentialId: cred.id });

    h.setProbeResult({ status: "ok", checkedAt: 0 });
    const result = await svc.testHealth({ principal: principal(owner), credentialId: cred.id });
    expect(result.status).toBe("ok");
    const rows = await db.select().from(userCredentials).where(eq(userCredentials.id, cred.id));
    expect(rows[0]?.revokedAt).toBeNull();
  });

  test("a second probe within 60s is throttled (no second probe goes out)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const { svc, owner, cred } = await seedCredential(db, h);

    await svc.testHealth({ principal: principal(owner), credentialId: cred.id });
    const second = await svc.testHealth({ principal: principal(owner), credentialId: cred.id });
    expect(second.status).toBe("throttled");
    expect(h.probed).toHaveLength(1);
  });

  test("a revoked classification marks the row revoked", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const { svc, owner, cred } = await seedCredential(db, h);

    h.setProbeResult({ status: "revoked", checkedAt: 0, reason: "401" });
    const result = await svc.testHealth({ principal: principal(owner), credentialId: cred.id });
    expect(result.status).toBe("revoked");
    const rows = await db.select().from(userCredentials).where(eq(userCredentials.id, cred.id));
    expect(rows[0]?.revokedAt).not.toBeNull();
  });

  test("three consecutive unreachable probes trip the breaker → revoked", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const { svc, owner, cred } = await seedCredential(db, h);

    h.setProbeResult({ status: "unreachable", checkedAt: 0, reason: "ECONNREFUSED" });
    const first = await svc.testHealth({ principal: principal(owner), credentialId: cred.id });
    expect(first.status).toBe("unreachable");
    h.advance(MINUTE_MS);
    const second = await svc.testHealth({ principal: principal(owner), credentialId: cred.id });
    expect(second.status).toBe("unreachable");
    h.advance(MINUTE_MS);
    const third = await svc.testHealth({ principal: principal(owner), credentialId: cred.id });
    expect(third.status).toBe("revoked");
    const rows = await db.select().from(userCredentials).where(eq(userCredentials.id, cred.id));
    expect(rows[0]?.revokedAt).not.toBeNull();
  });

  test("an INACTIVE credential can still be probed by id (invariant #5)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    await svc.add({ principal: principal(owner), provider: "openrouter", key: "k1", label: "a" });
    const inactive = await svc.add({
      principal: principal(owner),
      provider: "openrouter",
      key: "k2",
      label: "b",
    });
    expect(inactive.active).toBe(false);

    h.setProbeResult({ status: "ok", checkedAt: 0 });
    const result = await svc.testHealth({ principal: principal(owner), credentialId: inactive.id });
    expect(result.status).toBe("ok");
    expect(h.probed).toHaveLength(1);
  });

  // ── SID-01: `ok` means A PROBE WENT OUT AND PASSED. Never an unprobed green. ──────────────────────

  test("a provider with NO probe arm reports unchecked — never a green it did not earn", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const cred = await svc.add({ principal: principal(owner), provider: "anthropic", key: "k" });

    const result = await svc.testHealth({ principal: principal(owner), credentialId: cred.id });
    expect(result.status).toBe("unchecked");
    expect(h.probed).toHaveLength(0);
    expect(h.endpointProbes).toHaveLength(0);
  });

  test("an unprobed provider does not burn the 60s window — a second ask is unchecked, not throttled", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const cred = await svc.add({ principal: principal(owner), provider: "openai", key: "k" });

    await svc.testHealth({ principal: principal(owner), credentialId: cred.id });
    const second = await svc.testHealth({ principal: principal(owner), credentialId: cred.id });
    expect(second.status).toBe("unchecked");
  });

  test("a custom_openai credential is REALLY probed — an unreachable endpoint is never ok", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const cred = await svc.add({
      principal: principal(owner),
      provider: "custom_openai",
      key: "sk-byo-secret",
      metadata: { kind: "custom_openai", baseUrl: "https://x.test/v1", headers: { "x-team": "alpha" } },
    });

    h.setEndpointProbeResult({ status: "unreachable", checkedAt: 0, reason: "ECONNREFUSED" });
    const result = await svc.testHealth({ principal: principal(owner), credentialId: cred.id });

    expect(result.status).toBe("unreachable");
    // The probe reached the endpoint the ROW declares, carrying the decrypted key (an auth check with no
    // key would classify every authenticated endpoint as revoked).
    expect(h.endpointProbes).toEqual([{ baseUrl: "https://x.test/v1", apiKey: "sk-byo-secret", headers: { "x-team": "alpha" } }]);
  });

  test("a custom_openai endpoint that rejects the key marks the row revoked", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const cred = await svc.add({
      principal: principal(owner),
      provider: "custom_openai",
      key: "k",
      metadata: { kind: "custom_openai", baseUrl: "https://x.test/v1" },
    });

    h.setEndpointProbeResult({ status: "revoked", checkedAt: 0, reason: "endpoint rejected the credential (HTTP 401)" });
    const result = await svc.testHealth({ principal: principal(owner), credentialId: cred.id });

    expect(result.status).toBe("revoked");
    const rows = await db.select().from(userCredentials).where(eq(userCredentials.id, cred.id));
    expect(rows[0]?.revokedAt).not.toBeNull();
  });

  // ── loopback/LAN endpoints never auto-revoke (owner ruling) ───────────────────────────────────────

  test("three consecutive unreachable probes on a LOOPBACK custom_openai endpoint never revoke", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const cred = await svc.add({
      principal: principal(owner),
      provider: "custom_openai",
      key: "k",
      metadata: { kind: "custom_openai", baseUrl: "http://127.0.0.1:8000/v1" },
    });

    h.setEndpointProbeResult({ status: "unreachable", checkedAt: 0, reason: "ECONNREFUSED" });
    for (let i = 0; i < 3; i++) {
      const result = await svc.testHealth({ principal: principal(owner), credentialId: cred.id });
      expect(result.status).toBe("unreachable");
      h.advance(MINUTE_MS);
    }
    const rows = await db.select().from(userCredentials).where(eq(userCredentials.id, cred.id));
    // A box being offline is not a credential fact — the strike counter never fires for it.
    expect(rows[0]?.revokedAt).toBeNull();
  });

  test("three consecutive unreachable probes on a PUBLIC custom_openai endpoint still trip the breaker", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const cred = await svc.add({
      principal: principal(owner),
      provider: "custom_openai",
      key: "k",
      metadata: { kind: "custom_openai", baseUrl: "https://remote.example.com/v1" },
    });

    h.setEndpointProbeResult({ status: "unreachable", checkedAt: 0, reason: "ECONNREFUSED" });
    await svc.testHealth({ principal: principal(owner), credentialId: cred.id });
    h.advance(MINUTE_MS);
    await svc.testHealth({ principal: principal(owner), credentialId: cred.id });
    h.advance(MINUTE_MS);
    const third = await svc.testHealth({ principal: principal(owner), credentialId: cred.id });
    expect(third.status).toBe("revoked");
    const rows = await db.select().from(userCredentials).where(eq(userCredentials.id, cred.id));
    expect(rows[0]?.revokedAt).not.toBeNull();
  });

  test("a custom_openai row with no usable endpoint metadata is unchecked and dials NOTHING", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    // A corrupt/legacy row: the custom_openai provider with no baseUrl to probe (the parse seam collapses it).
    const cred = await svc.add({ principal: principal(owner), provider: "custom_openai", key: "k" });

    const result = await svc.testHealth({ principal: principal(owner), credentialId: cred.id });
    expect(result.status).toBe("unchecked");
    expect(h.endpointProbes).toHaveLength(0);
  });
});
