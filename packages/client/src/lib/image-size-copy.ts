// The words for an image's size, in one home: the /imagine modal and the rule editor name the same three shapes and
// the same "no size sent" choice, and spelled them two ways.

import type { SizePresetName } from "@orb/contracts/imagery";

export const IMAGE_SIZE_LABELS: Record<SizePresetName, string> = {
  square: "Square",
  portrait: "Portrait",
  landscape: "Landscape",
};

/** What leaving the size unset means: the server keeps the shape each image mode composes for. */
export const IMAGE_SIZE_MODE_DEFAULT = "mode default";
