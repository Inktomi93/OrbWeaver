// foundation/observability/debug/inspect/automation-fires — the AUTOMATION FIRE LOG probe: the durable
// `automation_fires` ledger (every dispatch terminal — fired / predicate_* / budget_refused / depth_refused /
// action_error / authority_refused / test_run — with its per-arm `detail`, trigger, cascade depth, chat and
// rule), read principal-BLIND across the whole deployment, newest-first, behind the debug gate. This is the
// "why didn't my rule fire" answer for an OPERATOR: the owner-scoped `automation.listFires` verb answers it
// per rule for the rule's author; a harness driving a live stage needs the whole log with no principal in
// the path (the `chatListSummaries` / `characterPolicySweep` posture — `@owner-scope-ok`, D20).
//
// The analysis arm's own diagnostic lines already flow through the root logger into the central ring
// (`/api/_debug/logs`); this probe is the DURABLE half of that picture. Reads @orb/db DOWN (no port). The
// storage-only `reserved` reservation (an in-flight budget hold, finalized or released by the dispatcher) is
// excluded exactly as every domain read excludes it — it is not a terminal and must never read as one.

import type { Db } from "@orb/db";
import { automationFires } from "@orb/db";
import { and, desc, eq, ne } from "drizzle-orm";

import type { AutomationFireFilter, AutomationFireRow } from "../../contract/inspect.ts";

export type { AutomationFireFilter, AutomationFireRow } from "../../contract/inspect.ts";

/** The recent fire log, newest-first, `reserved` excluded, narrowed by `chatId` and/or `ruleId` when given. */
export async function automationFireRows(db: Db, filter: AutomationFireFilter): Promise<AutomationFireRow[]> {
  const rows = await db
    .select()
    .from(automationFires)
    .where(
      and(
        ne(automationFires.outcome, "reserved"),
        ...(filter.chatId === undefined ? [] : [eq(automationFires.chatId, filter.chatId)]),
        ...(filter.ruleId === undefined ? [] : [eq(automationFires.ruleId, filter.ruleId)]),
      ),
    )
    .orderBy(desc(automationFires.firedAt))
    .limit(filter.limit);
  return rows.map((row) => {
    if (row.outcome === "reserved") {
      // Unreachable by the predicate above; stated so the projection can never launder an in-flight hold
      // into a terminal (the domain's `toFireView` posture).
      throw new Error("debug: an automation fire reservation reached the fire-log projection");
    }
    return {
      id: row.id,
      ruleId: row.ruleId,
      chatId: row.chatId,
      triggerType: row.triggerType,
      outcome: row.outcome,
      detail: row.detail ?? null,
      automationDepth: row.automationDepth,
      firedAt: row.firedAt,
    };
  });
}
