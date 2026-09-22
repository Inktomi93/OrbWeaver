// domain/automation/substrate/run-now — the verbs↔ENGINE mediator for R7 (`runRuleNow`), for the S4
// invitation's confirm (which IS an R7 run), and for the S4 CONFIRM class's stashed CONTINUATION (#1553,
// OWNER RULING: STASH — the arms behind a raised confirmation). SUBSTRATE mediates because `engine/` is a
// named subsystem a verb may not import directly (`domain-substrate-mediates-subsystems`) — the same seam
// `handle-event.ts` is for the bus side.
//
// WHAT A MANUAL RUN IS: ONE fresh dispatch of ONE rule at cascade depth 0, through the same sequence a bus
// fire runs, minus the two WHETHER-TO-FIRE-BY-ITSELF gates (the fire-rate cap and the CEL predicate) and
// minus nothing else. `engine/dispatch.ts::runGates` states that line, why each skip is load-bearing rather
// than convenient, and what stays: the cascade-depth cap, the author's standing host authority, and every
// belt inside the executed arm's own pipeline (including imagery's gates). The room's host funds any turn the
// arm starts. The fire row carries `runNow` + the invoking host, so the log never reads a forced run
// as a condition-met one.
//
// THE FACT IS SYNTHESIZED from the rule's own trigger (`substrate/dry-run.ts::synthFact` — the same
// synthesis `testRule` uses when the host supplies no sample), because there is no event: a host pressing
// "run it now" IS the event. This is also the second reason the predicate cannot gate a manual run: a
// message-scoped predicate (`has(event.message) && …`) is FALSE by construction against a synthesized fact,
// so every "Run now" on such a rule would answer `predicate_false` no matter what the room looked like.
// The arms still render against a REAL env (chat vars, the author's globals, the injected clock).

import type { AutomationAction, AutomationRunOutcome, AutomationTrigger } from "@orb/contracts/automation";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { ArmsResult, DispatchFrame, ResolvedTrigger, RuleRow } from "../contract/ops.ts";
import type { AutomationContext } from "../contract/service.ts";
import { runArms, runDispatch } from "../engine/dispatch.ts";
import { synthFact } from "./dry-run.ts";
import { automationChatLaneKey, automationDomainLaneKey, runInLane } from "./serial-lanes.ts";

export type { ArmsResult } from "../contract/ops.ts";

/** The depth a host-initiated run starts at: 0, the human plane (a manual run is not a cascade step). */
const MANUAL_DEPTH = 0;

/** Run ONE rule now. `null` = the rule reached NO terminal, which for a chat-scoped enabled rule has exactly
 *  one cause: it is a `transform_draft` rule, which registers into the turn pipeline and never dispatches.
 *  The caller turns that into a typed refusal rather than reporting a fire that did not happen. */
export function dispatchRuleNow(ctx: AutomationContext, rule: RuleRow, chatId: ChatId | null, manualBy: UserId): Promise<AutomationRunOutcome | null> {
  // #1565 — A MANUAL RUN TAKES THE SAME LANE THE BUS DOOR TAKES. It is a full `runDispatch` over the chat's
  // shared variable env, so a host pressing "Run now" while a bus event is mid-dispatch read the same
  // snapshot, computed the same increment and wrote the same value — the exact interleave #1423 closed one
  // door over. The key is derived through `automationChatLaneKey`/`automationDomainLaneKey`, never
  // re-spelled: two entries on
  // lanes that only LOOK alike is the same defect wearing a typo.
  //
  // NO RE-ENTRANCY, and it is structural rather than lucky (receipts, 2026-09-05): `dispatchRuleNow` has
  // exactly two callers — `verbs/run-rule-now.ts:27` (the R7 tRPC verb) and `verbs/confirm-suggestion.ts:300`
  // (the INVITATION branch) — and neither runs inside a lane. The confirm verb's other execution branch (the
  // stashed arm) is EXCLUSIVE with the invitation branch and takes this lane itself, so the two can never
  // nest. Nothing reachable from an arm re-enters here either: the bus door's own entries are all
  // `superviseDetached` roots (`watcher/start-automation-watcher.ts:17,22`, `entry/lifecycle.ts:480`), so an
  // arm that generates chat events (`trigger_turn` → `requestTurn`) never AWAITS the resulting `handleEvent`.
  return runInLane(chatId === null ? automationDomainLaneKey(rule.ownerId) : automationChatLaneKey(chatId), () => dispatchNow(ctx, rule, chatId, manualBy));
}

async function dispatchNow(ctx: AutomationContext, rule: RuleRow, chatId: ChatId | null, manualBy: UserId): Promise<AutomationRunOutcome | null> {
  const trigger = { bus: rule.triggerBus, type: rule.triggerType } as AutomationTrigger;
  const resolved: ResolvedTrigger = { fact: synthFact(trigger, chatId), automationDepth: MANUAL_DEPTH };
  const summary = await runDispatch(ctx, [rule], resolved, { manualBy });
  if (summary.anyDisabled) {
    // `refresh`, not `reload` (#1564, the #1431 sweep's residue): the auto-disable this reconciles is ALREADY
    // COMMITTED, so a failed rebuild must latch stale and let the front door retry — never reject a manual run
    // whose write landed, and never leave a stale index with nobody scheduled to rebuild it.
    await ctx.enabled.refresh();
  }
  return summary.outcomes[0] ?? null;
}

/** Run a stashed confirm-first arm's CONTINUATION (#1553, OWNER RULING: STASH) — every arm that sat behind
 *  it in the rule's own action list at fire time, against the SAME frame the confirmed arm just ran in
 *  (arms mutate a shared env; order is semantics, exactly as a fresh dispatch's `runArms` call already
 *  states). `verbs/confirm-suggestion.ts::executeStashedArm` is the one caller, ALREADY inside the chat's
 *  own serial lane (`automationChatLaneKey`) by the time it calls this — a continuation is not a second
 *  dispatch entry point, it is the tail of the SAME confirmed act, so it takes no lane of its own. An empty
 *  continuation (the stashed arm was the rule's last) is a legal no-op call: `runArms` returns the
 *  all-succeeded result on an empty slice without touching `ctx.runArm` at all. */
export function runStashedContinuation(ctx: AutomationContext, continuation: readonly AutomationAction[], frame: DispatchFrame): Promise<ArmsResult> {
  return runArms(ctx, continuation, frame);
}
