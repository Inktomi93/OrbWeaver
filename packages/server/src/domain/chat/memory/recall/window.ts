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
 * Whether a digest's span is STILL inside this turn's live history window (its scene is verbatim in the prompt)
 * → drop it from `{{memory}}`. `seqStart` = the digest's earliest message seq; `cutoff` = the seq below which
 * messages are NOT in the prompt. BOUNDARY (exact, "still in the window" semantics): a digest starting AT the
 * cutoff is still in the window (dropped); a digest starting STRICTLY BELOW the cutoff has aged out (surfaced).
 */
export function inLiveWindow(seqStart: number, cutoff: number): boolean {
  return seqStart >= cutoff;
}
