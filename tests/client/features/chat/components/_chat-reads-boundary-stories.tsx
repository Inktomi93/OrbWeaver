import type { ChatListCharacterFilter } from "@orb/client/state";
import type { ChatId, MessageVariantId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useState } from "react";
import { ChatListFacesStrip } from "#client/features/chat/components/chat-list-character-filter.tsx";
import { VariantWireViewer } from "#client/features/chat/components/variant-wire-viewer.tsx";

/** The wire viewer opened on one variant, as the message row's trigger opens it. */
export function VariantWireViewerStory({ chatId, variantId }: { readonly chatId: ChatId; readonly variantId: MessageVariantId }): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <CtClientProviders>
      <VariantWireViewer chatId={chatId} variantId={variantId} open={open} onOpenChange={setOpen} />
    </CtClientProviders>
  );
}

/** The chat list's faces strip, scoped to `characterFilter` when one is given. */
export function ChatListFacesStripStory({ characterFilter = null }: { readonly characterFilter?: ChatListCharacterFilter | null }): ReactElement {
  return (
    <CtClientProviders>
      <ChatListFacesStrip characterFilter={characterFilter} />
    </CtClientProviders>
  );
}
