// domain/chat/engine/recover-narrative — the PROSE-LESS COMPLETION recovery pass (dogfood EMPTYGEN-REASONING,
// owner ruling 2026-08-07: RECOVER, do not discard).
//
// THE DEFECT. A folded rpg turn attaches the extraction tools with `tool_choice:"auto"` (D112 TERMINAL-tools)
// and, with reasoning ON, a hosted model regularly concludes that emitting those calls DISCHARGES the beat:
// it thinks, it calls the tools, it writes no prose. `assertGeneratedContent` then refuses the turn — correctly,
// an empty variant is not a reply — and the whole turn is discarded, the model's good state writes with it.
// What the operator sees is the reasoning stream rendering and then stopping dead, early, with "the model
// returned no text". Measured live at 14.9s / 15.8s / 30.6s on both Gemini and Sonnet-5 skins; those durations
// are the length of the REASONING PHASE, not a timeout (`backends/kit/idle-timeout.ts` is 180s and resets on
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
import type { RunTurnPipelineArgs, TurnPipelineResult } from "./pipeline.ts";
import { runTurnPipeline } from "./pipeline.ts";

/** Did this completion produce tool calls and no narrative? The RECOVERABLE class, and the only one.
 *
 *  `terminalToolCalls` is the folded path's channel and is three-valued by design: `null` = the tools never
 *  rode (no channel — nothing to recover FROM), `[]` = they rode and the model called nothing (a quiet beat,
 *  and a genuinely empty turn), a non-empty array = calls landed. Only the third is recoverable.
 *
 *  Reads `terminalToolCalls`, NOT `toolRecords`: a folded turn deliberately lands no `ToolCallRecord` (the
 *  character turn is tool-less on the variant), so `toolRecords` is 0 here by construction and would gate
 *  recovery off on exactly the turns that need it. */
export function isRecoverableProselessTurn(result: TurnPipelineResult): boolean {
  return result.content.trim().length === 0 && (result.terminalToolCalls?.length ?? 0) > 0;
}

/**
 * Re-run this turn for its narrative, tools removed. Returns the merged result on success, or `null` when the
 * recovery pass produced no prose either (the caller then fails the turn exactly as it would have).
 *
 * The returned result is pass 2's in every respect a reader cares about — content, reasoning, economics, the
 * request that produced it — EXCEPT `terminalToolCalls`, which stays pass 1's. That single carry-over is the
 * whole point of the feature, and it is why this merges rather than simply returning pass 2.
 */
export async function recoverProselessTurn(args: {
  readonly chatId: ChatId;
  /** THIS turn's pipeline arguments — re-used verbatim but for the two overrides below. */
  readonly pipelineArgs: RunTurnPipelineArgs;
  /** The refused first pass. Caller has already checked {@link isRecoverableProselessTurn}. */
  readonly first: TurnPipelineResult;
}): Promise<TurnPipelineResult | null> {
  const { chatId, pipelineArgs, first } = args;
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
    return null;
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
