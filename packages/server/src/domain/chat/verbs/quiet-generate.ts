// domain/chat/verbs/quiet-generate — the QUIET, non-canon generation seam. A STANDALONE compose-built factory
// (the `ExtractQuiet`/`postNarratorMessage` Principal-less precedent), NOT a ChatService verb: it takes no
// principal (its one caller — managed compaction — resolves authority/connection upstream). It runs a bounded
// generation through the chat's OWN resolved connection via the injected `runChatTurn` role, reducing the stream
// to `{text, costUsd}`. It COMMITS NOTHING (no canon slot/variant), EMITS NOTHING (no turnStarted/delta/
// turnCompleted bus events, no ghost row), and RESUMES NOTHING it must clean up — the stateful backend keys its
// resume cache by chatId, so a quiet generation reuses the chat's session read-only (no session mutation here).
//
// SOURCE-AGNOSTIC: the caller passes the already-resolved connection; whatever the API/runner axis resolves to
// serves the request. A backend that can't serve it surfaces as the normal provider/connection failure (the
// stream throws) — the caller owns failure-honesty, never a per-backend branch here.

import type { AssembledPrompt } from "@orb/contracts/chat";
import type { UserIntent } from "@orb/contracts/preset";
import type { QuietGenerate, QuietGenerateDeps, QuietGenerateParams } from "../contract/context";
import type { TurnMessage } from "../contract/results";

/** A near-deterministic, bounded quiet generation (a summary is not creative writing). Callers may override via
 *  `params.intent`, but these are the floor the marker build runs at. */
const QUIET_TEMPERATURE = 0.3;
const QUIET_MAX_OUTPUT_TOKENS = 1024;

/** The minimal `AssembledPrompt` a quiet generation carries: the instruction as the static system prefix, an
 *  empty dynamic suffix, no injections, `sendHistory` true (the one user message IS the history). The trace is
 *  inert — nothing reads a quiet generation's assemble trace. */
function quietPrompt(systemPrompt: string): AssembledPrompt {
  return {
    static: systemPrompt,
    dynamic: "",
    afterHistory: [],
    sendHistory: true,
    trace: {
      staticSections: [],
      dynamicSections: [],
      worldInfoIncluded: 0,
      worldInfoDropped: [],
      matchedKeys: [],
      compactSummaryIncluded: false,
      memoryIncluded: false,
      guidedInstructionIncluded: false,
      staticCacheBusters: [],
      chatInjectionsIncluded: 0,
      afterHistorySections: [],
    },
  };
}

/** The span text as one user-role wire message (a single text part — a quiet generation never carries images).
 *  The part literal is inferred through the `TurnMessage` shape — this seam never imports `ChatContentPart` (D51:
 *  the multimodal part TYPE lives only at the engine request seam; a quiet generation's lone trusted text needs no
 *  tokenization/image resolution, so a bare `{type:"text"}` literal, structurally checked against TurnMessage,
 *  suffices without pulling the symbol upstream). */
function quietHistory(userText: string): readonly TurnMessage[] {
  return [{ role: "user", content: [{ type: "text", text: userText }] }];
}

/** Fold the caller's `intent` over the bounded quiet floor (temperature + output length). */
function quietIntent(intent: UserIntent | undefined): UserIntent {
  return {
    ...intent,
    temperature: intent?.temperature ?? QUIET_TEMPERATURE,
    maxOutputTokens: intent?.maxOutputTokens ?? QUIET_MAX_OUTPUT_TOKENS,
  };
}

export function createQuietGenerate(deps: QuietGenerateDeps): QuietGenerate {
  return async (params: QuietGenerateParams) => {
    const stream = deps.runChatTurn({
      connection: params.connection,
      chatId: params.chatId,
      prompt: quietPrompt(params.systemPrompt),
      history: quietHistory(params.userText),
      intent: quietIntent(params.intent),
      kind: "generate",
      // No non-owner max-pro-sub consent is asserted here: the caller (the engine turn) already ran the belt
      // for this chat's connection this turn; a quiet generation reuses that same connection.
      ownerConsented: false,
      cacheBreakpointFromEnd: null,
      ...(params.signal !== undefined ? { signal: params.signal } : {}),
    });

    let text = "";
    let costUsd: number | null = null;
    for await (const chunk of stream) {
      if (chunk.kind === "text") {
        text += chunk.text;
      } else if (chunk.kind === "final") {
        // The runner's authoritative content wins over accumulated deltas (economics.content is a required
        // string — never null); economics carry the spend.
        text = chunk.economics.content;
        costUsd = chunk.economics.costUsd ?? null;
      }
      // reasoning chunks are ignored — a marker generation has no reasoning surface.
    }
    return { text: text.trim(), costUsd };
  };
}
