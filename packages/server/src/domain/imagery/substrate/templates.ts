// domain/imagery/substrate/templates — the real prompt text (doc 02 §5–6), NOT placeholders. PROMPT_TEMPLATES
// are the quiet-extraction instructions chat's shaper resolves macros in ({{char}}); CAPTION_INSTRUCTIONS are
// the multimodal vision-caption instructions (no macros — the image IS the subject). Each carries a load-bearing
// "Begin your reply with: <prefix>," so the LLM opens the keyword list with the composition the size defaults
// assume; REQUIRED_PREFIXES + ensurePrefix are the drift belt (doc 02 §1 step 4) when the LLM drops it.
// DEFAULT_NEGATIVE is a deduped generic defect-suppression core adapted from Marinara Engine's negative prompts (doc 02 §6) — appended-to, never
// replaced. Modernized from ST's promptTemplates (index.js:174): the "Ignore previous instructions" jailbreak
// preamble is REPLACED by an explicit "Pause the roleplay" task frame (we control the system prompt, ST didn't).

import type { PromptTemplateMode } from "@orb/contracts/imagery";
import type { ExtractionMode, MultimodalMode } from "../contract/params";

export const PROMPT_TEMPLATES: Record<ExtractionMode, string> = {
  character:
    "Pause the roleplay. Describe {{char}}'s complete physical appearance in the current moment " +
    "as a single comma-delimited list of concrete visual keywords for an image-generation model: " +
    "body type, hair, eyes, skin, facial features, clothing and its state, accessories, pose, " +
    "expression. Only visual terms — no names, no story, no prose sentences, no quotation marks. " +
    "Begin your reply with: full body portrait,",
  face:
    "Pause the roleplay. Describe {{char}}'s face in the current moment as a single " +
    "comma-delimited list of concrete visual keywords for an image-generation model: facial " +
    "features, expression, eye color and shape, hair framing the face, skin, any marks or " +
    "accessories on the head. Only visual terms — no names, no prose, no quotation marks. " +
    "Begin your reply with: close up facial portrait,",
  scenario:
    "Pause the roleplay. Summarize the current scene of the story as a single comma-delimited " +
    "list of concrete visual keywords for an image-generation model: the characters present and " +
    "their visible actions, the setting, time of day, mood, lighting, notable objects. Only " +
    "visual terms — no names beyond simple descriptors, no prose, no quotation marks. " +
    "Begin your reply with: scene,",
  background:
    "Pause the roleplay. Describe the current location of the story as a single comma-delimited " +
    "list of concrete visual keywords for an image-generation model: the place, architecture or " +
    "natural features, time of day, weather, lighting, atmosphere. Describe ONLY the environment " +
    "— no people, no characters, no figures. Begin your reply with: background,",
};

// biome-ignore-start lint/style/useNamingConvention: keyed by the canonical PROMPT_TEMPLATE_MODES literals (snake_case).
export const CAPTION_INSTRUCTIONS: Record<MultimodalMode, string> = {
  character_multimodal:
    "Describe the person in this image as a single comma-delimited list of concrete visual " +
    "keywords for an image-generation model: body type, hair, eyes, skin, clothing, accessories, " +
    "pose. Only visual terms, no prose. Begin with: full body portrait,",
  face_multimodal:
    "Describe the face of the person in this image as a single comma-delimited list of concrete " +
    "visual keywords for an image-generation model: facial features, expression, eyes, hair, " +
    "skin, head accessories. Only visual terms, no prose. Begin with: close up facial portrait,",
};
// biome-ignore-end lint/style/useNamingConvention: see start marker

/** The composition each non-free mode's keyword list must OPEN with — the templates instruct the LLM to
 *  begin here; `ensurePrefix` re-asserts it (doc 02 §1 step 4). The FACE→portrait / BACKGROUND→landscape
 *  size defaults (size.ts) assume the composition these set. */
// biome-ignore-start lint/style/useNamingConvention: keyed by the canonical PROMPT_TEMPLATE_MODES literals (snake_case).
const REQUIRED_PREFIXES: Record<Exclude<PromptTemplateMode, "free">, string> = {
  character: "full body portrait,",
  face: "close up facial portrait,",
  scenario: "scene,",
  background: "background,",
  character_multimodal: "full body portrait,",
  face_multimodal: "close up facial portrait,",
};
// biome-ignore-end lint/style/useNamingConvention: end the mode-literal-keyed prefix map.

/** One shared default (the negative-prompt lists adapted from Marinara Engine, deduped to the generic core — rpg-design/08 §2
 *  carries the game-tuned variants verbatim; cite, don't fork). User `negative` APPENDS to this (doc 02 §6),
 *  never replaces. Consumed by the request build once I2 widens the domain mirror (doc 05 FORK 2). */
export const DEFAULT_NEGATIVE =
  "text, letters, captions, subtitles, UI, watermark, logo, signature, speech bubble, " +
  "split screen, panel, collage, grid, duplicated face, extra head, extra person, " +
  "bad anatomy, low quality";

/** The composed negative for a generation (doc 02 §5–6): `DEFAULT_NEGATIVE` with the user's `negative`
 *  APPENDED (comma-joined), never replaced — the default is defect-suppression every generation wants. */
export function composeNegative(userNegative: string | undefined): string {
  const extra = userNegative?.trim() ?? "";
  return extra.length > 0 ? `${DEFAULT_NEGATIVE}, ${extra}` : DEFAULT_NEGATIVE;
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
