// domain/chat/engine/recover-narrative — the PROSE-LESS COMPLETION recovery pass: RECOVER, do not discard.
//
// THE DEFECT. A folded rpg turn attaches the extraction tools with `tool_choice:"auto"` (D112 TERMINAL-tools)
// and, with reasoning ON, a hosted model regularly concludes that emitting those calls DISCHARGES the beat:
// it thinks, it calls the tools, it writes no prose. `assertGeneratedContent` then refuses the turn — correctly,
// an empty variant is not a reply — and the whole turn is discarded, the model's good state writes with it.
// What the operator sees is the reasoning stream rendering and then stopping dead, early, with "the model
// returned no text". The stall is the length of the REASONING PHASE, not a timeout (`backends/kit/idle-timeout.ts` is 180s and resets on
// every received chunk — the idle-stall theory was falsified against source before this was built).
//
// THE RECOVERY. The tool calls are the expensive, hard-to-reproduce half of the turn and they are ALREADY
// GOOD. So instead of throwing the turn away, re-run it ONCE with:
//   • the terminal tools REMOVED — they already fired. Re-attaching them invites a second discharge, and a
//     second set of calls would either double-apply the beat's state or have to be dropped on the floor.
//   • the recovery ask appended as the trailing user row (`chat.recovery.narrativeContinuation`, a PROSE-1
//     slot — this is a nudge, and nudges are host-editable data, never a server-authored literal).
// The prose comes from pass 2; `terminalToolCalls` is carried forward from pass 1, so the state writes the
// engine hands to `fireRpgTurnCompleted` are the ones the model actually made about the beat it narrated.
//
// WHY A SECOND WIRE CALL AND NOT A SALVAGE. There is no prose anywhere to salvage — the completion contains
// reasoning and tool calls and nothing else. The narrative has to be generated. This is the same shape as the
// runner's own mandatory-reasoning strip-and-replay-once fallback: one bounded retry with the offending
// element removed, never a loop.
//
// ONE ATTEMPT, BY CONSTRUCTION. The recovery pass runs with no terminal tools, so it cannot itself produce the
// tool-calls-and-no-prose shape that triggers recovery; there is no recursion to bound. If it ALSO comes back
// empty, the turn fails as it did before — with an error that now names which of the two passes died.
//
// NOT A GENERAL EMPTY-COMPLETION RETRY. The gate is narrow on purpose: prose-less AND terminal calls landed.
// A model that returned nothing at all (no prose, no calls) has told us nothing to build on and is a provider
// fault, not a discharged turn; retrying it is how a dead upstream becomes double the spend.

