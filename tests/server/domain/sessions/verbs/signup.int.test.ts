// D259 — the sessions half of the signup batch: the account insert statement and the handle-key read. The
// statement writes only where the admission it is handed holds and no row carries the handle's key (any case,
// any confusable), and it never absorbs a conflict.

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { seedUser } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeService } from "../_support.ts";

const AT = 1_750_000_000_000;
const ADMITS = sql`1 = 1`;
const REFUSES = sql`1 = 0`;

let db: Db;
let svc: SessionsService;

beforeEach(async () => {
  db = await freshDb();
  ({ svc } = makeService(db));
});

async function rowsFor(handle: Handle): Promise<(typeof users.$inferSelect)[]> {
  return await db.select().from(users).where(eq(users.handle, handle));
}

describe("sessions.signupUserStatement", () => {
  test("an admitted statement inserts a user-role human with the hash under the minted id", async () => {
    const { userId, statement } = svc.signupUserStatement({ handle: castId<Handle>("friend"), passwordHash: "scrypt$x", at: AT, admission: ADMITS });
    expect(await statement).toEqual([{ id: userId }]);
    expect(await rowsFor(castId<Handle>("friend"))).toEqual([
      expect.objectContaining({ id: userId, role: "user", kind: "human", enabled: true, passwordHash: "scrypt$x", externalId: null, createdAt: AT }),
    ]);
  });

  test("a refused admission writes nothing", async () => {
    const { statement } = svc.signupUserStatement({ handle: castId<Handle>("friend"), passwordHash: "scrypt$x", at: AT, admission: REFUSES });
    expect(await statement).toEqual([]);
    expect(await rowsFor(castId<Handle>("friend"))).toHaveLength(0);
  });

  test("a handle held in another case writes nothing", async () => {
    await seedUser(db, { handle: castId<Handle>("Friend") });
    const { statement } = svc.signupUserStatement({ handle: castId<Handle>("fRIEND"), passwordHash: "scrypt$x", at: AT, admission: ADMITS });
    expect(await statement).toEqual([]);
    expect(await rowsFor(castId<Handle>("fRIEND"))).toHaveLength(0);
  });

  test("a confusable of a held handle writes nothing, even when it lands after the pre-check", async () => {
    await seedUser(db, { handle: castId<Handle>("host") });
    const { statement } = svc.signupUserStatement({ handle: castId<Handle>("h0st"), passwordHash: "scrypt$x", at: AT, admission: ADMITS });
    expect(await statement).toEqual([]);
    expect(await rowsFor(castId<Handle>("h0st"))).toHaveLength(0);
  });

  test("each call mints a fresh id", () => {
    const first = svc.signupUserStatement({ handle: castId<Handle>("a1"), passwordHash: "h", at: AT, admission: ADMITS });
    const second = svc.signupUserStatement({ handle: castId<Handle>("a2"), passwordHash: "h", at: AT, admission: ADMITS });
    expect(first.userId).not.toBe(second.userId);
  });
});

describe("sessions.signupHandleTaken", () => {
  test("answers true for the same handle in any case, false for a free one", async () => {
    await seedUser(db, { handle: castId<Handle>("Friend") });
    expect(await svc.signupHandleTaken(castId<Handle>("friend"))).toBe(true);
    expect(await svc.signupHandleTaken(castId<Handle>("FRIEND"))).toBe(true);
    expect(await svc.signupHandleTaken(castId<Handle>("stranger"))).toBe(false);
  });

  test("answers true for a confusable of a held handle, false for a genuinely different one", async () => {
    await seedUser(db, { handle: castId<Handle>("host") });
    expect(await svc.signupHandleTaken(castId<Handle>("h0st"))).toBe(true);
    expect(await svc.signupHandleTaken(castId<Handle>("HOST"))).toBe(true);
    expect(await svc.signupHandleTaken(castId<Handle>("hosts"))).toBe(false);
  });
});
