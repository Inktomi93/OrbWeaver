// The message-thread ANCHOR — the containment PROVIDER (UI-Arch §4/§2.1): it wraps the message-list
// SURFACE in an `@orb/ui/layout` `<Container>` that owns `container-type` + a `container-name`, so the
// surface adapts to THIS box (never the viewport) and its `@container` queries resolve. `h-full` gives
// the surface a bounded height to scroll inside (the message-list seal throws on an unbounded window) —
// the anchor's parent (the shell CONTENT region) supplies the actual pixels. This is the cross-file
// anchor-wraps-surface shape §4 mandates + what flips the `surface-in-a-container` gate green.

import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

export interface MessageThreadAnchorProps {
  readonly children: ReactNode;
}

/** Provide the `chat-thread` container box the message-list surface consumes. */
export function MessageThreadAnchor({ children }: MessageThreadAnchorProps): ReactElement {
  return (
    <Container name="chat-thread" className="h-full">
      {children}
    </Container>
  );
}
