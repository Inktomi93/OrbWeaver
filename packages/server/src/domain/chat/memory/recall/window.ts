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
 * Whether a digest's span is STILL inside this turn's live history window (its scene is verbatim in the prompt)
 * → drop it from `{{memory}}`. `seqStart` = the digest's earliest message seq; `cutoff` = the seq below which
 * messages are NOT in the prompt. BOUNDARY (exact, "still in the window" semantics): a digest starting AT the
 * cutoff is still in the window (dropped); a digest starting STRICTLY BELOW the cutoff has aged out (surfaced).
 * A {@link LIVE_WINDOW_FULL_HISTORY_CUTOFF} (−∞) cutoff drops every digest (the whole history is in the prompt).
 */
export function inLiveWindow(seqStart: number, cutoff: number): boolean {
  return seqStart >= cutoff;
}
