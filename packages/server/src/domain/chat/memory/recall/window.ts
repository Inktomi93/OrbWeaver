// domain/chat/memory/recall/window — the §3a SECOND guard: the token-driven recall WINDOW-FILTER. PURE.
//
// The two guards are DISTINCT (core/Knowledge-Cluster.md §3a — do not conflate):
//   • BUILD-PROTECT (`verbatimWindow`, a FIXED small message count, e.g. 8): the build cutoff `maxSeq −
//     verbatimWindow` — only fully-aged-out blocks are digested, aggressively + with NO gap. A budget-INDEPENDENT
//     constant; its job is "never forget a block that scrolled past the protect zone".
//   • RECALL WINDOW-FILTER (this file, TOKEN-DRIVEN + variable, often 50–200 messages on a real model): at
//     recall, drop any digest whose scene is STILL verbatim in THIS turn's live history window — so `{{memory}}`
//     never re-injects a scene the model already has in full. The cutoff is the seq below which messages are NOT
//     in the prompt; the engine supplies it from the §8 history-budget fit (the same drop math). Its job is
//     "no redundancy". When the live window (variable) exceeds `verbatimWindow` (fixed 8) — the common case —
//     blocks 9…L are both digested AND still verbatim; relying on the fixed build-protect would inject them
//     redundantly. This filter is the fix; it is NOT the fixed window.

/**
 * The cutoff meaning "the LAST turn sent the WHOLE history" (#333) — the fit trimmed NOTHING (the conversation
 * fits the model's window) OR ran with no window ceiling at all. In BOTH cases every past message is verbatim
 * in the prompt, so EVERY digest's scene is still in the live window and must be dropped. It is the honest
 * encoding, not a hack: "the seq below which messages are NOT in the prompt" is −∞ when nothing is excluded, so
 * `inLiveWindow(seqStart, this)` is true for every digest. The bug this fixes: the whole-history case used to
 * resolve to `undefined` (no boundary stamp), which `filterPool` read as "no live-window filter → recall
 * everything" — the exact inversion where a 20k chat inside a 32k window re-injected every scene the model
 * already reads in full.
 */
export const LIVE_WINDOW_FULL_HISTORY_CUTOFF = Number.NEGATIVE_INFINITY;

/**
 * Whether the digest-span endpoint `seq` is STILL inside this turn's live history window (that message is
 * verbatim in the prompt) → drop the digest from `{{memory}}`. `cutoff` = the seq below which messages are NOT
 * in the prompt. BOUNDARY (exact, "still in the window" semantics): a seq AT the cutoff is still in the window
 * (dropped); STRICTLY BELOW has aged out (surfaced). A {@link LIVE_WINDOW_FULL_HISTORY_CUTOFF} (−∞) cutoff
 * drops every digest (the whole history is in the prompt).
 *
 * WHICH endpoint is the CALLER's decision, and it is tier-dependent — `recall::filterPool` states the rule
 * (#1518): a tier\>0 digest is tested on its span END (any overlap drops it, because the pool still holds the
 * finer digests that re-cover its aged-out half), a tier-0 digest on its span START (drop only when wholly
 * inside, because nothing finer stands behind it).
 */
export function inLiveWindow(seq: number, cutoff: number): boolean {
  return seq >= cutoff;
}
