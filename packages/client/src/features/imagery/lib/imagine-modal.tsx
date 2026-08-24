// The `imagine` modal as ONE co-located definition (client-architecture-lockdown.md §6d). `surface`
// placement — opened by the `/imagine` slash command via `openImagine` (a #state action carrying the parsed
// seed), never a rail/topbar affordance. onClose drops the seed.

import { ImagePlus } from "@orb/ui/icons";
import type { ReactElement } from "react";
import type { ModalDefinition } from "#state";
import { clearImagineSeed } from "#state";
import { ImagineBody } from "../components/imagine-body.tsx";

export const imagineModal: ModalDefinition = {
  id: "imagine",
  title: "Generate an image",
  size: "md",
  trigger: { placement: "surface", label: "Imagine", icon: ImagePlus },
  onClose: clearImagineSeed,
  body: (): ReactElement => <ImagineBody />,
};
