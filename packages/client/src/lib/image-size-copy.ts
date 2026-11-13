// The words for an image's size and mode, in one home: the /imagine modal, the rule editor and the provenance strip name
// the same shapes and modes, and spelled them apart.

import type { PromptTemplateMode, SizePresetName } from "@orb/contracts/imagery";

/** The word for each image mode; total, so a new mode fails `tsc` here. */
export const IMAGE_MODE_LABELS: Readonly<Record<PromptTemplateMode, string>> = {
  free: "Free prompt",
  character: "Character",
  face: "Face",
  scenario: "Scene",
  background: "Background",
  ["character_multimodal"]: "Character from avatar",
  ["face_multimodal"]: "Face from avatar",
};

export const IMAGE_SIZE_LABELS: Record<SizePresetName, string> = {
  square: "Square",
  portrait: "Portrait",
  landscape: "Landscape",
};

/** What leaving the size unset means: the server keeps the shape each image mode composes for. */
export const IMAGE_SIZE_MODE_DEFAULT = "mode default";

/** The size and negative-prompt fields' names, in the /imagine options and the rule editor's image action alike. */
export const IMAGE_SIZE_FIELD_NAME = "Image size";
export const IMAGE_NEGATIVE_PROMPT_FIELD_NAME = "Negative prompt";
/** The same field inside a sentence, as the rule editor's Add and Remove controls say it. */
export const IMAGE_NEGATIVE_PROMPT_NOUN = IMAGE_NEGATIVE_PROMPT_FIELD_NAME.toLowerCase();
