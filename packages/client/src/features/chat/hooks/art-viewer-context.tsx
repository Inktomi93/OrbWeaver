// The handle every transcript row uses to open its art in the one shared viewer (`ArtViewerProvider`). A row
// outside a provider reads null and keeps its art as plain, non-interactive paint.

import { createContext, use } from "react";

/** The art being viewed: the blob's hash, and the speaker's name it is titled with. */
export interface ArtToView {
  readonly hash: string;
  readonly name: string;
}

/** Opens the viewer on `art`; `opener` is the control focus returns to when it closes. */
export interface OpenArtViewer {
  (art: ArtToView, opener: HTMLElement): void;
}

export const ArtViewerContext = createContext<OpenArtViewer | null>(null);

export function useArtViewer(): OpenArtViewer | null {
  return use(ArtViewerContext);
}