import { resolveProseText } from "@orb/contracts/prose";
import type { ChatId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import { runTurnPipeline } from "./pipeline.ts";

// DERIVED from the function, never re-declared (`no-inline-types`: an exported type belongs in `contract/`,
// and these are pipeline-internal shapes). `engine.ts` already names the result this way throughout, so this
// is the file's established spelling rather than a second one.
type RunTurnPipelineArgs = Parameters<typeof runTurnPipeline>[0];
type TurnPipelineResult = Awaited<ReturnType<typeof runTurnPipeline>>;

/** Did this completion produce tool calls and no narrative? The RECOVERABLE class, and the only one.
 *
 *  `terminalToolCalls` is the folded path's channel and is three-valued by design: `null` = the tools never
 *  rode (no channel — nothing to recover FROM), `[]` = they rode and the model called nothing (a quiet beat,
 *  and a genuinely empty turn), a non-empty array = calls landed. Only the third is recoverable.
 *
 *  Reads `terminalToolCalls`, NOT `toolRecords`: a folded turn deliberately lands no `ToolCallRecord` (the
 *  character turn is tool-less on the variant), so `toolRecords` is 0 here by construction and would gate
 *  recovery off on exactly the turns that need it. */
function isRecoverableProselessTurn(result: TurnPipelineResult): boolean {
  return result.content.trim().length === 0 && (result.terminalToolCalls?.length ?? 0) > 0;
}

/**
 * The turn's FINAL result: the first pass, or — when it is the recoverable prose-less class — a recovery pass
 * re-run tool-less for the narrative, merged with pass 1's tool calls.
 *
 * TOTAL by design: the caller hands over the first pass and receives the result to persist, with no branch of
 * its own. `executeTurn` is at the cognitive-complexity ceiling and the recovery decision is this module's to
 * own, so the gate lives here rather than as an `if` up there.
 *
 * On every non-recoverable turn this returns `first` UNTOUCHED, having done nothing — no wire call, no log.
 * When recovery runs but also comes back empty, it likewise returns `first`, so the caller's empty-generation
 * guard fires exactly as it would have and reports the ORIGINAL completion's reasons.
 *
 * The recovered result is pass 2's in every respect a reader cares about — content, reasoning, economics, the
 * request that produced it — EXCEPT `terminalToolCalls`, which stays pass 1's. That single carry-over is the
 * whole point of the feature, and it is why this merges rather than simply returning pass 2.
 */
export async function resolveTurnNarrative(args: {
  readonly chatId: ChatId;
  /** THIS turn's pipeline arguments — re-used verbatim but for the two overrides below. */
  readonly pipelineArgs: RunTurnPipelineArgs;
  /** The completed first pass. */
  readonly first: TurnPipelineResult;
  /** Records the recovery pass's own outcome (the wire-capture ring), so a doubled spend is never a mystery. */
  readonly onRecoveryOutcome: (result: TurnPipelineResult) => void;
}): Promise<TurnPipelineResult> {
  const { chatId, pipelineArgs, first, onRecoveryOutcome } = args;
  if (!isRecoverableProselessTurn(first)) {
    return first;
  }
  const ask = resolveProseText("chat.recovery.narrativeContinuation", pipelineArgs.assembleContext.prose ?? {});
  const log = getLog();
  log.warn(
    {
      event: "chat.generation.recovering",
      chatId,
      finishReason: first.economics?.finishReason ?? null,
      terminalToolCalls: first.terminalToolCalls?.length ?? 0,
      reasoningChars: first.reasoning?.length ?? 0,
    },
    "chat: the model produced tool calls and no prose — re-running the turn for its narrative (tools removed)",
  );

  const recovery = await runTurnPipeline({
    ...pipelineArgs,
    // The tools already fired on pass 1. Not `[]` — `undefined` is the pipeline's "no terminal channel", and
    // `[]` would still take the attach path.
    terminalTools: undefined,
    // A regen/continue turn already carries a synthetic trailing user row; the ask is APPENDED to it rather
    // than replacing it, or the recovery pass would silently drop the instruction that shaped the turn.
    appendUserTurn: appendAsk(pipelineArgs.appendUserTurn, ask),
  });

  onRecoveryOutcome(recovery);

  if (recovery.content.trim().length === 0) {
    log.warn(
      {
        event: "chat.generation.recoveryFailed",
        chatId,
        finishReason: recovery.economics?.finishReason ?? null,
        reasoningChars: recovery.reasoning?.length ?? 0,
      },
      "chat: the recovery pass produced no prose either — turn REFUSED",
    );
    // The FIRST pass, deliberately: the caller's guard then reports the reasons of the completion that
    // actually discharged into tool calls, which is the diagnosable one. Pass 2 is the symptom, pass 1 is why.
    return first;
  }

  log.info(
    {
      event: "chat.generation.recovered",
      chatId,
      contentChars: recovery.content.length,
      terminalToolCalls: first.terminalToolCalls?.length ?? 0,
    },
    "chat: recovered a prose-less turn — the narrative is pass 2's, the state writes are pass 1's",
  );

  return { ...recovery, terminalToolCalls: first.terminalToolCalls };
}

/** The trailing user row for the recovery pass: the turn's own synthetic row (if any) then the ask. */
function appendAsk(existing: string | null | undefined, ask: string): string {
  const prior = existing?.trim() ?? "";
  return prior.length > 0 ? `${prior}\n\n${ask}` : ask;
}
