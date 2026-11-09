import { QueryBoundary } from "@orb/client/components";
import { chatTempChatTile } from "@orb/client/features/chat";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement, ReactNode, RefObject } from "react";
import { useRef } from "react";

// A tile contribution may be a dormant doorway; the temp-chat tile is built, and a dormant arm renders nothing to sweep.
function TempChatBody({ gridRef }: { readonly gridRef: RefObject<HTMLDivElement | null> }): ReactNode {
  const { body } = chatTempChatTile;
  return typeof body === "function" ? body({ gridRef }) : null;
}

/** The production Home temp-chat tile, which sweeps expired temporary chats once it mounts. */
export function TempChatTileStory(): ReactElement {
  const gridRef = useRef<HTMLDivElement>(null);
  return (
    <CtClientProviders>
      <QueryBoundary resetKeys={[]} fallback={chatTempChatTile.skeleton?.()}>
        <TempChatBody gridRef={gridRef} />
      </QueryBoundary>
    </CtClientProviders>
  );
}
