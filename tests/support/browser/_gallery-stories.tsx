import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  GALLERY_EFFECT_SETUPS_LABEL,
  GALLERY_JITLESS_TEXT,
  GALLERY_READY_LABEL,
  GALLERY_READY_TEXT,
  GALLERY_RENDER_FAILURE,
  GALLERY_SCHEMA_LABEL,
} from "../iso/gallery-fixtures.ts";

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

export function GalleryEffectReplayStory(): ReactElement {
  const setups = useRef(0);
  const [count, setCount] = useState(0);
  useEffect(() => {
    setups.current += 1;
    setCount(setups.current);
  }, []);
  return <output aria-label={GALLERY_EFFECT_SETUPS_LABEL}>{count}</output>;
}
