import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { ChatHeaderTitle } from "#client/features/chat/components/chat-header-title.tsx";

const CHAT_ID = mintTypeId(ID_PREFIX.chat);
const CREATED_AT = Date.UTC(2026, 9, 5, 12);

/** The production topbar room title: the host's rename button, and the plain text a non-host reads. */
export function ChatHeaderTitleStory({ canRename, roomName }: { readonly canRename: boolean; readonly roomName: string | null }): ReactElement {
  return (
    <CtClientProviders>
      <main>
        <ChatHeaderTitle canRename={canRename} chatId={CHAT_ID} createdAt={CREATED_AT} label="Aria Nightshade" roomName={roomName} />
      </main>
    </CtClientProviders>
  );
}
