// The `imageDetail` modal as ONE co-located definition (client-architecture-lockdown.md §6d) — the lightbox.
// `surface` placement — opened by `openImageDetail` (a #state action) from a message image click, never a
// chrome affordance. onClose drops the viewed subject.

import { Images } from "@orb/ui/icons";
import type { ReactElement } from "react";
import type { ModalDefinition } from "#state";
import { clearDetailSubject } from "#state";
import { ImageDetailBody } from "../components/image-detail-body.tsx";
import { IMAGE_DETAIL_TITLE } from "./imagine-names.ts";

export const imageDetailModal: ModalDefinition = {
  id: "imageDetail",
  title: IMAGE_DETAIL_TITLE,
  size: "lg",
  trigger: { placement: "surface", label: IMAGE_DETAIL_TITLE, icon: Images },
  onClose: clearDetailSubject,
  body: (): ReactElement => <ImageDetailBody />,
};
