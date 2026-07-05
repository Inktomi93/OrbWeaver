// The character-library ANCHOR — the containment PROVIDER (UI-Arch §4/§2.1): wraps the library SURFACE in
// an `@orb/ui/layout` `<Container>` that owns `container-type` + a `container-name`, so the surface adapts
// to THIS box (never the viewport) wherever it's dropped — the shell CONTENT region today, a drawer/modal
// tomorrow, with zero layout props (§4b axis 1). `h-full` gives the surface a bounded height to scroll
// inside (the virtual-list seal throws on an unbounded window) — the parent (the shell CONTENT region,
// itself already `<RegionAnchor>`-wrapped) supplies the actual pixels. Mirrors the chat feature's
// `MessageThreadAnchor` precedent (anchors/message-thread-anchor.tsx) — nesting a feature-owned anchor
// inside the shell's own region container is the sanctioned shape (the surface stays portable outside
// app-shell too, not just today's placement).

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
