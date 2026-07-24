import type { Db } from "@orb/db";
import { auditLogs, sessions, users } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createTokenHasher } from "../../../../../packages/server/src/domain/sessions/tokens/tokens";
import { FROZEN_AT_MS } from "../../../../support/clock";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { makeService, PEPPER } from "../_support.ts";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const USER_ID = castId<UserId>("user_alice");
const SESSION_ID_RE = /^session_/u;

let db: Db;
let svc: SessionsService;

beforeEach(async () => {
  db = await freshDb();
  ({ svc } = makeService(db));
  await db.insert(users).values({ id: USER_ID, handle: castId<Handle>("alice") });
});

describe("sessions.create", () => {
  test("returns an opaque token + row id + the 30-day expiry", async () => {
    const result = await svc.create({ userId: USER_ID });
    expect(result.token.length).toBeGreaterThan(0);
    expect(result.sessionId).toMatch(SESSION_ID_RE);
    expect(result.expiresAt).toBe(FROZEN_AT_MS + SESSION_TTL_MS);
  });

  test("persists ONLY the peppered hash — never the raw token (invariant #3)", async () => {
    const { token, sessionId } = await svc.create({ userId: USER_ID });
    const rows = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    const row = rows[0];
    expect(row).toBeDefined();
    expect(row?.tokenHash).toBe(createTokenHasher(PEPPER)(token));
    expect(row?.tokenHash).not.toBe(token);
    expect(JSON.stringify(row)).not.toContain(token);
  });

  test("captures the user-agent when supplied, null otherwise", async () => {
    const a = await svc.create({ userId: USER_ID, userAgent: "Firefox/1.0" });
    const b = await svc.create({ userId: USER_ID });
    const rowA = (await db.select().from(sessions).where(eq(sessions.id, a.sessionId)))[0];
    const rowB = (await db.select().from(sessions).where(eq(sessions.id, b.sessionId)))[0];
    expect(rowA?.userAgent).toBe("Firefox/1.0");
    expect(rowB?.userAgent).toBeNull();
  });

  test("audits AUTH_LOGIN attributed to the session owner", async () => {
    const { sessionId } = await svc.create({ userId: USER_ID });
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.action, "AUTH_LOGIN"));
    expect(audits).toHaveLength(1);
    expect(audits[0]?.actorUserId).toBe(USER_ID);
    expect(audits[0]?.entityId).toBe(sessionId);
  });
});
