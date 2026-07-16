// infra/providers/scripted-override — the RUNNER_OVERRIDE dev/test seam: a deterministic, credit-free
// `runChatTurn` replay. When `env.RUNNER_OVERRIDE` is set, the composition root (`entry/`) reads it via
// `foundation/env` and injects `buildScriptedOverrideRunner(spec)` as the chat executor's runChatTurn — so
// a full turn (transport → domain → THIS → DB → SSE → UI) runs end-to-end WITHOUT a model call (no Max-sub
// credits, no OpenRouter key). It is the production-side analogue of the vitest scripted runner. Opt-in via
// env ONLY; never wired in a normal boot.
//
// THIS file never reads `process.env` (the `sole-env-reader` gate) — `entry/` reads `RUNNER_OVERRIDE` and
// hands the spec in. Deterministic: no clock / no randomness (cursor is per-builder closure state, not
// module scope).
//
// Spec format: `scripted-tape:{"replies":["answer one","answer two"]}` — each turn dequeues the next reply
// (cycling when exhausted), streams it as one text delta, and returns a well-formed ChatResult. Plain text
// (no `scripted-tape:` prefix) is accepted as a single canned reply.

import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatRequest, ChatResult, ChatUsage } from "./contract";
import { normalizeFinishReason, ProviderError } from "./contract";

const TAPE_PREFIX = "scripted-tape:";
const FALLBACK_REPLY = "(scripted reply)";

// Static usage so a scripted turn bills like the hand-rolled fakes (deterministic — no real tokens spent).
const SCRIPTED_CONTEXT_WINDOW = 200_000;
const SCRIPTED_MAX_OUTPUT = 8192;
const SCRIPTED_TOKENS_IN = 10;
const SCRIPTED_TOKENS_OUT = 5;

function usageFor(model: string): ChatUsage {
  return {
    model,
    tokensIn: SCRIPTED_TOKENS_IN,
    tokensOut: SCRIPTED_TOKENS_OUT,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cacheCreation5mTokens: 0,
    cacheCreation1hTokens: 0,
    reasoningTokens: null,
    contextWindow: SCRIPTED_CONTEXT_WINDOW,
    maxOutputTokens: SCRIPTED_MAX_OUTPUT,
    webSearchRequests: 0,
    costUsd: 0,
    costDetails: null,
    isByok: null,
  };
}

/** Parse the spec into the reply tape. A `scripted-tape:` prefix carries a `{ replies: string[] }` JSON
 *  body; anything else (incl. malformed JSON or an empty list) degrades to a single canned reply rather
 *  than throwing — the seam is a test crutch, not a validated boundary. */
function parseReplies(spec: string): readonly string[] {
  if (!spec.startsWith(TAPE_PREFIX)) {
    return [spec];
  }
  try {
    const parsed = JSON.parse(spec.slice(TAPE_PREFIX.length)) as { readonly replies?: unknown };
    const replies = Array.isArray(parsed.replies) ? parsed.replies.filter((reply): reply is string => typeof reply === "string") : [];
    return replies.length > 0 ? replies : [FALLBACK_REPLY];
  } catch {
    return [FALLBACK_REPLY];
  }
}

/** Build a `runChatTurn`-shaped function that replays canned replies instead of calling a model. The spec
 *  is injected by `entry/` (read from `env.RUNNER_OVERRIDE` there); this seam never touches `process.env`. */
export function buildScriptedOverrideRunner(spec: string): (req: ChatRequest) => Promise<ChatResult> {
  const replies = parseReplies(spec);
  let cursor = 0;

  return (req: ChatRequest): Promise<ChatResult> => {
    if (req.signal?.aborted === true) {
      return Promise.reject(new ProviderError({ kind: "aborted", retryable: false, message: "scripted abort" }));
    }
    // `cursor % length` cycles the tape; the `??` is a defensive floor (length ≥ 1 always holds).
    const reply = replies[cursor % replies.length] ?? FALLBACK_REPLY;
    cursor += 1;
    // The agent-sdk path reports a terminal reason; the stateless backends don't — match production so the
    // UI renders a scripted turn identically.
    const isSdk = req.api === "agent-sdk";
    req.onDelta?.({ chatId: castId<ChatId>(req.chatId ?? ""), kind: "text", text: reply });
    return Promise.resolve({
      reply,
      reasoning: "",
      reasoningRedacted: false,
      stopReason: "end_turn",
      terminalReason: isSdk ? "completed" : null,
      finishReason: normalizeFinishReason("end_turn"),
      ttftMs: null,
      warmSpareClaimed: null,
      durationApiMs: null,
      apiErrorStatus: null,
      numTurns: 1,
      usage: usageFor(req.model),
      events: [],
      rateLimit: null,
    });
  };
}
