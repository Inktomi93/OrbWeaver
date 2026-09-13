// foundation/observability/audit — the best-effort writer against a real libSQL :memory:. The success path
// writes one audit_logs row; the failure path NEVER throws to the caller (suppress → count → drop). The
// injected `createdAt` keeps it deterministic (no ambient clock).

import type { Db } from "@orb/db";
import { auditLogs } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import type { AuditLogId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import {
  buildAuditStatement,
  buildAuditStatementIfPrecedingWrote,
  getAuditFailureSnapshot,
  logAudit,
  resetAuditFailureCount,
} from "@orb/server/foundation/observability";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";

const STAMP = 1_700_000_000_000; // a fixed epoch-ms (determinism — never the wall clock)
const FAIL_STAMP = 1_700_000_999_999;

describe("logAudit — success path", () => {
  test("writes one audit_logs row with the injected timestamp + the entry fields", async () => {
    const db = await freshDb();
    await logAudit(
      db,
      {
        actorUserId: null,
        action: "test.action",
        entityType: "chat",
        entityId: "chat_demo",
        metadata: { note: "hi" },
      },
      STAMP,
    );
    const rows = await db.select().from(auditLogs);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.action).toBe("test.action");
    expect(row?.actorUserId).toBeNull();
    expect(row?.entityType).toBe("chat");
    expect(row?.entityId).toBe("chat_demo");
    expect(row?.createdAt).toBe(STAMP);
    expect(row?.metadata).toEqual({ note: "hi" });
  });
});

describe("logAudit — failure path (never breaks the primary channel)", () => {
  test("a db.insert throw is suppressed (no throw) and the failure window increments", async () => {
    resetAuditFailureCount();
    // A db stub whose insert throws — the audit channel must swallow it.
    // @orb-waive no-test-fabrication(unknown): minimal throwing Db double — only `insert` is invoked by logAudit's failure path. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const brokenDb = {
      insert: () => {
        throw new Error("boom");
      },
    } as unknown as Db;

    await expect(logAudit(brokenDb, { actorUserId: null, action: "will.fail" }, FAIL_STAMP)).resolves.toBeUndefined();

    const snap = getAuditFailureSnapshot();
    expect(snap.count).toBe(1);
    expect(snap.firstFailureAt).toBe(FAIL_STAMP);
    expect(snap.lastFailureAt).toBe(FAIL_STAMP);
  });
});

// #1691 — the ATOMIC seam. `buildAuditStatementIfPrecedingWrote` projects its columns POSITIONALLY through
// `insert().select()`, so the row it writes is pinned against the row the ordinary builder writes: a column
// added to `audit_logs` (or reordered) must not be able to silently mis-bind this one.
describe("buildAuditStatementIfPrecedingWrote — the batch-riding, changes()-guarded insert", () => {
  const entry = {
    actorUserId: null,
    action: "admin.setRole",
    entityType: "user",
    entityId: "user_t",
    metadata: { role: "admin", nested: { deep: true } },
  };

  /** A one-row write to stand in for a verb's privileged statement (`changes()` = 1 after it). */
  const precedingWrite = (db: Db, id: string): BatchStmt =>
    batchStmt(db.insert(auditLogs).values({ id: castId<AuditLogId>(id), action: "preceding.write", createdAt: STAMP }));

  test("writes the SAME row the unguarded builder writes when the preceding statement changed a row", async () => {
    const db = await freshDb();
    await db.batch(batchMany([precedingWrite(db, "audit_p1"), buildAuditStatementIfPrecedingWrote(db, entry, STAMP)]));
    await db.batch(batchMany([precedingWrite(db, "audit_p2"), buildAuditStatement(db, entry, STAMP)]));

    const rows = await db.select().from(auditLogs).where(eq(auditLogs.action, "admin.setRole"));
    expect(rows).toHaveLength(2);
    const [guarded, plain] = rows;
    // Everything but the minted id must match — the json round-trip of `metadata` included.
    expect({ ...guarded, id: "" }).toEqual({ ...plain, id: "" });
    expect(guarded?.metadata).toEqual(entry.metadata);
  });

  test("writes NOTHING when the preceding statement changed no row", async () => {
    const db = await freshDb();
    await db.batch(
      batchMany([
        // A conditional write that matches nothing — the shape of a lost owner-immutability race.
        db
          .update(auditLogs)
          .set({ action: "x" })
          .where(eq(auditLogs.id, castId<AuditLogId>("audit_absent")))
          .returning({ id: auditLogs.id }),
        buildAuditStatementIfPrecedingWrote(db, entry, STAMP),
      ]),
    );
    expect(await db.select().from(auditLogs)).toHaveLength(0);
  });
});
