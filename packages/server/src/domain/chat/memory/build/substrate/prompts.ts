// domain/chat/memory/build/substrate/prompts — the summarizer prompts (the ST-summarizer replacement, §2b).
// The digest prompt enforces the THREE mandatory parts (topic anchor `[entities — scene]` · significance-
// filtered facts · 15–30 concrete keywords); the consolidation prompt is the tiering DELTA prompt ("here are
// prior consolidations — synthesize the arc, do NOT repeat them"). PURE constants/builders — no I/O, no state.

/** The system prompt for a tier-0 block digest — the strict three-part retrieval unit (§2b). */
export const DIGEST_SYSTEM_PROMPT = [
  "You distill a block of roleplay transcript into a retrieval-optimized memory unit.",
  "Output EXACTLY three parts, in order:",
  "1. A topic anchor as the MANDATORY first line, in the form: [entities — scene]",
  "2. Significance-filtered facts — only what will plausibly matter later; drop turn-by-turn small talk.",
  '3. A final line beginning "keywords:" followed by 15-30 concrete, distinctive keywords',
  "   (named entities, places, objects, specifics), comma-separated.",
  "Do not add any commentary, preamble, or markdown headers.",
].join("\n");

/** The user prompt for a tier-0 block digest — the verbatim transcript to distill. */
export function digestUserPrompt(transcript: string): string {
  return `Transcript block:\n\n${transcript}`;
}

/** The system prompt for a tier-(k+1) consolidation — synthesize the arc across child digests, never repeat. */
export const CONSOLIDATION_SYSTEM_PROMPT = [
  "You consolidate several memory digests from EARLIER in a story into ONE higher-level digest",
  "capturing the overall arc across them.",
  "Use the SAME three-part format: a [entities — scene] topic-anchor first line, significance-filtered",
  'facts, and a final "keywords:" line of 15-30 keywords.',
  "The prior digests are provided so you do NOT repeat each verbatim — SYNTHESIZE the arc, do not concatenate.",
].join("\n");

/** The user prompt for a consolidation — the child digests' facets, numbered (do-not-repeat framing). */
export function consolidationUserPrompt(childFacets: readonly string[]): string {
  const body = childFacets.map((d, i) => `[${i + 1}]\n${d}`).join("\n\n");
  return `Prior digests to consolidate (synthesize the arc across these — do not repeat each):\n\n${body}`;
}
