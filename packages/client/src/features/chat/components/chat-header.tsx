// The active chat's identity — reused across TWO shell surfaces from one cluster:
//  · the topbar LEAD (`ChatHeaderSurface` / `DraftChatHeader`): lead avatar/AvatarStack, title, and the
//    member-count chip (entry-only — always opens the Context panel on Members). The chat-options ⋯ moved
//    to the END of the topbar TRAIL cluster (chatOptionsChrome → chat-options-topbar.tsx, north-star §4 N1).
// (The CONTEXT-panel band twin `ChatContextHeader` was DELETED with CP-1's header de-dup — the topbar
// owns identity, the band is neutral chrome; Context-Panel-Program.md §1 Q3. CP-4's scene banner will be
// a NEW component.)
// It reads the same chat.getChat query the room already suspends on via a plain useQuery, so the surface
// never suspends on its own account — it degrades to a neutral title until the cache populates.

import { blobUrl } from "@orb/contracts/assets";
import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { AvatarStack } from "@orb/ui/avatar-stack";
import { Button } from "@orb/ui/button";
import { Icon, Users } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useAuthConfig, useTRPC } from "#data";
import type { ChatContextTabId } from "#lib";
import { testId } from "#lib";
import { setContextTab, setPanelMode } from "#state";
import { deriveChatTitle } from "../lib/chat-summary-row";
import { filterCharacters, membersTabJustified } from "../lib/roster";
import { AddMemberPopover } from "./add-member-popover";

export interface ChatHeaderSurfaceProps {
  readonly chatId: ChatId;
}

type CharacterParticipant = ReturnType<typeof filterCharacters>[number];

interface CommittedIdentity {
  readonly cast: readonly CharacterParticipant[];
  /** Every present seat (humans + characters) — the roster the solo-chat entry popover lists. */
  readonly participants: readonly ParticipantView[];
  readonly viewerIsHost: boolean;
  readonly title: string;
  readonly memberCount: number;
  /** True when the roster is a GROUP (justifies the Members context tab — `membersTabJustified`, the same
   *  predicate chats-section.tsx's members `when` uses). The members ENTRY always renders now (every chat
   *  has a roster); this only decides whether the entry opens the Members TAB (group) or the compact
   *  roster popover (solo) — Context-Panel-Program CP-1 owner ruling 2026-07-25. */
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
  const present = participants.filter((p) => p.leftSeq === null);
  const cast = filterCharacters(participants);
  return {
    cast,
    participants: present,
    viewerIsHost: chat?.viewerIsHost === true,
    title: deriveChatTitle(
      chat?.title ?? null,
      cast.map((c) => c.displayName),
    ),
    memberCount: present.length,
    membersJustified: membersTabJustified(participants, authConfig?.multiHumanCapable === true),
  };
}

/** The shared identity cluster — lead avatar(s) + truncating title. The topbar surface appends the
 *  member-count chip; the context header renders it bare. Consumers own the `<Row>` wrapper. */
function ChatIdentityCluster({ avatars, title }: { readonly avatars: ReactNode; readonly title: string }): ReactElement {
  return (
    <>
      {avatars}
      <Text size="title" weight="semibold" className="shell-topbar-title min-w-0 truncate">
        {title}
      </Text>
    </>
  );
}

export function ChatHeaderSurface({ chatId }: ChatHeaderSurfaceProps): ReactElement {
  const { cast, participants, viewerIsHost, title, memberCount, membersJustified } = useCommittedIdentity(chatId);

  return (
    <Row gap="row" align="center" className="min-w-0">
      <ChatIdentityCluster avatars={<CastAvatars cast={cast} />} title={title} />
      <ChatRosterEntry
        chatId={chatId}
        memberCount={memberCount}
        membersJustified={membersJustified}
        participants={participants}
        cast={cast}
        viewerIsHost={viewerIsHost}
      />
    </Row>
  );
}

/** The topbar members entry — the ONE roster doorway (chat-header §2/§9, one home). It ALWAYS renders now
 *  (every chat has a roster). On a GROUP it opens the Members context tab (unchanged behavior). On a SOLO
 *  chat (no Members tab to open) it opens a compact roster popover: the present seats + the host-only
 *  "Add a character" affordance that turns the solo chat into a group (owner ruling 2026-07-25). */
