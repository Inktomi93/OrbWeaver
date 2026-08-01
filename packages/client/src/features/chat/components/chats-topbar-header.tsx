// The Chats topbar identity header — a committed chat's roster header, or a draft's seeded-character
// header, resolved from the section's OWN #state (handle/draftSeed). A section-owned body so
// `chatsSection.header` rides the registry, not route composition.
//
// It also carries the TEMPORARY badge (home-section-spec §5): the `chats.temporary` flag is CREATION-ONLY
// by design, so a user who only learns their room is ephemeral AFTER the first send cannot fix it. The
// badge therefore has to be visible BEFORE that send — it reads the draft SEED pre-commit and the chat
// row (`getChat.temporary`) after, so the room keeps saying so for its whole life.

import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Row } from "@orb/ui/layout";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { isCommitted, useActiveChatHandle, useActiveDraftSeed } from "#state";
import { ChatHeaderSurface, DraftChatHeader } from "./chat-header";

/** Is the COMMITTED room ephemeral? A plain `useQuery` off the same `getChat` the room already reads —
 *  this header must never suspend on its own account, so an unresolved read reads as "not temporary"
 *  (the badge appears the moment the cache lands; the draft arm covers the pre-send window). */
function useIsTemporaryChat(chatId: ChatId): boolean {
  const trpc = useTRPC();
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  return chat?.temporary === true;
}

function TemporaryBadge(): ReactElement {
  return (
    <Badge intent="neutral" tone="soft">
      Temporary
    </Badge>
  );
}

function CommittedTopbarHeader({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const temporary = useIsTemporaryChat(chatId);
  if (!temporary) {
    return <ChatHeaderSurface chatId={chatId} />;
  }
  return (
    <Row align="center" className="min-w-0" gap="row">
      <ChatHeaderSurface chatId={chatId} />
      <TemporaryBadge />
    </Row>
  );
}

export function ChatsTopbarHeader(): ReactElement | null {
  const handle = useActiveChatHandle();
  const draftSeed = useActiveDraftSeed();
  const activeChatId = isCommitted(handle) ? handle.id : null;
  const draftCharacterIds = handle.kind === "draft" ? (draftSeed?.characterIds ?? []) : [];
  if (activeChatId !== null) {
    return <CommittedTopbarHeader chatId={activeChatId} />;
  }
  // A temp draft must say so even with NO seeded cast — that is the whole pre-send window.
  const draftTemporary = handle.kind === "draft" && draftSeed?.temporary === true;
  if (draftCharacterIds.length === 0) {
    return draftTemporary ? <TemporaryBadge /> : null;
  }
  return (
    <Row align="center" className="min-w-0" gap="row">
      <DraftChatHeader characterIds={draftCharacterIds} />
      {draftTemporary ? <TemporaryBadge /> : null}
    </Row>
  );
}
