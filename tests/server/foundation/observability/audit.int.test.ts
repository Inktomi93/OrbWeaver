// foundation/observability/audit — the best-effort writer against a real libSQL :memory:. The success path
// writes one audit_logs row; the failure path NEVER throws to the caller (suppress → count → drop). The
// injected `createdAt` keeps it deterministic (no ambient clock).

import type { Db } from "@orb/db";
import { auditLogs } from "@orb/db";
import {
  getAuditFailureSnapshot,
  logAudit,
  resetAuditFailureCount,
} from "@orb/server/foundation/observability";
import { describe } from "vitest";
import { freshDb } from "../../../support/db";
import { expect, test } from "../../../support/fixtures";

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
    const brokenDb = {
      insert: () => {
        throw new Error("boom");
      },
    } as unknown as Db;

    await expect(
      logAudit(brokenDb, { actorUserId: null, action: "will.fail" }, FAIL_STAMP),
    ).resolves.toBeUndefined();

    const snap = getAuditFailureSnapshot();
    expect(snap.count).toBe(1);
    expect(snap.firstFailureAt).toBe(FAIL_STAMP);
    expect(snap.lastFailureAt).toBe(FAIL_STAMP);
  });
});