function ChatRosterEntry({
  chatId,
  memberCount,
  membersJustified,
  participants,
  cast,
  viewerIsHost,
}: {
  readonly chatId: ChatId;
  readonly memberCount: number;
  readonly membersJustified: boolean;
  readonly participants: readonly ParticipantView[];
  readonly cast: readonly CharacterParticipant[];
  readonly viewerIsHost: boolean;
}): ReactElement {
  const label = `Members — ${memberCount}`;
  const entryButton = (onClick?: () => void): ReactElement => (
    <Button
      type="button"
      intent="ghost"
      size="sm"
      aria-label={label}
      className="shell-chat-member-chip whitespace-nowrap"
      {...(onClick === undefined ? {} : { onClick })}
    >
      <Icon icon={Users} size="sm" />
      <Text as="span" size="micro" tone="muted" transform="caps" aria-hidden={true}>
        {memberCount}
      </Text>
    </Button>
  );

  // GROUP: the entry opens the Members context tab (entry-only — never toggles closed; the collapse
  // affordance is the context header's own control, D66 §2).
  if (membersJustified) {
    return entryButton(() => {
      setContextTab("members" satisfies ChatContextTabId);
      setPanelMode("context", "docked");
    });
  }

  // SOLO: no Members tab exists, so the entry is a compact roster popover instead of a dead tab link.
  return (
    <Popover>
      <PopoverTrigger render={entryButton()} />
      <PopoverPopup>
        <SoloRosterMenu chatId={chatId} participants={participants} cast={cast} viewerIsHost={viewerIsHost} />
      </PopoverPopup>
    </Popover>
  );
}

/** The solo-chat roster popover body: the present seats (avatar + name) + the host-only add-character
 *  affordance (the cast-bar "+" flow, reused). Adding a second character converts the solo chat to a
 *  group via the existing `chat.addCharacterToChat` machinery — no bespoke conversion path. */
function SoloRosterMenu({
  chatId,
  participants,
  cast,
  viewerIsHost,
}: {
  readonly chatId: ChatId;
  readonly participants: readonly ParticipantView[];
  readonly cast: readonly CharacterParticipant[];
  readonly viewerIsHost: boolean;
}): ReactElement {
  return (
    <Stack gap="row" className="min-w-56" data-testid={testId("soloRosterMenu")}>
      <Text as="span" size="micro" tone="muted" transform="caps">
        In this chat
      </Text>
      <Stack gap="field">
        {participants.map((p) => (
          <RosterSeatRow key={p.id} participant={p} />
        ))}
      </Stack>
      {viewerIsHost ? (
        <>
          <Separator />
          <Row gap="field" align="center" className="min-w-0">
            <AddMemberPopover chatId={chatId} existingCharacterIds={cast.map((c) => c.characterId)} />
            <Text as="span" size="label" tone="muted">
              Add a character
            </Text>
          </Row>
        </>
      ) : null}
    </Stack>
  );
}

function RosterSeatRow({ participant }: { readonly participant: ParticipantView }): ReactElement {
  const hueSeed = participant.kind === "character" && participant.characterId !== null ? participant.characterId : participant.id;
  return (
    <Row gap="field" align="center" className="min-w-0">
      <Avatar size="sm" fallbackDelay={0} hueSeed={hueSeed} {...(participant.avatarHash === null ? {} : { src: blobUrl(participant.avatarHash) })}>
        {initialsFor(participant.displayName)}
      </Avatar>
      <Text as="span" size="label" weight="medium" className="min-w-0 truncate">
        {participant.displayName}
      </Text>
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

// The CONTEXT-panel band identity (`ChatContextHeader`, north-star §4 N4/P4) was DELETED with CP-1's
// header de-dup (the topbar owns identity; the band reduces to neutral chrome — Context-Panel-Program.md
// §1 Q3). CP-4's scene banner is a NEW component, not a resurrection — git history holds the old one.

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
