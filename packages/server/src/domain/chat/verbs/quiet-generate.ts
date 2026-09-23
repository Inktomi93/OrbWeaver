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
import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import type { SideGenSampling } from "@orb/inference";
import { resolveSideGenSampling } from "@orb/inference";
import type { QuietGenerate, QuietGenerateDeps, QuietGenerateParams } from "../contract/context.ts";
import type { TurnMessage } from "../contract/results.ts";

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
      worldInfoActivated: [],
      matchedKeys: [],
      compactSummaryIncluded: false,
      memoryIncluded: false,
      // Null, not an empty slice: a quiet generation runs no recall at all (#250) — reporting a zero-pool
      // recall here would be a fact about a call that never happened.
      memoryRecall: null,
      // A quiet generation is the bare instruction + one span — no preset walk runs, so no databank section
      // can have delivered (this is the turn's own truth, not a compiler placation).
      databankIncluded: false,
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

/** Resolve the quiet generation's sampling through the side-gen ladder: the `quiet_generate` floor (temp 0.3,
 *  1024 out — a summary is not creative writing) ← the chat host's default-preset params, with the CALLER's
 *  `intent` (compaction's code-pinned low temp, sourced from `SIDE_GEN_POSTURES.compaction`) merged over the
 *  params rung. The merge — not a third ladder rung — is deliberate: the ladder carries exactly two rungs
 *  since the per-template sampling override was deleted, and this is an
 *  INTERNAL per-pass intent, never a user-facing override. The resolved sampling is spread OVER the caller's
 *  intent so its other fields (e.g. `compaction`) survive, then temperature/maxOutputTokens carry the answer. */
function quietIntent(intent: UserIntent | undefined, chatParams: SideGenSampling): UserIntent {
  const sampling = resolveSideGenSampling(SIDE_GEN_POSTURES.quiet_generate, { ...chatParams, ...intent });
  return { ...intent, ...sampling };
}

export function createQuietGenerate(deps: QuietGenerateDeps): QuietGenerate {
  return async (params: QuietGenerateParams) => {
    const chatParams = await deps.resolveChatPresetParams(params.chatId);
    const stream = deps.runChatTurn({
      connection: params.connection,
      chatId: params.chatId,
      prompt: quietPrompt(params.systemPrompt),
      history: quietHistory(params.userText),
      intent: quietIntent(params.intent, chatParams),
      kind: "generate",
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
