// The active chat's identity — reused across TWO shell surfaces from one cluster:
//  · the topbar LEAD (`ChatHeaderSurface`): lead avatar/AvatarStack, title, and the
//    member-count chip (entry-only — always opens the Context panel on Members). The chat-options ⋯ is NOT
//    here and no longer in the trail either: D111's drawn control map homes it in the COMPOSER's left
//    gutter (`composer-chat-options.tsx`, owner ruling 2026-08-09), and the trail widget was removed with
//    the move — one menu, one home. (It briefly lived at the end of the trail per north-star §4 N1.)
// (The CONTEXT-panel band twin `ChatContextHeader` was DELETED with CP-1's header de-dup — the topbar
// owns identity, the band is neutral chrome; Context-Panel-Program.md §1 Q3. CP-4's scene banner will be
// a NEW component.)
// It reads the same chat.getChat query the room already suspends on via a plain useQuery, so the surface
// never suspends on its own account — it degrades to a neutral title until the cache populates.

import { blobUrl } from "@orb/contracts/assets";
import type { ChatId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { AvatarStack } from "@orb/ui/avatar-stack";
import { Button } from "@orb/ui/button";
import { Icon, Users } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useTRPC } from "#data";
import type { ChatContextTabId } from "#lib";
import { deriveChatTitle } from "#lib";
import { revealContextPanel } from "#state";
import { filterCharacters } from "../lib/roster.ts";

export interface ChatHeaderSurfaceProps {
  readonly chatId: ChatId;
}

type CharacterParticipant = ReturnType<typeof filterCharacters>[number];

interface CommittedIdentity {
  readonly cast: readonly CharacterParticipant[];
  readonly title: string;
  /** Every PRESENT seat, humans + characters — the number on the roster chip. */
  readonly memberCount: number;
}

/** The committed chat's identity (avatars/title/member-count), read from the shared `getChat` query
 *  (plain useQuery — degrades to a neutral title, never suspends). The ONE home for the topbar LEAD and
 *  the context BAND to derive their identity from. Title fallback = `deriveChatTitle` (the one home —
 *  stored titles are "" until renamed; a blank title never renders). */
function useCommittedIdentity(chatId: ChatId): CommittedIdentity {
  const trpc = useTRPC();
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const participants = chat?.participants ?? [];
  const cast = filterCharacters(participants);
  return {
    cast,
    title: deriveChatTitle(
      chat?.title ?? null,
      cast.map((c) => c.displayName),
    ),
    memberCount: participants.filter((p) => p.leftSeq === null).length,
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
  const { cast, title, memberCount } = useCommittedIdentity(chatId);

  return (
    <Row gap="row" align="center" className="min-w-0">
      <ChatIdentityCluster avatars={<CastAvatars cast={cast} />} title={title} />
      <ChatRosterEntry memberCount={memberCount} />
    </Row>
  );
}

/** The roster CHIP itself — the `Users` glyph + the seat count. Its
 *  accessible name carries the count (the visible digit is `aria-hidden`, so the name is the only place a
 *  screen reader learns the number). */
function RosterChipButton({ count, onClick }: { readonly count: number; readonly onClick?: (() => void) | undefined }): ReactElement {
  return (
    <Button
      type="button"
      intent="ghost"
      size="sm"
      aria-label={`Members — ${count}`}
      className="shell-chat-member-chip whitespace-nowrap"
      {...(onClick === undefined ? {} : { onClick })}
    >
      <Icon icon={Users} size="sm" />
      <Text as="span" size="micro" tone="muted" transform="caps" aria-hidden={true}>
        {count}
      </Text>
    </Button>
  );
}

/** Open the Members context tab — the roster chip's action in a GROUP room. Entry-only: it
 *  never toggles closed (the collapse affordance is the context header's own control, D66 §2). */
function openMembersTab(): void {
  revealContextPanel("members" satisfies ChatContextTabId);
}

/**
 * The topbar members entry — the ONE roster doorway (chat-header §2/§9). It always renders (every committed
 * room has a roster) and it always opens the Members context tab.
 *
 * SUPERSESSION (#162, owner-ruled 2026-08-18). It used to FORK: a group opened the Members tab, and a SOLO
 * chat opened a compact `SoloRosterMenu` popover here — the present seats plus a host-only "Add a character"
 * (owner ruling 2026-07-25). That popover existed for one reason: the Members tab was SIZE-GATED and did not
 * exist for a 1:1 room, so the roster had nowhere else to live. The size gate is what produced the owner's
 * "Chat Members lost detail" report, and it is gone (`lib/roster.ts::membersTabJustified` — the floor is now
 * zero for a host, and the tab carries the cast, the add-character door and the invite door in one place).
 * With one roster surface for every room state, a second one in the topbar is not a fallback, it is a fork —
 * so the popover, its seat rows and their imports were deleted here rather than left beside the new home.
 */
function ChatRosterEntry({ memberCount }: { readonly memberCount: number }): ReactElement {
  return <RosterChipButton count={memberCount} onClick={openMembersTab} />;
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
//
// `DraftChatHeader` (the pre-send twin: founding-card avatars, `draftChatTitle`, a `1 + cast` seat count,
// and a list-first card peek to beat the ~2s "? | ? | ? | New chat" placebo window) was DELETED 2026-08-14
// with draft mode — the room has a roster from the creation click, and `useStartChat` seeds this exact
// `getChat` key from `startChat`'s own response, so the committed header is correct on the first frame with
// zero extra reads. That is strictly better than the peek it replaces.
