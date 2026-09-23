// domain/imagery/substrate/templates — server-side prompt composition behavior (doc 02 §5–6). The canonical
// quiet-extraction and multimodal vision-caption instructions live in `@orb/contracts/imagery`. Each carries a
// load-bearing "Begin your reply with: <prefix>," so the LLM opens the keyword list with the composition the size
// defaults assume; REQUIRED_PREFIXES + ensurePrefix are the drift belt (doc 02 §1 step 4) when the LLM drops it.
// The negative-prompt BASE is marinara's deduped generic defect-suppression core (doc 02 §6) — appended-to,
// never replaced — and since PROSE-1 S1 it is a slot in the `@orb/contracts/imagery` catalog like its template
// siblings, so `composeNegative` takes the resolved base rather than owning the bytes.
// Modernized from ST's promptTemplates (index.js:174): the "Ignore previous instructions" jailbreak
// preamble is REPLACED by an explicit "Pause the roleplay" task frame (we control the system prompt, ST didn't).

import type { PromptTemplateMode } from "@orb/contracts/imagery";

/** The composition each non-free mode's keyword list must OPEN with — the templates instruct the LLM to
 *  begin here; `ensurePrefix` re-asserts it (doc 02 §1 step 4). The FACE→portrait / BACKGROUND→landscape
 *  size defaults (size.ts) assume the composition these set. */
const REQUIRED_PREFIXES: Record<Exclude<PromptTemplateMode, "free">, string> = {
  character: "full body portrait,",
  face: "close up facial portrait,",
  scenario: "scene,",
  background: "background,",
  character_multimodal: "full body portrait,",
  face_multimodal: "close up facial portrait,",
};

/** The composed negative for a generation (doc 02 §5–6): the resolved BASE with the user's per-request
 *  `negative` APPENDED (comma-joined), never replaced — the base is defect-suppression every generation wants.
 *  PROSE-1 census 88: the base is the `imagery.negative.base` slot (marinara's verified lists, deduped to the
 *  generic core — docs/plans/rpg/design.md carries the game-tuned variants verbatim; cite, don't fork), resolved by the
 *  caller off the requesting user's `UserSettings.prose`. Empty overrides ⇒ the shipped bytes. */
export function composeNegative(base: string, userNegative: string | undefined): string {
  const extra = userNegative?.trim() ?? "";
  return extra.length > 0 ? `${base}, ${extra}` : base;
}

/** Prepend the mode's required prefix unless the resolved keywords already open with it (case-insensitive) —
 *  the template-drift belt for when the LLM dropped its "Begin with" instruction. "free" has no prefix (the
 *  user's literal words are used verbatim, doc 02 §1 step 3). */
export function ensurePrefix(prompt: string, mode: PromptTemplateMode): string {
  if (mode === "free") {
    return prompt;
  }
  const prefix = REQUIRED_PREFIXES[mode];
  return prompt.toLowerCase().startsWith(prefix.toLowerCase()) ? prompt : `${prefix} ${prompt}`;
}
