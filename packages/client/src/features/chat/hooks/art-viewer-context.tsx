// The handle every transcript row uses to open its art in the one shared viewer (`ArtViewerProvider`). A row
// outside a provider reads null and keeps its art as plain, non-interactive paint.

import { createContext, use } from "react";
import type { ArtToView } from "../contract/presentation.ts";

export type { ArtToView } from "../contract/presentation.ts";

/** The shared viewer: `open` shows `art`, and `opener` is the control focus returns to when it closes. */
export interface ArtViewer {
  readonly open: (art: ArtToView, opener: HTMLElement) => void;
}

export const ArtViewerContext = createContext<ArtViewer | null>(null);

export function useArtViewer(): ArtViewer | null {
  return use(ArtViewerContext);
}
