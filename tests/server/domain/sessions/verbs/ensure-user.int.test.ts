import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeService } from "../_support.ts";

/** The phantom-id refusal message (hoisted — `useTopLevelRegex`). */
const NO_ROW_AFTER_INSERT = /no users row for handle/u;

let db: Db;
let svc: SessionsService;

beforeEach(async () => {
  db = await freshDb();
  ({ svc } = makeService(db));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sessions.ensureUser", () => {
  test("JIT-creates the row on first sight and returns its id", async () => {
    const id = await svc.ensureUser(castId<Handle>("alice"));
    const rows = await db.select().from(users).where(eq(users.id, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.handle).toBe("alice");
    expect(rows[0]?.externalId).toBeNull();
  });

  test("is idempotent — a second call returns the SAME id (no duplicate row)", async () => {
    const first = await svc.ensureUser(castId<Handle>("alice"));
    const second = await svc.ensureUser(castId<Handle>("alice"));
    expect(second).toBe(first);
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.handle, castId<Handle>("alice")));
    expect(rows).toHaveLength(1);
  });

  test("trims the handle before lookup/insert (no whitespace-forked duplicate)", async () => {
    const a = await svc.ensureUser(castId<Handle>("  alice  "));
    const b = await svc.ensureUser(castId<Handle>("alice"));
    expect(b).toBe(a);
  });

  test("provisions an OWNER_HANDLES handle as owner, others as user (D17)", async () => {
    vi.stubEnv("OWNER_HANDLES", "alice");
    const ownerId = await svc.ensureUser(castId<Handle>("alice"));
    const userId = await svc.ensureUser(castId<Handle>("bob"));
    const owner = (await db.select().from(users).where(eq(users.id, ownerId)))[0];
    const normal = (await db.select().from(users).where(eq(users.id, userId)))[0];
    expect(owner?.role).toBe("owner");
    expect(normal?.role).toBe("user");
  });

  // THE PHANTOM-ID ARM. `insertUser` is `onConflictDoNothing`, which swallows a collision on ANY unique
  // column — including `users_single_owner_unique` (the box already has its one `role='owner'` row, under a
  // DIFFERENT handle). The re-read then keys on `handle` and misses. Pre-fix the verb returned the id it had
  // MINTED, so boot's `seedOwner` carried an id that points at NO ROW into `createServices`, and
  // `principalFromRow` degraded the boot Principal to `role:"user"` — every owner-scoped seed then ran
  // against a non-existent non-owner principal. A fabricated id must be a loud failure, never a return value.
  test("REFUSES to return an id that points at no row when the insert is swallowed (single-owner UNIQUE)", async () => {
    vi.stubEnv("OWNER_HANDLES", "owner");
    await db.insert(users).values({ id: castId<UserId>("u_existing_owner"), handle: castId<Handle>("alex"), role: "owner" });

    await expect(svc.ensureUser(castId<Handle>("owner"))).rejects.toThrow(NO_ROW_AFTER_INSERT);

    // Nothing was written, and the pre-existing owner is untouched.
    expect(
      await db
        .select()
        .from(users)
        .where(eq(users.handle, castId<Handle>("owner"))),
    ).toHaveLength(0);
    expect(await db.select().from(users)).toHaveLength(1);
  });
});
