// The "Recent chats" HOME tile body — chat-owned (home-section-spec §3.3): the tile belongs to the
// feature that owns the DATA and the INTENT, never to the host. This is the chat landing's former recents
// block, MOVED not forked — same `trpc.chat.listChats` query key as the chats pane, so there is one truth
// and `chatsChanged` freshness comes free, and the same `ChatSummaryRow` anatomy the pane and the
// character-chats projection render.
//
// It suspends; home mounts every tile body inside its own `QueryBoundary`, so a slow read here cannot
// blank the rest of home.
//
// Selecting a recent is a CROSS-SECTION navigation: the row writes chat's own selection AND moves the
// rail to chats (`#state` module actions — §12's sanctioned channel; home never wires this).

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, MessagesSquare, Plus } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { openModal, selectChatFromList, setActiveSection } from "#state";
import { ChatSummaryRow } from "./chat-summary-row";

const RECENTS_LIMIT = 8;

function openRecent(chatId: ChatId): void {
  selectChatFromList(chatId);
  setActiveSection("chats");
}

export function HomeRecentsTileBody(): ReactElement {
  const trpc = useTRPC();
  const { data: chats } = useSuspenseQuery(trpc.chat.listChats.queryOptions({}));
  const recents = chats.slice(0, RECENTS_LIMIT);

  if (recents.length === 0) {
    return (
      <EmptyState
        action={
          <Button intent="secondary" onClick={(): void => openModal("newChat")} size="sm">
            <Icon icon={Plus} size="sm" />
            New chat
          </Button>
        }
        description="Your threads land here the moment you start one."
        icon={<Icon icon={MessagesSquare} size="lg" />}
        title="No chats yet"
      />
    );
  }

  return (
    <Stack aria-label="Recent chats" gap="row" role="list">
      {recents.map((chat) => (
        <ChatSummaryRow chat={chat} key={chat.id} onSelect={openRecent} />
      ))}
    </Stack>
  );
}
