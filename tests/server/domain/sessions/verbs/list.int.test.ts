import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { createSessionsService } from "@orb/server/domain/sessions";
import { beforeEach, describe, expect, test } from "vitest";
import { createFrozenClock } from "../../../../support/clock";
import { freshDb } from "../../../../support/db";

const PEPPER = "test-session-secret-at-least-32-chars-long";
const USER_ID = castId<UserId>("user_alice");
const OTHER_ID = castId<UserId>("user_bob");

let db: Db;
let svc: SessionsService;
const clock = createFrozenClock();

beforeEach(async () => {
  db = await freshDb();
  svc = createSessionsService({ db, now: clock.now, sessionSecret: PEPPER });
  await db.insert(users).values([
    { id: USER_ID, handle: castId<Handle>("alice") },
    { id: OTHER_ID, handle: castId<Handle>("bob") },
  ]);
});

describe("sessions.listForUser", () => {
  test("returns the user's sessions as a secret-free SessionView (no token / hash / userId)", async () => {
    const { sessionId } = await svc.create({ userId: USER_ID, userAgent: "UA/1" });
    const views = await svc.listForUser(USER_ID);
    expect(views).toHaveLength(1);
    const view = views[0];
    expect(view?.id).toBe(sessionId);
    expect(view?.revokedAt).toBeNull();
    expect(view?.userAgent).toBe("UA/1");
    // The projection carries no secret/identity fields.
    expect(view).not.toHaveProperty("tokenHash");
    expect(view).not.toHaveProperty("userId");
  });

  test("scopes to the requested user only", async () => {
    await svc.create({ userId: USER_ID });
    await svc.create({ userId: OTHER_ID });
    expect(await svc.listForUser(USER_ID)).toHaveLength(1);
    expect(await svc.listForUser(OTHER_ID)).toHaveLength(1);
  });

  test("is empty for a user with no sessions", async () => {
    expect(await svc.listForUser(USER_ID)).toStrictEqual([]);
  });
});
