// The active chat's identity — reused across TWO shell surfaces from one cluster:
//  · the topbar LEAD (`ChatHeaderSurface`): lead avatar/AvatarStack, title, and the
//    member-count chip (entry-only — always opens the Context panel on Members). The chat-options ⋯ is NOT
//    here and no longer in the trail either: D111's drawn control map homes it in the COMPOSER's left
//    gutter (`composer-chat-options.tsx`, owner ruling 2026-08-09), and the trail widget was removed with
//    the move — one menu, one home. (It briefly lived at the end of the trail per north-star §4 N1.)
// (The CONTEXT-panel band twin `ChatContextHeader` was DELETED with CP-1's header de-dup — the topbar
// owns identity, the band is neutral chrome Q3. CP-4's scene banner will be
// a NEW component.)
// It reads the same chat.getChat query the room already suspends on via a plain useQuery, so the surface
// never suspends on its own account — it renders a title-width SKELETON until the cache populates (it used
// to degrade to the fallback identity, which read as a real "Untitled chat · 0 members"; see
// `ChatHeaderSurface`).

import { blobUrl } from "@orb/contracts/assets";
import type { ChatId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { Icon, Users } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { authoredChatName, deriveChatTitle } from "#lib";
import { useRoomRoster } from "../hooks/use-room-roster.ts";
import { openMembersTab } from "../lib/open-members-tab.ts";
import { filterCharacters } from "../lib/roster.ts";
import { ChatHeaderTitle } from "./chat-header-title.tsx";
import { ChatRecallIndicator } from "./chat-recall-indicator.tsx";

export interface ChatHeaderSurfaceProps {
  readonly chatId: ChatId;
}

type CharacterParticipant = ReturnType<typeof filterCharacters>[number];

interface CommittedIdentity {
  readonly characters: readonly CharacterParticipant[];
  /** Who you are chatting with: the characters' names, or the untitled fallback for a room without any. */
  readonly participantsLabel: string;
  /** The user's own name for the room; null until they set one (a stamped default title counts as none). */
  readonly roomName: string | null;
  readonly createdAt: number;
  /** Has the room's own read landed? `false` ⇒ there is no identity yet, only the shape of one. */
  readonly resolved: boolean;
  /** The viewer holds the room HOST role — gates the recall indicator's host-only detail popover and renaming. */
  readonly viewerIsHost: boolean;
}

/** The committed chat's identity (avatars/title/member-count), read from the shared `getChat` query
 *  (plain useQuery — degrades to a neutral title, never suspends). The label is the participants through
 *  `deriveChatTitle`'s fallback with no authored name, so an empty roster still prints the untitled word. */
function useCommittedIdentity(chatId: ChatId): CommittedIdentity {
  const trpc = useTRPC();
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const participants = chat?.participants ?? [];
  const characters = filterCharacters(participants);
  const authored = authoredChatName(chat?.title ?? null);
  const hasCast = characters.length > 0;
  return {
    characters,
    // The participants lead; a room with no characters leads with its own name (or the untitled word).
    participantsLabel: hasCast
      ? deriveChatTitle(
          null,
          characters.map((c) => c.displayName),
        )
      : deriveChatTitle(authored, []),
    roomName:
      hasCast &&
      authored?.toLowerCase() !==
        characters
          .map((c) => c.displayName)
          .join(", ")
          .toLowerCase()
        ? authored
        : null,
    createdAt: chat?.createdAt ?? 0,
    resolved: chat !== undefined,
    viewerIsHost: chat?.viewerIsHost === true,
  };
}

/**
 * THE PLACEHOLDER MAY NOT LIE (#216, side-eye home re-score 2026-08-18). This surface deliberately does not
 * suspend, and its unresolved arm used to render the FALLBACK identity: `deriveChatTitle(null, [])` is
 * "Untitled chat" and an empty roster counts 0, so for ~480ms after Resume the topbar told the user they
 * were in an *Untitled chat with 0 members* — measured on a 120ms click strip, tiles 0 and 1. That is worse
 * than an absent status: it is a wrong one, on the one action home exists to offer.
 *
 * So the unresolved arm is the SHAPE of the identity, not a guess at its content — a title-width skeleton
 * and no roster chip (a "0" is the same lie in a smaller box), inside an `aria-busy` row so the state is
 * audible as well as visible. The resolved arm is untouched. NOT fixed by seeding the cache from the row
 * that launched the room: a chat SUMMARY is not `getChat`'s shape, and writing a partial one into that key
 * trades a visible lie for an invisible one. A room created here still paints its real title on the first
 * frame — `useStartChat` seeds this exact key from `startChat`'s own response.
 */
export function ChatHeaderSurface({ chatId }: ChatHeaderSurfaceProps): ReactElement {
  const { characters, participantsLabel, roomName, createdAt, resolved, viewerIsHost } = useCommittedIdentity(chatId);

  if (!resolved) {
    return (
      <Row gap="row" align="center" aria-busy={true} className="shell-chat-header-lead grow min-inline-0">
        {/* The identity's own footprint, capped on the container scale (never a raw width): it grows with
            the lead and stops where a title would. */}
        <Skeleton cap="paneSm" width="full" height="control" data-slot="chat-header-pending" />
      </Row>
    );
  }

  return (
    <Row gap="row" align="center" className="min-inline-0">
      {/* The identity lead (avatars + title) steps aside on a phone, where the screen title names the room and
          only the chips stay. */}
      <Row gap="row" align="center" className="shell-chat-header-lead min-inline-0">
        <CharacterAvatars characters={characters} />
        <ChatHeaderTitle chatId={chatId} label={participantsLabel} roomName={roomName} createdAt={createdAt} canRename={viewerIsHost} />
      </Row>
    </Row>
  );
}

/** The roster CHIP itself — the `Users` glyph + the seat count. Its accessible name carries the count (the
 *  visible digit is `aria-hidden`, so the name is the only place a screen reader learns the number). */
function RosterChipButton({ count, onClick }: { readonly count: number; readonly onClick: () => void }): ReactElement {
  return (
    <Button
      type="button"
      // The actionable chip lifts its ink (colour, not the border: a `soft` Badge draws the same hairline).
      variant="outline"
      shape="pill"
      size="sm"
      aria-label={`Members — ${count}`}
      className="shrink-0"
      touchFloor="inline"
      onClick={onClick}
    >
      <Icon icon={Users} size="sm" />
      <Text as="span" voice="label" className="shell-chat-chip-count" ink="inherit" aria-hidden={true}>
        {String(count)}
      </Text>
    </Button>
  );
}

/**
 * The topbar members entry — the ONE roster doorway (chat-header §2/§9). It is a `topbar.trail` widget now, so the
 * trail's overflow row moves it into the "More top bar actions" menu when the header does not fit. It always opens
 * the Members context tab. Its resting place is the trail at every width; it used to sit in the header lead.
 *
 * SUPERSESSION (#162, owner-ruled 2026-08-18). It used to FORK: a group opened the Members tab, and a SOLO
 * chat opened a compact `SoloRosterMenu` popover here. That popover existed because the Members tab was
 * SIZE-GATED; with one roster surface for every room state a second one in the topbar is a fork, so it was deleted.
 */
export function RoomRosterChip(): ReactElement | null {
  const { chatId, resolved, memberCount } = useRoomRoster();
  if (chatId === null || !resolved) {
    return null;
  }
  return <RosterChipButton count={memberCount} onClick={openMembersTab} />;
}

/** The memory-recall slot — a STABLE topbar control (#313), reflecting the current turn's recall phase (idle /
 *  recalling… / retrieved N), never a per-message chip. A `topbar.trail` widget, after the roster chip, so it overflows first. */
export function RoomRecallChip(): ReactElement | null {
  const { chatId, resolved, viewerIsHost } = useRoomRoster();
  if (chatId === null || !resolved) {
    return null;
  }
  return <ChatRecallIndicator chatId={chatId} viewerIsHost={viewerIsHost} />;
}

/** The lead character's face, for a ONE-character room. A group room's faces live in the cast row under the
 *  topbar (one home for the cast), so the header carries only the names there. */
function CharacterAvatars({ characters }: { readonly characters: readonly CharacterParticipant[] }): ReactElement | null {
  const lead = characters[0];
  if (characters.length !== 1 || lead === undefined) {
    return null;
  }
  return (
    <Avatar
      size="sm"
      className="shell-chat-header-avatar"
      fallbackDelay={0}
      hueSeed={lead.characterId}
      {...(lead.avatarHash === null ? {} : { src: blobUrl(lead.avatarHash) })}
    >
      {initialsFor(lead.displayName)}
    </Avatar>
  );
}

// The CONTEXT-panel band identity (`ChatContextHeader`, north-star §4 N4/P4) was DELETED with CP-1's
// header de-dup (the topbar owns identity; the band reduces to neutral chrome
// §1 Q3). CP-4's scene banner is a NEW component, not a resurrection — git history holds the old one.
//
// `DraftChatHeader` (the pre-send twin: founding-card avatars, `draftChatTitle`, a `1 + characters` seat count,
// and a list-first card peek to beat the ~2s "? | ? | ? | New chat" placebo window) was DELETED 2026-08-14
// with draft mode — the room has a roster from the creation click, and `useStartChat` seeds this exact
// `getChat` key from `startChat`'s own response, so the committed header is correct on the first frame with
// zero extra reads. That is strictly better than the peek it replaces.
