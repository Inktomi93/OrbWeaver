// The Chats topbar identity header — the open room's roster header, resolved from the section's OWN #state
// (the active handle). A section-owned body so `chatsSection.header` rides the registry, not route
// composition.
//
// It also carries the TEMPORARY badge: the `chats.temporary` flag is CREATION-ONLY by
// design, so a user who only learns their room is ephemeral after the fact cannot fix it. The picker states
// it up front (the pre-create half) and this badge states it for the room's whole life, off the chat row.
// The pre-send DRAFT arm is gone with draft mode (D166): there
// is no window between the pick and the row any more.
//
// The `room-header` surface anchor lands here, beside the roster chip: a contributor there is mounted in
// every open room and renders nothing where it does not apply.

import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Row } from "@orb/ui/layout";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { Fragment } from "react";
import { useTRPC } from "#data";
import type { ChatSurfaceContribution, ContributorRegistry } from "#lib";
import { useActiveChatId } from "#state";
import { ChatHeaderSurface } from "./chat-header.tsx";

/** Is the room ephemeral? A plain `useQuery` off the same `getChat` the room already reads — this header
 *  must never suspend on its own account, so an unresolved read reads as "not temporary" (the badge appears
 *  the moment the cache lands, which for a just-created room is its first frame: `useStartChat` seeds it). */
function useIsTemporaryChat(chatId: ChatId): boolean {
  const trpc = useTRPC();
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  return chat?.temporary === true;
}

interface ChatsTopbarHeaderProps {
  /** The surface-anchor contributors; zero registrants (or none passed) is exactly the header without them. */
  readonly surfaceContributors?: ContributorRegistry<ChatSurfaceContribution>;
}

export function ChatsTopbarHeader({ surfaceContributors }: ChatsTopbarHeaderProps): ReactElement | null {
  const activeChatId = useActiveChatId();
  if (activeChatId === null) {
    return null;
  }
  return <TopbarHeader chatId={activeChatId} {...(surfaceContributors === undefined ? {} : { surfaceContributors })} />;
}

function TopbarHeader({ chatId, surfaceContributors }: { readonly chatId: ChatId } & ChatsTopbarHeaderProps): ReactElement {
  const temporary = useIsTemporaryChat(chatId);
  const state = { chatId };
  const contributions = (surfaceContributors?.list() ?? []).flatMap((contribution) =>
    contribution.anchor === "room-header" && (contribution.when?.(state) ?? true) ? [{ id: contribution.id, node: contribution.body(state) }] : [],
  );
  if (!temporary && contributions.length === 0) {
    return <ChatHeaderSurface chatId={chatId} />;
  }
  return (
    <Row align="center" className="min-w-0" gap="row">
      <ChatHeaderSurface chatId={chatId} />
      {temporary ? (
        <Badge intent="neutral" tone="soft">
          Temporary
        </Badge>
      ) : null}
      {contributions.map(({ id, node }) => (
        <Fragment key={id}>{node}</Fragment>
      ))}
    </Row>
  );
}
