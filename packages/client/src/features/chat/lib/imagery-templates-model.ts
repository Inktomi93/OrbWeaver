// The imagery-templates settings-section form model (Phase B ⑫) — the per-mode prompt-building overrides the
// `/imagine` + auto-illustrate paths resolve (server-side: `UserSettings.imagery.{templates,captions}[mode]`
// override ⊕ the shipped `@orb/contracts/imagery` catalog default). The form is a flat string-per-mode shape;
// an EMPTY field means "no override" → the section patch omits it → the mode reads the shipped default
// (byte-identical). The card UI ghosts the shipped default via `placeholder`, so an empty field visibly reads
// as "using the default". Pure projection + patch helpers (no I/O).

import type { UserSettings } from "@orb/contracts/settings";

/** The flat form shape — one field per non-free mode (4 extraction + 2 caption). Blank ⇒ no override. */
export interface ImageryTemplatesForm {
  readonly character: string;
  readonly face: string;
  readonly scenario: string;
  readonly background: string;
  readonly characterMultimodal: string;
  readonly faceMultimodal: string;
}

/** Project the stored `UserSettings.imagery` section into the flat form (an absent override ⇒ ""). */
export function projectImageryTemplatesForm(imagery: UserSettings["imagery"]): ImageryTemplatesForm {
  return {
    character: imagery.templates.character ?? "",
    face: imagery.templates.face ?? "",
    scenario: imagery.templates.scenario ?? "",
    background: imagery.templates.background ?? "",
    characterMultimodal: imagery.captions.character_multimodal ?? "",
    faceMultimodal: imagery.captions.face_multimodal ?? "",
  };
}

/** A trimmed non-empty field ⇒ an override; a blank/whitespace field ⇒ `undefined` (the section deep-merge
 *  leaves the stored value untouched — see the note below). The section patch always spells EVERY key so a
 *  CLEARED field (was an override, now blank) resets to the default: the write path sends `undefined` for a
 *  blank, which the section-patch deep-merge treats as "no change". To make a clear actually clear, a blank
 *  field is sent as `null` — the merge-clear leaf sentinel (`{}` = no-op, `null` = leaf clear). */
function fieldPatch(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Build the `imagery` section patch from the form. Every mode is spelled (a blank ⇒ `null` = leaf-clear, so
 *  removing an override actually resets to the shipped default). The nested `templates`/`captions` objects
 *  deep-merge server-side. */
export function toImageryTemplatesPatch(values: ImageryTemplatesForm): Record<string, unknown> {
  return {
    templates: {
      character: fieldPatch(values.character),
      face: fieldPatch(values.face),
      scenario: fieldPatch(values.scenario),
      background: fieldPatch(values.background),
    },
    // biome-ignore-start lint/style/useNamingConvention: the keys ARE the snake_case PROMPT_TEMPLATE_MODES literals (the wire vocabulary).
    captions: {
      character_multimodal: fieldPatch(values.characterMultimodal),
      face_multimodal: fieldPatch(values.faceMultimodal),
    },
    // biome-ignore-end lint/style/useNamingConvention: see start marker
  };
}
