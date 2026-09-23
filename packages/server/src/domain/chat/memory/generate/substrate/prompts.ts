// domain/chat/memory/generate/substrate/prompts — the summarizer prompt BUILDERS (the ST-summarizer replacement,
// §2b). The digest prompt enforces the THREE mandatory parts (topic anchor `[entities — scene]` · significance-
// filtered facts · 15–30 concrete keywords); the consolidation prompt is the tiering DELTA prompt ("here are
// prior consolidations — synthesize the arc, do NOT repeat them"). PURE builders — no I/O, no state.
//
// PROSE-1 S1 (census rows 78-81): the BYTES are no longer authored here. They are slots in
// `@orb/contracts/chat`'s prose table, resolved against the ROOM HOST's `UserSettings.prose`; this module only
// composes them with the transcript/facet data. An empty override record ⇒ byte-identical to pre-PROSE-1.
//
// Row 79 (`digestUserPrompt`'s `Transcript block:` lead) is deliberately NOT a slot: its only literal is a
// two-word structural LABEL (spec §2.11 — the reading grammar, not the voice, and a host edit buys nothing),
// and homing it would need §4.5's template machinery. It rides to S4 with the rest of the template prose.

import type { ProseOverrides } from "@orb/contracts/prose";
import { resolveProseText } from "@orb/contracts/prose";

/** The system prompt for a tier-0 block digest — the strict three-part retrieval unit (§2b). */
export function digestSystemPrompt(prose: ProseOverrides): string {
  return resolveProseText("chat.memory.digestSystem", prose);
}

/** The user prompt for a tier-0 block digest — the verbatim transcript to distill. */
export function digestUserPrompt(transcript: string): string {
  return `Transcript block:\n\n${transcript}`;
}

/** The system prompt for a tier-(k+1) consolidation — synthesize the arc across child digests, never repeat. */
export function consolidationSystemPrompt(prose: ProseOverrides): string {
  return resolveProseText("chat.memory.consolidationSystem", prose);
}

/** The user prompt for a consolidation — the child digests' facets, numbered under the slot's do-not-repeat
 *  lead-in (census row 81). The numbering is data this builder owns; only the lead is authorable. */
export function consolidationUserPrompt(prose: ProseOverrides, childFacets: readonly string[]): string {
  const body = childFacets.map((d, i) => `[${i + 1}]\n${d}`).join("\n\n");
  return `${resolveProseText("chat.memory.consolidationLead", prose)}\n\n${body}`;
}
