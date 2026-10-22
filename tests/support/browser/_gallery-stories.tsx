import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { z } from "zod";
import { GALLERY_JITLESS_TEXT, GALLERY_READY_LABEL, GALLERY_READY_TEXT, GALLERY_RENDER_FAILURE, GALLERY_SCHEMA_LABEL } from "../iso/gallery-fixtures.ts";

export function GalleryReadyStory(): ReactElement {
  return (
    <Stack className="order-12">
      <output aria-label={GALLERY_READY_LABEL}>{GALLERY_READY_TEXT}</output>
      <output aria-label={GALLERY_SCHEMA_LABEL}>{z.config().jitless === true ? GALLERY_JITLESS_TEXT : "JIT"}</output>
    </Stack>
  );
}

export function GalleryRenderFailureStory(): never {
  throw new Error(GALLERY_RENDER_FAILURE);
}
