// verb: testHealth — probe + throttle + circuit-breaker. Asserts the 60s throttle, the success/revoked
// classifications + their row side-effects, the 3-strike breaker (with clock advance past the window),
// the inactive-credential probe (invariant #5), and the no-probe-arm provider returning ok.

import { userCredentials } from "@orb/db";
import { createCredentialsService } from "@orb/server/domain/credentials";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
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

  test("a provider with no probe arm returns ok without probing", async () => {
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
    const result = await svc.testHealth({ principal: principal(owner), credentialId: cred.id });
    expect(result.status).toBe("ok");
    expect(h.probed).toHaveLength(0);
  });
});
