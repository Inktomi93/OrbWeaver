// The metadata row's two NEW derived readouts (#1032, the viewgap WIRE batch) — the per-turn cache
// economics and the "how did this reply END" notice. `MessageView` has carried
// `cacheReadTokens`/`cacheWriteTokens`/`finishReason`/`stopReason`/`terminalReason` since the variant
// economics landed and no client file spelled any of them, so a reply that was CUT OFF at the length cap
// looked exactly like one that finished, and cache economics — the single biggest lever on what a turn
// costs — were invisible beside the token count they explain.
//
// PURE + PROP-DRIVEN, the `gen-duration.ts` precedent: these unit-test without a render, and the row stays
// a formatter over data it is handed.
//
// WHY THE OUTCOME NOTICE IS NARROW. `finishReason` is the NORMALIZED cross-backend vocab
// (`stop|length|filter|tool|other`, infra/providers/contract/chat.ts) and `other` is its catch-all for any
// raw string the map does not know — a backend emitting an unmapped-but-perfectly-healthy terminal word
// would park a permanent "ended: other" under every single reply. So only the arms that name a REAL
// problem speak: `length` (the reply was cut at the token cap) and `filter` (the provider refused). A clean
// `stop`/`tool`, and a bare `other` with nothing else to say, render nothing at all.
//
// `stopReason`/`terminalReason` are the RAW provider provenance behind that verdict. The human phrase is
// the load-bearing copy; the raw string rides the `title` as detail (never as the only carrier of meaning
// — a tooltip is not copy). The one case where the raw string IS the whole answer is a turn that ended on
// a provider TERMINAL condition with no normalized finish at all: there the row has nothing but the
// backend's own word, so it says that word rather than saying nothing.

import type { MessageView } from "@orb/contracts/chat";

/** The end-of-reply notice: the human verdict plus the raw provider provenance behind it. */
export interface MessageOutcomeNotice {
  readonly text: string;
  /** The raw backend `stopReason`/`terminalReason` — provenance detail, never the load-bearing copy. */
  readonly title: string | undefined;
}

/** The `MessageView` slice the outcome notice reads — declared as a projection so the derivation cannot
 *  quietly grow a dependency on the rest of the view. */
type OutcomeInput = Pick<MessageView, "finishReason" | "stopReason" | "terminalReason">;

/** The raw provider words behind a verdict, joined when the backend reported both and they differ. */
function rawProvenance(message: OutcomeInput): string | undefined {
  const stop = message.stopReason === "" ? null : message.stopReason;
  const terminal = message.terminalReason === "" ? null : message.terminalReason;
  if (stop !== null && terminal !== null && stop !== terminal) {
    return `${stop} · ${terminal}`;
  }
  return stop ?? terminal ?? undefined;
}

/** How this reply ended, when that is worth saying — `null` on a clean finish (the overwhelming majority).
 */
export function messageOutcomeNotice(message: OutcomeInput): MessageOutcomeNotice | null {
  const title = rawProvenance(message);
  if (message.finishReason === "length") {
    return { text: "cut off — length cap", title };
  }
  if (message.finishReason === "filter") {
    return { text: "stopped — content filter", title };
  }
  // A turn that died on a provider terminal condition never got a normalized finish; the backend's raw
  // word is the only thing anyone can be told, so it is the copy rather than the tooltip.
  if (message.finishReason === null && message.terminalReason !== null && message.terminalReason !== "") {
    return { text: `ended — ${message.terminalReason}`, title: message.stopReason ?? undefined };
  }
  return null;
}

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
