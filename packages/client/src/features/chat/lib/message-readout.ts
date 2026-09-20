// The metadata row's per-turn cache economics readout (#1032, the viewgap WIRE batch). `MessageView` has
// carried `cacheReadTokens`/`cacheWriteTokens` since the variant economics landed and no client file
// spelled them, so cache economics — the single biggest lever on what a turn costs — were invisible beside
// the token count they explain.
//
// PURE + PROP-DRIVEN, the `gen-duration.ts` precedent: these unit-test without a render, and the row stays
// a formatter over data it is handed.
//
// THE OUTCOME NOTICE WAS KILLED (#1876, owner ruling). The "cut off — length cap" badge caused confusion
// (not role-gated, an edit triggered it, unreadable on some themes) and was removed entirely.
// `messageOutcomeNotice`, `MessageOutcomeNotice` and the supporting types were deleted in the same commit.

import type { MessageView } from "@orb/contracts/chat";
import { builtinProvider } from "@orb/contracts/inference";

/** The per-turn CACHE economics beside the token count — `null` when the backend reported none (both
 *  columns absent, or both zero: a turn that neither read nor wrote cache has no economics to show).
 */
export function cacheTokensLabel(readTokens: number | null, writeTokens: number | null): string | null {
  const parts: string[] = [];
  if (readTokens !== null && readTokens > 0) {
    parts.push(`${readTokens} read`);
  }
  if (writeTokens !== null && writeTokens > 0) {
    parts.push(`${writeTokens} written`);
  }
  return parts.length === 0 ? null : `cache ${parts.join(" / ")}`;
}

/** Whether a swipe can be settled against an upstream cost at all — the ONE home for the per-message
 *  cost affordance's gate, read by `MessageCostReadout` AND by the metadata row that decides whether to hand
 *  it a slot (two spellings of the same question is how a dangling trigger, or a `·` with nothing after it,
 *  ships). It lives in this pure lib rather than beside the component because a `.tsx` module may export only
 *  components (the react-refresh boundary rule), and because it unit-tests without a render.
 *
 *  GATED ON THE PROVIDER'S DIALECT, NOT ON THE ID. `generation_id` used to be written only by the OpenRouter
 *  transport, so "an id is present" WAS "this is an OpenRouter row"; the record-truth landing (inference audit
 *  B7) made the column the provider's own response id on EVERY hosted wire, so an Anthropic swipe now carries
 *  a `msg_…` there. `connection.generationCost` is an OpenRouter-only diagnostic — every other row gets
 *  `requireOpenRouter`'s typed refusal (`inference/backends/openai-compat/diagnostics.ts`) — so keying the
 *  reveal off the id offers a button whose only possible outcome is "cost n/a".
 *
 *  A provider id that is not a SHIPPED row (a plugin/admin registry row) resolves `undefined` and is hidden:
 *  the client has no synchronous registry for runtime rows, and hiding a button that would have worked is the
 *  honest direction to miss in — the other one spends a paid upstream call to display a refusal. */
export function canRevealGenerationCost(message: MessageView): boolean {
  const { generationId, connectionId, provider } = message;
  if (generationId === null || connectionId === null || provider === null) {
    return false;
  }
  return builtinProvider(provider)?.dialect === "openrouter";
}
