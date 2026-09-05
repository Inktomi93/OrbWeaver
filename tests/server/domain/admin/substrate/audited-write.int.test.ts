// substrate: commitAuditedWrite (#1691) — the seam that makes a privileged admin write and its forensic row
// ONE atomic fact. The four properties pinned here are the ones every calling verb inherits, so they are
// asserted once at the seam and only exercised end-to-end per verb:
//   1. all-or-nothing — the write, its audit row and the DB tails commit together;
//   2. a rejecting TAIL takes the privileged write down with it (the reset-password failure mode);
//   3. a rejecting AUDIT does too (the failure mode `logAudit`'s swallow hid in production);
//   4. the audit row is a BICONDITIONAL with the write — a conditional write that matched nothing leaves no
//      row claiming it happened, and a tail that legitimately changes 0 rows never suppresses the audit
//      (that second half is what the statement ORDER buys, and reordering the batch fails it).

import { users } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, ne } from "drizzle-orm";
import { describe } from "vitest";
import { commitAuditedWrite } from "../../../../../packages/server/src/domain/admin/substrate/audited-write.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { auditActions, liveSessionIds, makeHarness, seedLiveSession, seedUser, withBrokenAudit } from "../_support.ts";

const AT = 1_750_000_000_000;

const entry = { actorUserId: null, action: "admin.probe", entityType: "user", entityId: "user_t" } as const;

describe("commitAuditedWrite", () => {
  test("commits the write, its audit row and a DB tail together, returning the write's RETURNING rows", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const target = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t") });
    await seedLiveSession(db, target);

    const rows = await commitAuditedWrite(h.ctx, {
      write: db.update(users).set({ role: "admin", updatedAt: AT }).where(eq(users.id, target)).returning({ id: users.id }),
      entry,
      at: AT,
      tails: [h.ctx.sessions.revokeAllForUserStatement(target, AT)],
    });

    expect(rows).toEqual([{ id: target }]);
    expect((await db.select().from(users).where(eq(users.id, target)))[0]?.role).toBe("admin");
    expect(await liveSessionIds(db, target)).toHaveLength(0);
    expect(await auditActions(db)).toEqual(["admin.probe"]);
  });

  test("a rejecting TAIL rolls the privileged write and the audit row back", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const target = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t") });
    // An FK-violating tail: re-point the target's live session at a user that does not exist.
    const live = await seedLiveSession(db, target);
    const brokenTail: BatchStmt = h.ctx.db
      .update(users)
      .set({ ownerUserId: castId<UserId>("user_no_such_owner") })
      .where(eq(users.id, target));

    await expect(
      commitAuditedWrite(h.ctx, {
        write: db.update(users).set({ role: "admin", updatedAt: AT }).where(eq(users.id, target)).returning({ id: users.id }),
        entry,
        at: AT,
        tails: [brokenTail],
      }),
    ).rejects.toThrow();

    expect((await db.select().from(users).where(eq(users.id, target)))[0]?.role).toBe("user");
    expect(await liveSessionIds(db, target)).toEqual([live]);
    expect(await auditActions(db)).toHaveLength(0);
  });

  test("a rejecting AUDIT rolls the privileged write back", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const target = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t") });

    await expect(
      commitAuditedWrite(withBrokenAudit(h.ctx, db), {
        write: db.update(users).set({ role: "admin", updatedAt: AT }).where(eq(users.id, target)).returning({ id: users.id }),
        entry,
        at: AT,
      }),
    ).rejects.toThrow();

    expect((await db.select().from(users).where(eq(users.id, target)))[0]?.role).toBe("user");
    expect(await auditActions(db)).toHaveLength(0);
  });

  test("a conditional write that matched nothing returns [] and writes NO audit row", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const owner = await seedUser(db, { id: "user_own", role: "owner", handle: castId<Handle>("own") });

    // The owner-immutability race arm: `WHERE id = ? AND role <> 'owner'` matches nothing.
    const rows = await commitAuditedWrite(h.ctx, {
      write: db
        .update(users)
        .set({ role: "user", updatedAt: AT })
        .where(and(eq(users.id, owner), ne(users.role, "owner")))
        .returning({ id: users.id }),
      entry,
      at: AT,
    });

    expect(rows).toEqual([]);
    expect((await db.select().from(users).where(eq(users.id, owner)))[0]?.role).toBe("owner");
    expect(await auditActions(db)).toHaveLength(0);
  });

  test("a TAIL that legitimately changes nothing does not suppress the audit row (the statement order)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const target = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t") });

    // No live sessions: the kick tail matches 0 rows, exactly as it does for a signed-out target.
    const rows = await commitAuditedWrite(h.ctx, {
      write: db.update(users).set({ role: "admin", updatedAt: AT }).where(eq(users.id, target)).returning({ id: users.id }),
      entry,
      at: AT,
      tails: [h.ctx.sessions.revokeAllForUserStatement(target, AT)],
    });

    expect(rows).toEqual([{ id: target }]);
    expect(await auditActions(db)).toEqual(["admin.probe"]);
  });
});
