// The world-info-library ANCHOR — the containment PROVIDER (UI-Arch §4/§2.1): wraps the library SURFACE in
// an `@orb/ui/layout` `<Container>` that owns `container-type` + a `container-name`, so the surface adapts to
// THIS box (never the viewport). Mirrors PresetLibraryAnchor / CharacterLibraryAnchor — the shell LIST region
// already wraps its own region container; nesting the feature anchor keeps the surface portable. `h-full`
// bounds the scroll region.

import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

export interface WorldInfoLibraryAnchorProps {
  readonly children: ReactNode;
}

/** Provide the `world-info-library` container box the library surface consumes. */
export function WorldInfoLibraryAnchor({ children }: WorldInfoLibraryAnchorProps): ReactElement {
  return (
    <Container className="h-full" name="world-info-library">
      {children}
    </Container>
  );
}
