// domain/automation/substrate/run-now — the verbs↔ENGINE mediator for R7 (`runRuleNow`) and for the S4
// invitation's confirm, which IS an R7 run. SUBSTRATE mediates because `engine/` is a named subsystem a verb
// may not import directly (`domain-substrate-mediates-subsystems`) — the same seam `handle-event.ts` is for
// the bus side.
//
// WHAT A MANUAL RUN IS: ONE fresh dispatch of ONE rule at cascade depth 0, through the same sequence a bus
// fire runs, minus the two WHETHER-TO-FIRE-BY-ITSELF gates (the fire-rate cap and the CEL predicate) and
// minus nothing else. `engine/dispatch.ts::runGates` states that line, why each skip is load-bearing rather
// than convenient, and what stays: the cascade-depth cap, the author's standing host authority, and every
// belt inside the executed arm's own pipeline (D17 by-proxy consent, the turn engine's per-member budget,
// imagery's gates). The fire row carries `runNow` + the invoking host, so the log never reads a forced run
// as a condition-met one.
//
// THE FACT IS SYNTHESIZED from the rule's own trigger (`substrate/dry-run.ts::synthFact` — the same
// synthesis `testRule` uses when the host supplies no sample), because there is no event: a host pressing
// "run it now" IS the event. This is also the second reason the predicate cannot gate a manual run: a
// message-scoped predicate (`has(event.message) && …`) is FALSE by construction against a synthesized fact,
// so every "Run now" on such a rule would answer `predicate_false` no matter what the room looked like.
// The arms still render against a REAL env (chat vars, the author's globals, the injected clock).

import type { AutomationRunOutcome, AutomationTrigger } from "@orb/contracts/automation";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { ResolvedTrigger, RuleRow } from "../contract/ops.ts";
import type { AutomationContext } from "../contract/service.ts";
import { runDispatch } from "../engine/dispatch.ts";
import { synthFact } from "./dry-run.ts";

/** The depth a host-initiated run starts at: 0, the human plane (a manual run is not a cascade step). */
const MANUAL_DEPTH = 0;

/** Run ONE rule now. `null` = the rule reached NO terminal, which for a chat-scoped enabled rule has exactly
 *  one cause: it is a `transform_draft` rule, which registers into the turn pipeline and never dispatches.
 *  The caller turns that into a typed refusal rather than reporting a fire that did not happen. */
export async function dispatchRuleNow(ctx: AutomationContext, rule: RuleRow, chatId: ChatId | null, manualBy: UserId): Promise<AutomationRunOutcome | null> {
  const trigger = { bus: rule.triggerBus, type: rule.triggerType } as AutomationTrigger;
  const resolved: ResolvedTrigger = { fact: synthFact(trigger, chatId), automationDepth: MANUAL_DEPTH };
  const summary = await runDispatch(ctx, [rule], resolved, { manualBy });
  if (summary.anyDisabled) {
    await ctx.enabled.reload();
  }
  return summary.outcomes[0] ?? null;
}
