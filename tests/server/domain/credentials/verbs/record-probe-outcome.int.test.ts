// verb: recordProbeOutcome — the ROW half of a connection health probe, and the home of the SID-01 honesty
// invariant. Every arm below is a consequence somebody's stored key lives with: `unchecked` writes nothing
// and claims no throttle window (it is the ABSENCE of a verdict, not a failure); only an auth-class answer
// revokes outright; an `unreachable` answer strikes toward auto-revocation but a LOOPBACK/LAN endpoint
// strikes NOTHING ("the box is off" is not "the key is bad", owner ruling); a recovered `ok` clears a prior
// revocation; and the throttle is claimed AFTER the dial on the credential id, so a second ask inside the
// window answers `throttled` with no row write.

import { HEALTH_STRIKE_LIMIT, HEALTH_THROTTLE_MS } from "../../../../../packages/server/src/domain/credentials/health/cache.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedCredential, seedUser } from "../_support.ts";

test("`unchecked` is not a verdict: no row write, and it does not claim the throttle window", async () => {
  const db = await freshDb();
  const h = makeHarness(db);
  const { svc, owner, cred } = await seedCredential(db, h);
  const unchecked = await svc.recordProbeOutcome({
    principal: principal(owner),
    credentialId: cred.id,
    result: { status: "unchecked", checkedAt: 0, reason: "no endpoint to dial" },
    localEndpoint: false,
  });
  expect(unchecked.status).toBe("unchecked");
  // The window was NOT claimed — a real probe immediately after still lands.
  const real = await svc.recordProbeOutcome({
    principal: principal(owner),
    credentialId: cred.id,
    result: { status: "ok", checkedAt: 0 },
    localEndpoint: false,
  });
  expect(real.status).toBe("ok");
});

test("a second ask inside the throttle window answers `throttled` without touching the row", async () => {
  const db = await freshDb();
  const h = makeHarness(db);
  const { svc, owner, cred } = await seedCredential(db, h, { ownerId: "user_throttle" });
  await svc.recordProbeOutcome({ principal: principal(owner), credentialId: cred.id, result: { status: "ok", checkedAt: 0 }, localEndpoint: false });
  const second = await svc.recordProbeOutcome({
    principal: principal(owner),
    credentialId: cred.id,
    result: { status: "revoked", checkedAt: 0, reason: "401" },
    localEndpoint: false,
  });
  expect(second.status, "a revoking verdict inside the window is not applied — the dial was throttled").toBe("throttled");
  expect((await svc.list({ principal: principal(owner) })).find((row) => row.id === cred.id)?.revokedAt).toBeNull();

  // Past the window the same verdict DOES land — the positive control for the throttle.
  h.advance(HEALTH_THROTTLE_MS + 1);
  const third = await svc.recordProbeOutcome({
    principal: principal(owner),
    credentialId: cred.id,
    result: { status: "revoked", checkedAt: 0, reason: "401" },
    localEndpoint: false,
  });
  expect(third.status).toBe("revoked");
  expect((await svc.list({ principal: principal(owner) })).find((row) => row.id === cred.id)?.revokedAt).not.toBeNull();
});

test("a LOCAL endpoint's unreachable answer strikes NOTHING, however many times it is asked", async () => {
  const db = await freshDb();
  const h = makeHarness(db);
  const { svc, owner, cred } = await seedCredential(db, h, { ownerId: "user_local" });
  for (let attempt = 0; attempt < HEALTH_STRIKE_LIMIT + 2; attempt += 1) {
    const result = await svc.recordProbeOutcome({
      principal: principal(owner),
      credentialId: cred.id,
      result: { status: "unreachable", checkedAt: 0, reason: "ECONNREFUSED" },
      localEndpoint: true,
    });
    expect(result.status, "an offline box on loopback/LAN never costs the key").toBe("unreachable");
    h.advance(HEALTH_THROTTLE_MS + 1);
  }
  expect((await svc.list({ principal: principal(owner) })).find((row) => row.id === cred.id)?.revokedAt).toBeNull();
});

test("a REMOTE endpoint's unreachable answer strikes, and the limit revokes as `unreachable`, not auth", async () => {
  const db = await freshDb();
  const h = makeHarness(db);
  const { svc, owner, cred } = await seedCredential(db, h, { ownerId: "user_remote" });
  const statuses: string[] = [];
  for (let attempt = 0; attempt < HEALTH_STRIKE_LIMIT; attempt += 1) {
    const result = await svc.recordProbeOutcome({
      principal: principal(owner),
      credentialId: cred.id,
      result: { status: "unreachable", checkedAt: 0, reason: "ETIMEDOUT" },
      localEndpoint: false,
    });
    statuses.push(result.status);
    h.advance(HEALTH_THROTTLE_MS + 1);
  }
  expect(statuses.at(-1), "the strike limit trips the breaker").toBe("revoked");
  expect(statuses.slice(0, -1).every((status) => status === "unreachable")).toBe(true);
});

test("a recovered `ok` CLEARS a prior revocation", async () => {
  const db = await freshDb();
  const h = makeHarness(db);
  const { svc, owner, cred } = await seedCredential(db, h, { ownerId: "user_recover" });
  await svc.recordProbeOutcome({
    principal: principal(owner),
    credentialId: cred.id,
    result: { status: "revoked", checkedAt: 0, reason: "401" },
    localEndpoint: false,
  });
  expect((await svc.list({ principal: principal(owner) })).find((row) => row.id === cred.id)?.revokedAt).not.toBeNull();
  h.advance(HEALTH_THROTTLE_MS + 1);
  const recovered = await svc.recordProbeOutcome({
    principal: principal(owner),
    credentialId: cred.id,
    result: { status: "ok", checkedAt: 0 },
    localEndpoint: false,
  });
  expect(recovered.status).toBe("ok");
  expect((await svc.list({ principal: principal(owner) })).find((row) => row.id === cred.id)?.revokedAt).toBeNull();
});

test("a credential that is not the caller's is refused — the verb never writes a stranger's row", async () => {
  const db = await freshDb();
  const h = makeHarness(db);
  const { svc, cred } = await seedCredential(db, h, { ownerId: "user_owner2" });
  const stranger = await seedUser(db, { id: "user_stranger" });
  await expect(
    svc.recordProbeOutcome({
      principal: principal(stranger),
      credentialId: cred.id,
      result: { status: "revoked", checkedAt: 0, reason: "401" },
      localEndpoint: false,
    }),
  ).rejects.toThrow();
});
