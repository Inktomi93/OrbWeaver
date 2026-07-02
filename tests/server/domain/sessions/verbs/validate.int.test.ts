import type { Db } from "@orb/db";
import { sessions, users } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { createSessionsService } from "@orb/server/domain/sessions";
import { eq } from "drizzle-orm";
import { beforeEach, describe, vi } from "vitest";
import {
  SESSION_TTL_MS,
  SLIDE_THROTTLE_MS,
} from "../../../../../packages/server/src/domain/sessions/tokens/tokens";
import type { Clock } from "../../../../support/clock";
import { createFrozenClock } from "../../../../support/clock";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";

const PEPPER = "test-session-secret-at-least-32-chars-long";
const USER_ID = castId<UserId>("user_alice");
const HANDLE = castId<Handle>("alice");
const EXTERNAL = "authentik|abc";

let db: Db;
let svc: SessionsService;
let clock: Clock;

beforeEach(async () => {
  db = await freshDb();
  clock = createFrozenClock();
  svc = createSessionsService({ db, now: clock.now, sessionSecret: PEPPER });
  await db
    .insert(users)
    .values({ id: USER_ID, handle: HANDLE, externalId: castId(EXTERNAL), role: "owner" });
});

describe("sessions.validate — Route A (returns userId + the principal-fields)", () => {
  test("a live token resolves to userId + role + handle + externalId + enabled", async () => {
    const { token } = await svc.create({ userId: USER_ID });
    const resolved = await svc.validate(token);
    expect(resolved).not.toBeNull();
    expect(resolved?.userId).toBe(USER_ID);
    expect(resolved?.role).toBe("owner");
    expect(resolved?.handle).toBe(HANDLE);
    expect(resolved?.externalId).toBe(EXTERNAL);
    expect(resolved?.enabled).toBe(true);
  });

  test("role is RE-READ from the row each request (a role-change propagates next request)", async () => {
    const { token } = await svc.create({ userId: USER_ID });
    expect((await svc.validate(token))?.role).toBe("owner");
    await db.update(users).set({ role: "admin" }).where(eq(users.id, USER_ID));
    expect((await svc.validate(token))?.role).toBe("admin");
  });

  test("stops resolving once a user's kind flips to 'agent' — the kind='human' JOIN belt (FLAG[PD-17])", async () => {
    // An agent principal is structurally sessionless (agent-principal-design/01 §3.2). Prove the JOIN belt
    // directly: mint a session for the (human) owner, then flip the row to a valid agent shape — validate must
    // now refuse the previously-live session (wall two, behind create's mint-refusal).
    const { token } = await svc.create({ userId: USER_ID });
    expect(await svc.validate(token)).not.toBeNull();
    const ownerId = castId<UserId>("user_owner_v");
    await db.insert(users).values({ id: ownerId, handle: castId<Handle>("owner_v") });
    await db
      .update(users)
      .set({
        kind: "agent",
        role: "user",
        passwordHash: null,
        externalId: null,
        ownerUserId: ownerId,
      })
      .where(eq(users.id, USER_ID));
    expect(await svc.validate(token)).toBeNull();
  });

  test("a missing / unknown token → null", async () => {
    expect(await svc.validate("not-a-real-token")).toBeNull();
  });

  test("a revoked session → null on the NEXT request (not at TTL)", async () => {
    const { token } = await svc.create({ userId: USER_ID });
    await svc.revokeByToken(token);
    expect(await svc.validate(token)).toBeNull();
  });

  test("a disabled user → null every request (enabled gate)", async () => {
    const { token } = await svc.create({ userId: USER_ID });
    await db.update(users).set({ enabled: false }).where(eq(users.id, USER_ID));
    expect(await svc.validate(token)).toBeNull();
  });

  test("an expired session → null", async () => {
    const { token } = await svc.create({ userId: USER_ID });
    clock.advance(SESSION_TTL_MS + 1);
    expect(await svc.validate(token)).toBeNull();
  });
});

describe("sessions.validate — throttled expiry slide", () => {
  test("past the throttle: slides expiry + fires onSlide with the new expiry", async () => {
    const { token, sessionId } = await svc.create({ userId: USER_ID });
    clock.advance(SLIDE_THROTTLE_MS + 1);
    const onSlide = vi.fn<(expiresAt: number) => void>();
    const resolved = await svc.validate(token, onSlide);
    expect(resolved).not.toBeNull();
    const expectedExpiry = clock.now() + SESSION_TTL_MS;
    expect(onSlide).toHaveBeenCalledExactlyOnceWith(expectedExpiry);
    const row = (await db.select().from(sessions).where(eq(sessions.id, sessionId)))[0];
    expect(row?.expiresAt).toBe(expectedExpiry);
    expect(row?.lastSeenAt).toBe(clock.now());
  });

  test("within the throttle: no slide, onSlide not fired", async () => {
    const { token, sessionId } = await svc.create({ userId: USER_ID });
    const originalExpiry = (await db.select().from(sessions).where(eq(sessions.id, sessionId)))[0]
      ?.expiresAt;
    clock.advance(SLIDE_THROTTLE_MS - 1);
    const onSlide = vi.fn<(expiresAt: number) => void>();
    await svc.validate(token, onSlide);
    expect(onSlide).not.toHaveBeenCalled();
    const row = (await db.select().from(sessions).where(eq(sessions.id, sessionId)))[0];
    expect(row?.expiresAt).toBe(originalExpiry);
  });
});
