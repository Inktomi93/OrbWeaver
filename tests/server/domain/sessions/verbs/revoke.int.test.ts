import type { Db } from "@orb/db";
import { auditLogs, users } from "@orb/db";
import type { ExternalId, Handle, SessionToken, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeService } from "../_support.ts";

const USER_ID = castId<UserId>("user_alice");

let db: Db;
let svc: SessionsService;

beforeEach(async () => {
  db = await freshDb();
  ({ svc } = makeService(db));
  await db.insert(users).values({ id: USER_ID, handle: castId<Handle>("alice") });
});

async function logoutAudits(): Promise<number> {
  const rows = await db.select().from(auditLogs).where(eq(auditLogs.action, "AUTH_LOGOUT"));
  return rows.length;
}

describe("sessions.revokeByToken (logout)", () => {
  test("revokes the session → validate returns null, audits AUTH_LOGOUT for the owner", async () => {
    const { token } = await svc.create({ userId: USER_ID });
    await svc.revokeByToken(token);
    expect(await svc.validate(token)).toBeNull();
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.action, "AUTH_LOGOUT"));
    expect(audits).toHaveLength(1);
    expect(audits[0]?.actorUserId).toBe(USER_ID);
  });

  test("is atomic — a second revoke matches nothing and does NOT double-audit", async () => {
    const { token } = await svc.create({ userId: USER_ID });
    await svc.revokeByToken(token);
    await svc.revokeByToken(token);
    expect(await logoutAudits()).toBe(1);
  });

  test("an unknown token is a no-op (no audit)", async () => {
    // The cast is what a forged cookie looks like AFTER the entry-tier brand: shaped like a token, matches
    // no `token_hash` row. The brand records provenance; the hash lookup is the authenticity gate.
    await svc.revokeByToken(castId<SessionToken>("nope"));
    expect(await logoutAudits()).toBe(0);
  });
});

describe("sessions.revoke (admin kick one device)", () => {
  test("revokes a specific session by id", async () => {
    const { token, sessionId } = await svc.create({ userId: USER_ID });
    await svc.revoke(sessionId);
    expect(await svc.validate(token)).toBeNull();
  });
});

describe("sessions.revokeAllForUser (kick-all)", () => {
  test("revokes every live session and returns the count flipped this call", async () => {
    const a = await svc.create({ userId: USER_ID });
    const b = await svc.create({ userId: USER_ID });
    expect(await svc.revokeAllForUser(USER_ID)).toBe(2);
    expect(await svc.validate(a.token)).toBeNull();
    expect(await svc.validate(b.token)).toBeNull();
    // Already-revoked sessions are not re-counted (atomic WHERE revokedAt IS NULL).
    expect(await svc.revokeAllForUser(USER_ID)).toBe(0);
  });

  test("returns 0 when the user has no live sessions", async () => {
    expect(await svc.revokeAllForUser(USER_ID)).toBe(0);
  });
});

// A5 — OIDC back-channel logout revokes by the stable external subject (`sub`), mapping sub→external_id→
// user→sessions. Idempotent (re-delivered logout tokens re-revoke nothing).
describe("sessions.revokeByExternalId (OIDC back-channel logout)", () => {
  const External = castId<ExternalId>("authentik|alice");

  beforeEach(async () => {
    // Bind alice's row to the external subject the logout_token will carry.
    await db.update(users).set({ externalId: External }).where(eq(users.id, USER_ID));
  });

  test("revokes every live session for the user bound to the subject → count, validate null", async () => {
    const a = await svc.create({ userId: USER_ID });
    const b = await svc.create({ userId: USER_ID });
    expect(await svc.revokeByExternalId(External)).toBe(2);
    expect(await svc.validate(a.token)).toBeNull();
    expect(await svc.validate(b.token)).toBeNull();
  });

  test("is idempotent — a re-delivered token re-revokes nothing (atomic WHERE revokedAt IS NULL)", async () => {
    await svc.create({ userId: USER_ID });
    expect(await svc.revokeByExternalId(External)).toBe(1);
    expect(await svc.revokeByExternalId(External)).toBe(0);
  });

  test("an UNKNOWN subject revokes nothing (0) — never another user's sessions", async () => {
    await svc.create({ userId: USER_ID });
    expect(await svc.revokeByExternalId(castId<ExternalId>("authentik|nobody"))).toBe(0);
  });

  test("only the SUBJECT's sessions are revoked, not a co-tenant's", async () => {
    const other = castId<UserId>("user_bob");
    await db.insert(users).values({ id: other, handle: castId<Handle>("bob"), externalId: castId<ExternalId>("authentik|bob") });
    const aliceSession = await svc.create({ userId: USER_ID });
    const bobSession = await svc.create({ userId: other });
    expect(await svc.revokeByExternalId(External)).toBe(1); // alice only
    expect(await svc.validate(aliceSession.token)).toBeNull();
    expect(await svc.validate(bobSession.token)).not.toBeNull(); // bob untouched
  });
});
