// The preset-library ANCHOR — the containment PROVIDER (UI-Arch §4/§2.1): wraps the library SURFACE in an
// `@orb/ui/layout` `<Container>` that owns `container-type` + a `container-name`, so the surface adapts to
// THIS box (never the viewport). Mirrors CharacterLibraryAnchor — the shell CONTENT/LIST region already
// wraps its own region container; nesting the feature anchor keeps the surface portable. `h-full` bounds
// the scroll region.

import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

export interface PresetLibraryAnchorProps {
  readonly children: ReactNode;
}

/** Provide the `preset-library` container box the library surface consumes. */
export function PresetLibraryAnchor({ children }: PresetLibraryAnchorProps): ReactElement {
  return (
    <Container className="h-full" name="preset-library">
      {children}
    </Container>
  );
}
