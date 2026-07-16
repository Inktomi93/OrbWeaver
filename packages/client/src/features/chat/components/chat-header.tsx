// The active chat's identity for the shell topbar LEAD: lead avatar/AvatarStack, title, and the member-count
// chip (entry-only — always opens the Context panel on Members). The chat-options ⋯ moved to the END of the
// topbar TRAIL cluster (chatOptionsChrome → chat-options-topbar.tsx, ui-cohesion-north-star §4 N1). Reads the
// same chat.getChat query the room already suspends on via a plain useQuery, so the always-present topbar
// never suspends on its own account — it degrades to a neutral title until the cache populates.

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
import { setContextTab, setPanelMode } from "#state";
import { filterCharacters } from "../lib/roster";

export interface ChatHeaderSurfaceProps {
  readonly chatId: ChatId;
}

type CharacterParticipant = ReturnType<typeof filterCharacters>[number];

export function ChatHeaderSurface({ chatId }: ChatHeaderSurfaceProps): ReactElement {
  const trpc = useTRPC();
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const title = chat?.title ?? "Untitled chat";
  const cast = filterCharacters(chat?.participants ?? []);
  const memberCount = (chat?.participants ?? []).filter((p) => p.leftSeq === null).length;
  // The chip is entry-only — it ALWAYS opens Context on Members, never toggles closed (D66 §2 members
  // row; the collapse affordance belongs to the context header's own control).
  const openMembersPanel = (): void => {
    setContextTab("members");
    setPanelMode("context", "docked");
  };

  return (
    <Row gap="row" align="center" className="min-w-0">
      <CastAvatars cast={cast} />
      <Text size="title" weight="semibold" className="truncate">
        {title}
      </Text>
      {memberCount > 0 ? (
        <Button type="button" intent="ghost" size="sm" aria-label={`Members — ${memberCount}`} onClick={openMembersPanel} className="whitespace-nowrap">
          <Icon icon={Users} size="sm" />
          <Text as="span" size="micro" tone="muted" transform="caps" aria-hidden={true}>
            {memberCount}
          </Text>
        </Button>
      ) : null}
    </Row>
  );
}

function CastAvatars({ cast }: { readonly cast: readonly CharacterParticipant[] }): ReactElement | null {
  if (cast.length === 0) {
    return null;
  }
  const lead = cast[0];
  if (cast.length === 1 && lead !== undefined) {
    return (
      <Avatar size="sm" fallbackDelay={0} hueSeed={lead.characterId} {...(lead.avatarHash === null ? {} : { src: blobUrl(lead.avatarHash) })}>
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

function DraftCastAvatars({ cast }: { readonly cast: readonly { readonly name: string; readonly avatarHash: string | null }[] }): ReactElement | null {
  if (cast.length === 0) {
    return null;
  }
  const lead = cast[0];
  if (cast.length === 1 && lead !== undefined) {
    return (
      <Avatar size="sm" fallbackDelay={0} {...(lead.avatarHash === null ? {} : { src: blobUrl(lead.avatarHash) })}>
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
