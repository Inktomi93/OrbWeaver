// The transcript's one image viewer: every avatar, echo tile, whisper band and ripple portrait opens its art
// through the context, so the rows share a single lightbox instead of mounting one each.

import type { ReactElement, ReactNode } from "react";
import { useRef, useState } from "react";
import type { ArtToView, OpenArtViewer } from "../hooks/art-viewer-context.tsx";
import { ArtViewerContext } from "../hooks/art-viewer-context.tsx";
import { GalleryLightbox } from "./gallery-lightbox.tsx";

export function ArtViewerProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const [art, setArt] = useState<ArtToView | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const open: OpenArtViewer = (next, opener) => {
    openerRef.current = opener;
    setArt(next);
  };
  return (
    <ArtViewerContext value={open}>
      {children}
      <GalleryLightbox
        image={art}
        onClose={(): void => setArt(null)}
        finalFocus={(): HTMLElement | true => (openerRef.current?.isConnected === true ? openerRef.current : true)}
        onSettled={(): void => undefined}
      />
    </ArtViewerContext>
  );
}
