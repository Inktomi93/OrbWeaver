// The chat-list ANCHOR — the containment PROVIDER (UI-Arch §4/§2.1) for the Chats-section LIST panel:
// wraps the list SURFACE in an `@orb/ui/layout` `<Container>` that owns `container-type` + a
// `container-name`, so the surface adapts to THIS box (the shell LIST region today, a sheet on mobile
// tomorrow) with zero layout props (§4b axis 1). `h-full` gives the surface a bounded height to scroll
// inside — the parent (the shell LIST region, itself `<RegionAnchor>`-wrapped) supplies the pixels.
// Mirrors the character library's `CharacterLibraryAnchor` precedent (the sanctioned feature-anchor-
// inside-shell-region shape).

import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

export interface ChatListAnchorProps {
  readonly children: ReactNode;
}

/** Provide the `chat-list` container box the chat-list surface consumes. */
export function ChatListAnchor({ children }: ChatListAnchorProps): ReactElement {
  return (
    <Container className="h-full" name="chat-list">
      {children}
    </Container>
  );
}
