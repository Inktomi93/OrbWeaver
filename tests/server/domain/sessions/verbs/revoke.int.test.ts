import type { Db } from "@orb/db";
import { auditLogs, users } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { createSessionsService } from "@orb/server/domain/sessions";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import { createFrozenClock } from "../../../../support/clock";
import { freshDb } from "../../../../support/db";

const PEPPER = "test-session-secret-at-least-32-chars-long";
const USER_ID = castId<UserId>("user_alice");

let db: Db;
let svc: SessionsService;
const clock = createFrozenClock();

beforeEach(async () => {
  db = await freshDb();
  svc = createSessionsService({ db, now: clock.now, sessionSecret: PEPPER });
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
    await svc.revokeByToken("nope");
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
