// The `imageEdit` modal as ONE co-located definition (client-architecture-lockdown.md §6d) — img2img.
// `surface` placement — reached from the detail lightbox's Edit action via `openImageEdit` (a #state action),
// never a chrome affordance. onClose drops the edit subject.

import { WandSparkles } from "@orb/ui/icons";
import type { ReactElement } from "react";
import type { ModalDefinition } from "#state";
import { clearEditSubject } from "#state";
import { ImageEditBody } from "../components/image-edit-body.tsx";

export const imageEditModal: ModalDefinition = {
  id: "imageEdit",
  title: "Edit image",
  size: "lg",
  trigger: { placement: "surface", label: "Edit image", icon: WandSparkles },
  onClose: clearEditSubject,
  body: (): ReactElement => <ImageEditBody />,
};
