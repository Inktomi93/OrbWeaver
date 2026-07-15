// The active chat's identity for the shell topbar: lead avatar/AvatarStack, title, member-count chip
// (toggles the Context panel to Members), and the (options) menu. Reads the same chat.getChat query the
// room already suspends on via a plain useQuery, so the always-present topbar never suspends on its own
// account — it degrades to a neutral title until the cache populates.

import { blobUrl } from "@orb/contracts/assets";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { AvatarStack } from "@orb/ui/avatar-stack";
import { Button } from "@orb/ui/button";
import { Icon, Users } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { setContextTab, setPanelMode, usePanelOverride } from "#state";
import { filterCharacters } from "../lib/roster";
import { ChatOptionsMenu } from "./chat-options-menu";

export interface ChatHeaderSurfaceProps {
  readonly chatId: ChatId;
  /** Forwarded to the options menu's membership rows; single-user installs render none of them. */
  readonly multiHumanCapable?: boolean;
}

type CharacterParticipant = ReturnType<typeof filterCharacters>[number];

export function ChatHeaderSurface({
  chatId,
  multiHumanCapable = false,
}: ChatHeaderSurfaceProps): ReactElement {
  const trpc = useTRPC();
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const title = chat?.title ?? "Untitled chat";
  const cast = filterCharacters(chat?.participants ?? []);
  const memberCount = (chat?.participants ?? []).filter((p) => p.leftSeq === null).length;
  // Undefined reads as closed (the panel's runtime default), so the first click opens.
  const contextOverride = usePanelOverride("chats", "context");
  const toggleMembersPanel = (): void => {
    const isOpen = contextOverride === "docked" || contextOverride === "overlay";
    if (isOpen) {
      setPanelMode("context", "collapsed");
      return;
    }
    setContextTab("members");
    setPanelMode("context", "docked");
  };
  const castMembers = cast.map((c) => ({ characterId: c.characterId, name: c.displayName }));
  const isHost = chat?.viewerIsHost === true;

  return (
    <Row gap="row" align="center" justify="between" className="min-w-0">
      <Row gap="row" align="center" className="min-w-0">
        <CastAvatars cast={cast} />
        <Text size="title" weight="semibold" className="truncate">
          {title}
        </Text>
        {memberCount > 0 ? (
          <Button
            type="button"
            intent="ghost"
            size="sm"
            aria-label={`Members — ${memberCount}`}
            onClick={toggleMembersPanel}
            className="whitespace-nowrap"
          >
            <Icon icon={Users} size="sm" />
            <Text as="span" size="micro" tone="muted" transform="caps" aria-hidden={true}>
              {memberCount}
            </Text>
          </Button>
        ) : null}
      </Row>
      <ChatOptionsMenu
        chatId={chatId}
        title={chat?.title ?? null}
        characters={castMembers}
        isHost={isHost}
        multiHumanCapable={multiHumanCapable}
      />
    </Row>
  );
}

function CastAvatars({
  cast,
}: {
  readonly cast: readonly CharacterParticipant[];
}): ReactElement | null {
  if (cast.length === 0) {
    return null;
  }
  const lead = cast[0];
  if (cast.length === 1 && lead !== undefined) {
    return (
      <Avatar
        size="sm"
        fallbackDelay={0}
        hueSeed={lead.characterId}
        {...(lead.avatarHash === null ? {} : { src: blobUrl(lead.avatarHash) })}
      >
        {initialsFor(lead.displayName)}
      </Avatar>
    );
  }
  return (
    <AvatarStack
      size="sm"
      items={cast.map((c) => ({
        name: c.displayName,
        ...(c.avatarHash === null ? {} : { src: blobUrl(c.avatarHash) }),
      }))}
      aria-label={`${cast.length} characters`}
    />
  );
}

export interface DraftChatHeaderProps {
  readonly characterIds: readonly CharacterId[];
}

/** The draft topbar identity: seeded character avatar(s) + name. No options menu — a draft has no
 *  chat-level actions yet. */
export function DraftChatHeader({ characterIds }: DraftChatHeaderProps): ReactElement {
  const trpc = useTRPC();
  const results = useQueries({
    queries: characterIds.map((characterId) => trpc.character.get.queryOptions({ characterId })),
  });
  const cast = results.map((r) => ({
    name: r.data?.name ?? "",
    avatarHash: r.data?.avatarHash ?? null,
  }));
  const first = cast[0]?.name.trim() ?? "";
  const title = first.length > 0 ? first : "New chat";
  return (
    <Row gap="row" align="center" className="min-w-0">
      <DraftCastAvatars cast={cast} />
      <Text size="title" weight="semibold" className="truncate">
        {title}
      </Text>
    </Row>
  );
}

function DraftCastAvatars({
  cast,
}: {
  readonly cast: readonly { readonly name: string; readonly avatarHash: string | null }[];
}): ReactElement | null {
  if (cast.length === 0) {
    return null;
  }
  const lead = cast[0];
  if (cast.length === 1 && lead !== undefined) {
    return (
      <Avatar
        size="sm"
        fallbackDelay={0}
        {...(lead.avatarHash === null ? {} : { src: blobUrl(lead.avatarHash) })}
      >
        {initialsFor(lead.name)}
      </Avatar>
    );
  }
  return (
    <AvatarStack
      size="sm"
      items={cast.map((c) => ({
        name: c.name,
        ...(c.avatarHash === null ? {} : { src: blobUrl(c.avatarHash) }),
      }))}
      aria-label={`${cast.length} characters`}
    />
  );
}
