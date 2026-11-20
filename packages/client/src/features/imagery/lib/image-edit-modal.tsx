// The `imageEdit` modal as ONE co-located definition (client-architecture-lockdown.md §6d) — img2img.
// `surface` placement — reached from the detail lightbox's Edit action via `openImageEdit` (a #state action),
// never a chrome affordance. onClose drops the edit subject.

import { WandSparkles } from "@orb/ui/icons";
import type { ModalDefinition } from "#state";
import { clearEditSubject } from "#state";
import { useImageEditCommit } from "../hooks/use-image-edit-commit.tsx";
import { IMAGE_EDIT_NAME } from "./imagine-names.ts";

export const imageEditModal: ModalDefinition = {
  id: "imageEdit",
  title: IMAGE_EDIT_NAME,
  size: "lg",
  trigger: { placement: "surface", label: IMAGE_EDIT_NAME, icon: WandSparkles },
  onClose: clearEditSubject,
  body: { useCommit: useImageEditCommit },
};
