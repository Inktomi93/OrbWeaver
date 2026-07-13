// The character-library anchor — the containment provider: wraps the library surface in a `<Container>`
// that owns `container-type`/`container-name`, so the surface adapts to this box wherever it's dropped.
// `h-full` gives the surface a bounded height to scroll inside (the virtual-list seal throws on an
// unbounded window).

import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

export interface CharacterLibraryAnchorProps {
  readonly children: ReactNode;
}

/** Provide the `character-library` container box the library surface consumes. */
export function CharacterLibraryAnchor({ children }: CharacterLibraryAnchorProps): ReactElement {
  return (
    <Container className="h-full" name="character-library">
      {children}
    </Container>
  );
}
