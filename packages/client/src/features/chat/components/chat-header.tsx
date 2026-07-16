// The active chat's identity — reused across TWO shell surfaces from one cluster:
//  · the topbar LEAD (`ChatHeaderSurface` / `DraftChatHeader`): lead avatar/AvatarStack, title, and the
//    member-count chip (entry-only — always opens the Context panel on Members). The chat-options ⋯ moved
//    to the END of the topbar TRAIL cluster (chatOptionsChrome → chat-options-topbar.tsx, north-star §4 N1).
//  · the CONTEXT-panel BAND (`ChatContextHeader`, north-star §4 N4 / P4): the same avatar + title, NO chip
//    (the members entry lives on the topbar — one home, §2/§9), definition-owned via the `defineContextTabs`
//    `header` slot in chats-section.tsx.
// Both read the same chat.getChat query the room already suspends on via a plain useQuery, so neither
// surface suspends on its own account — each degrades to a neutral title until the cache populates.

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
import type { ReactElement, ReactNode } from "react";
import { useAuthConfig, useTRPC } from "#data";
import type { ChatContextState } from "#lib";
import { setContextTab, setPanelMode } from "#state";
import { deriveChatTitle } from "../lib/chat-summary-row";
import { filterCharacters, membersTabJustified } from "../lib/roster";

export interface ChatHeaderSurfaceProps {
  readonly chatId: ChatId;
}

type CharacterParticipant = ReturnType<typeof filterCharacters>[number];

interface CommittedIdentity {
  readonly cast: readonly CharacterParticipant[];
  readonly title: string;
  readonly memberCount: number;
  /** The member-count chip renders behind the SAME predicate that gates the Members context tab
   *  (`membersTabJustified` — chats-section.tsx's `when`), so the chip can never open a tab that
   *  doesn't exist (a 1:1 chat would land on Overrides — a mislabeled dead-end). */
  readonly membersJustified: boolean;
}

/** The committed chat's identity (avatars/title/member-count), read from the shared `getChat` query
 *  (plain useQuery — degrades to a neutral title, never suspends). The ONE home for the topbar LEAD and
 *  the context BAND to derive their identity from. Title fallback = `deriveChatTitle` (the one home —
 *  stored titles are "" until renamed; a blank title never renders). */
function useCommittedIdentity(chatId: ChatId): CommittedIdentity {
  const trpc = useTRPC();
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const { data: authConfig } = useAuthConfig();
  const participants = chat?.participants ?? [];
  const cast = filterCharacters(participants);
  return {
    cast,
    title: deriveChatTitle(
      chat?.title ?? null,
      cast.map((c) => c.displayName),
    ),
    memberCount: participants.filter((p) => p.leftSeq === null).length,
    membersJustified: membersTabJustified(participants, authConfig?.multiHumanCapable === true),
  };
}

/** The shared identity cluster — lead avatar(s) + truncating title. The topbar surface appends the
 *  member-count chip; the context header renders it bare. Consumers own the `<Row>` wrapper. */
function ChatIdentityCluster({ avatars, title }: { readonly avatars: ReactNode; readonly title: string }): ReactElement {
  return (
    <>
      {avatars}
      <Text size="title" weight="semibold" className="truncate">
        {title}
      </Text>
    </>
  );
}

export function ChatHeaderSurface({ chatId }: ChatHeaderSurfaceProps): ReactElement {
  const { cast, title, memberCount, membersJustified } = useCommittedIdentity(chatId);
  // The chip is entry-only — it ALWAYS opens Context on Members, never toggles closed (D66 §2 members
  // row; the collapse affordance belongs to the context header's own control).
  const openMembersPanel = (): void => {
    setContextTab("members");
    setPanelMode("context", "docked");
  };

  return (
    <Row gap="row" align="center" className="min-w-0">
      <ChatIdentityCluster avatars={<CastAvatars cast={cast} />} title={title} />
      {membersJustified ? (
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

/** The CONTEXT-panel band identity (north-star §4 N4 / P4) — the active chat's avatar + title, phase-aware,
 *  fed by the `defineContextTabs` `header` slot (chats-section.tsx). No member chip: the members entry is
 *  the topbar's (one home). */
export function ChatContextHeader({ state }: { readonly state: ChatContextState }): ReactElement {
  if (state.phase === "committed") {
    return <CommittedContextIdentity chatId={state.chatId} />;
  }
  return <DraftChatHeader characterIds={state.cast} />;
}

function CommittedContextIdentity({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const { cast, title } = useCommittedIdentity(chatId);
  return (
    <Row gap="row" align="center" className="min-w-0">
      <ChatIdentityCluster avatars={<CastAvatars cast={cast} />} title={title} />
    </Row>
  );
}

export interface DraftChatHeaderProps {
  readonly characterIds: readonly CharacterId[];
}

/** The draft identity (topbar LEAD + context band): seeded character avatar(s) + name. No options menu /
 *  no member chip — a draft has no chat-level actions yet. */
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
      <ChatIdentityCluster avatars={<DraftCastAvatars cast={cast} />} title={title} />
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
