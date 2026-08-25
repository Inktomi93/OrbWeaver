// domain/automation/persistence/rule-state — the `automation_rule_state` reads/writes (S5). One row per
// rule (rule-id natural PK, CASCADE); the WRITE slices guidance to `ANALYSIS_GUIDANCE_MAX` (the one bound
// the DDL CHECK mirrors) and the READ parses the state blob through the ruled version posture
// (`contract/analysis.ts::parseAnalysisState` — corrupt = unparseable ONLY, watermark preserved otherwise).

import { ANALYSIS_GUIDANCE_MAX } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import { automationRuleState, automationRules } from "@orb/db";
import type { AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import { and, desc, eq, ne } from "drizzle-orm";
import type { AnalysisState, RuleStateRead } from "../contract/analysis.ts";
import { EMPTY_ANALYSIS_STATE, parseAnalysisState } from "../contract/analysis.ts";

const LIMIT_ONE = 1;

/** The absent-row read — a first pass is a cold start, not an error. */
const EMPTY_RULE_STATE: RuleStateRead = { state: EMPTY_ANALYSIS_STATE, guidance: "" };

export async function selectRuleState(db: Db, ruleId: AutomationRuleId): Promise<RuleStateRead> {
  const rows = await db.select().from(automationRuleState).where(eq(automationRuleState.ruleId, ruleId)).limit(LIMIT_ONE);
  const row = rows[0];
  if (row === undefined) {
    return EMPTY_RULE_STATE;
  }
  return { state: parseAnalysisState(row.state), guidance: row.guidance };
}

/** Upsert a rule's state row. `guidance` is SLICED here — the ONE write boundary the cap names, so the
 *  DDL CHECK behind it can never bite in app flow (belt + suspenders, the global_variables pattern).
 *  `undefined` guidance = leave the stored guidance untouched (a durable-write confirm advances the
 *  watermark without re-deciding the steer). */
export async function upsertRuleState(
  db: Db,
  args: { readonly ruleId: AutomationRuleId; readonly state: AnalysisState; readonly guidance?: string | undefined; readonly nowMs: number },
): Promise<void> {
  const guidance = args.guidance === undefined ? undefined : args.guidance.slice(0, ANALYSIS_GUIDANCE_MAX);
  await db
    .insert(automationRuleState)
    .values({ ruleId: args.ruleId, state: args.state as unknown as Record<string, unknown>, guidance: guidance ?? "", updatedAt: args.nowMs })
    .onConflictDoUpdate({
      target: automationRuleState.ruleId,
      set: {
        state: args.state as unknown as Record<string, unknown>,
        updatedAt: args.nowMs,
        ...(guidance !== undefined ? { guidance } : {}),
      },
    });
}

/** The S2 teaching read: the newest non-empty guidance among a chat's ENABLED analysis rules whose AUTHOR
 *  is the turn's resolved host. The `ownerId = runAsUserId` predicate IS the "author still holds host"
 *  check by identity — `runAsUserId` is the turn's frozen resolved host (D19), so a handoff makes this
 *  read yield nothing, fail-safe in both directions (§3-S5.3). One row: the guidance channel is ONE
 *  narrator instruction (the legacy director's contract), so multiple analysis rules resolve to the most
 *  recently updated voice rather than a chorus. */
export async function selectChatGuidance(db: Db, chatId: ChatId, runAsUserId: UserId): Promise<string | null> {
  const rows = await db
    .select({ guidance: automationRuleState.guidance })
    .from(automationRuleState)
    .innerJoin(
      automationRules,
      // The rule join carries the three gates: this chat, still enabled, authored by the turn's host.
      and(
        eq(automationRules.id, automationRuleState.ruleId),
        eq(automationRules.chatId, chatId),
        eq(automationRules.enabled, true),
        eq(automationRules.ownerId, runAsUserId),
      ),
    )
    .where(ne(automationRuleState.guidance, ""))
    .orderBy(desc(automationRuleState.updatedAt))
    .limit(LIMIT_ONE);
  return rows[0]?.guidance ?? null;
}
