// domain/automation/persistence/rule-state — the `automation_rule_state` reads/writes (S5). One row per
// rule (rule-id natural PK, CASCADE); the WRITE slices guidance to `ANALYSIS_GUIDANCE_MAX` (the one bound
// the DDL CHECK mirrors) and the READ parses the state blob through the ruled version posture
// (`contract/analysis.ts::parseAnalysisState` — corrupt = unparseable ONLY, watermark preserved otherwise).

import { ANALYSIS_GUIDANCE_MAX } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import { automationRuleState, automationRules } from "@orb/db";
import type { AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, desc, eq, ne, sql } from "drizzle-orm";
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

/** THE MONOTONIC WATERMARK EXPRESSION — the one home of "the settled mark only ever moves FORWARD".
 *
 *  `blob` is the JSON the write wants to store; the returned expression is that JSON with
 *  `$.settledThroughSeq` replaced by `max(the mark already stored, the mark this write carries)`. SQLite
 *  evaluates `json_extract` against the row as it stands at UPDATE time, so the comparison is atomic — no
 *  read ahead of the write (`batchMany` bans that) and no lost update. `coalesce(…, 0)` covers a stored blob
 *  that predates the field. Both writers below build their `set.state` from this, which is what makes
 *  "no writer can drag the mark backwards" a property of the TABLE rather than of each call site.
 *  `blob` is a FRAGMENT so a caller can pass either a new JSON document or the row's own stored column. */
function monotonicStateWrite(blob: SQL, throughSeq: number): SQL {
  return sql`json_set(${blob}, '$.settledThroughSeq', max(coalesce(json_extract(${automationRuleState.state}, '$.settledThroughSeq'), 0), ${throughSeq}))`;
}

/** The analysis pass's END-OF-PASS write (#1543): the merged banks + the optional guidance wholesale, and
 *  the watermark MONOTONIC.
 *
 *  Separate from {@link upsertRuleState} — whose contract is a faithful round-trip of whatever blob it is
 *  given, and which a caller legitimately uses to write a LOWER mark — because the pass cannot use that
 *  contract safely. It reads `state.settledThroughSeq` once at pass start and writes it back at the end,
 *  and a host confirming a lore card in between advances the mark through {@link advanceSettledWatermark};
 *  a faithful blob write then REVERTED that confirm's coverage and the next pass re-distilled a span the
 *  host had already accepted — the second half of #1418's split, on the other side of the pass. The banks
 *  and guidance are still written wholesale (they ARE this pass's conclusions); only the mark is maxed. */
export async function commitPassState(
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
        state: monotonicStateWrite(sql`json(${JSON.stringify(args.state)})`, args.state.settledThroughSeq),
        updatedAt: args.nowMs,
        ...(guidance !== undefined ? { guidance } : {}),
      },
    });
}

/** Advance ONLY the settled watermark, as ONE statement (#1418 — the confirm path's half).
 *
 *  NOT a read-then-write. `select` → `{...state, settledThroughSeq: max(...)}` → `upsert` is lost-update by
 *  construction: a confirm and a live pass both read the same row, and whichever writes second reverts the
 *  other's arc/twist bank wholesale. The window is small and it is real, and there is no transaction to
 *  close it with — `batchMany` bans a read ahead of its writes. So the advance is expressed IN the write:
 *  SQLite evaluates `json_set`/`json_extract` against the row as it stands at UPDATE time, so the monotonic
 *  `max` is atomic and every other field of the blob is left byte-identical (the `chat-metadata-write`
 *  precedent). Monotonic on purpose: a confirm of a card raised before a later pass already covered the
 *  span must never drag the mark backwards.
 *
 *  The INSERT arm covers the row-absent case (a rule whose pass wrote no state) rather than no-oping the
 *  advance away — an UPDATE-only spelling would silently lose the coverage for exactly that rule. */
export async function advanceSettledWatermark(
  db: Db,
  args: { readonly ruleId: AutomationRuleId; readonly throughSeq: number; readonly nowMs: number },
): Promise<void> {
  const seeded: AnalysisState = { ...EMPTY_ANALYSIS_STATE, settledThroughSeq: args.throughSeq };
  await db
    .insert(automationRuleState)
    .values({ ruleId: args.ruleId, state: seeded as unknown as Record<string, unknown>, guidance: "", updatedAt: args.nowMs })
    .onConflictDoUpdate({
      target: automationRuleState.ruleId,
      set: {
        // The blob is the row's OWN stored state (nothing but the mark may move here), maxed by the shared
        // expression — so the confirm write and the pass write cannot disagree about what "advance" means.
        state: monotonicStateWrite(sql`${automationRuleState.state}`, args.throughSeq),
        updatedAt: args.nowMs,
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
