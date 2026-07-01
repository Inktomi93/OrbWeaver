import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { createSessionsService } from "@orb/server/domain/sessions";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { createFrozenClock } from "../../../../support/clock";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";

const PEPPER = "test-session-secret-at-least-32-chars-long";

let db: Db;
let svc: SessionsService;
const clock = createFrozenClock();

beforeEach(async () => {
  db = await freshDb();
  svc = createSessionsService({ db, now: clock.now, sessionSecret: PEPPER });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sessions.ensureUser", () => {
  test("JIT-creates the row on first sight and returns its id", async () => {
    const id = await svc.ensureUser("alice");
    const rows = await db.select().from(users).where(eq(users.id, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.handle).toBe("alice");
    expect(rows[0]?.externalId).toBeNull();
  });

  test("is idempotent — a second call returns the SAME id (no duplicate row)", async () => {
    const first = await svc.ensureUser("alice");
    const second = await svc.ensureUser("alice");
    expect(second).toBe(first);
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.handle, castId<Handle>("alice")));
    expect(rows).toHaveLength(1);
  });

  test("trims the handle before lookup/insert (no whitespace-forked duplicate)", async () => {
    const a = await svc.ensureUser("  alice  ");
    const b = await svc.ensureUser("alice");
    expect(b).toBe(a);
  });

  test("provisions an OWNER_HANDLES handle as owner, others as user (D17)", async () => {
    vi.stubEnv("OWNER_HANDLES", "alice");
    const ownerId = await svc.ensureUser("alice");
    const userId = await svc.ensureUser("bob");
    const owner = (await db.select().from(users).where(eq(users.id, ownerId)))[0];
    const normal = (await db.select().from(users).where(eq(users.id, userId)))[0];
    expect(owner?.role).toBe("owner");
    expect(normal?.role).toBe("user");
  });
});
