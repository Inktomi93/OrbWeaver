// The corpus-navigator anchor — the containment provider: wraps the corpus LIST surface in a
// `<Container>` that owns `container-type`/`container-name`, so the surface adapts to this box wherever
// it's dropped. `h-full` gives the surface a bounded height to scroll its search/browse results inside.

import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

export interface CorpusListAnchorProps {
  readonly children: ReactNode;
}

/** Provide the `corpus-navigator` container box the corpus LIST surface consumes. */
export function CorpusListAnchor({ children }: CorpusListAnchorProps): ReactElement {
  return (
    <Container className="h-full" name="corpus-navigator">
      {children}
    </Container>
  );
}
