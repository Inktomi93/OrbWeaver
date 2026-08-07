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
import { deriveChatTitle } from "../lib/chat-summary-row.ts";
import { draftMembersTabJustified, filterCharacters, membersTabJustified } from "../lib/roster.ts";
import { AddMemberPopover } from "./add-member-popover.tsx";

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
  // Hoisted to a binding: the members gate below needs it, and an object-literal property is not in
  // scope for its siblings.
  const viewerIsHost = chat?.viewerIsHost === true;
  return {
    cast,
    participants: present,
    viewerIsHost,
    title: deriveChatTitle(
      chat?.title ?? null,
      cast.map((c) => c.displayName),
    ),
    memberCount: present.length,
    membersJustified: membersTabJustified(participants, authConfig?.multiHumanCapable === true, viewerIsHost),
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

/** The roster CHIP itself — the `Users` glyph + the seat count, one spelling for both chat phases. Its
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

/** Open the Members context tab — the roster chip's action in a GROUP room, both phases. Entry-only: it
 *  never toggles closed (the collapse affordance is the context header's own control, D66 §2). */
function openMembersTab(): void {
  setContextTab("members" satisfies ChatContextTabId);
  setPanelMode("context", "docked");
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
  // GROUP: the entry opens the Members context tab.
  if (membersJustified) {
    return <RosterChipButton count={memberCount} onClick={openMembersTab} />;
  }

  // SOLO: no Members tab exists, so the entry is a compact roster popover instead of a dead tab link.
  return (
    <Popover>
      <PopoverTrigger render={<RosterChipButton count={memberCount} />} />
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

/** A pre-send draft's human seats: the viewer, alone. Nobody can be invited into a chat that has no row
 *  yet, so the count the chip shows is `1 + cast` — the same arithmetic the committed room's present-seat
 *  count produces for the room this draft becomes (a solo draft and its committed twin both read 2). */
const DRAFT_VIEWER_SEATS = 1;

/**
 * The draft identity (topbar LEAD): the founding cast's avatar(s), the room's title, and the roster chip.
 *
 * It says the SAME thing about the same concept as its committed twin (§13 one-home), which it did not
 * before: a GROUP draft was titled after `cast[0]` alone and carried no seat count, so a Hana + Kohaku
 * draft read "Hana Mizushima" and the second character was discoverable only by scrolling to their
 * greeting (side-eye P2, 2026-08-06). The title now runs through the SAME `deriveChatTitle` the committed
 * header uses — a draft carries no stored title, so it always resolves to the joined cast names.
 *
 * The chip renders only where a draft HAS a Members tab to open (`draftMembersTabJustified`, the shared
 * predicate the tab's own `when` reads) — below that floor it would be a control that opens a tab the
 * panel is hiding. A SOLO draft therefore still lacks the chip its committed twin shows; that residue is
 * reported, not papered over with a second roster surface.
 *
 * No options menu: that lives in the topbar TRAIL (`chat-options-topbar.tsx`), which serves both phases.
 */
export function DraftChatHeader({ characterIds }: DraftChatHeaderProps): ReactElement {
  const trpc = useTRPC();
  const results = useQueries({
    queries: characterIds.map((characterId) => trpc.character.get.queryOptions({ characterId })),
  });
  const cast = results.map((r) => ({
    name: r.data?.name ?? "",
    avatarHash: r.data?.avatarHash ?? null,
  }));
  // Names that have not landed yet are DROPPED, never joined as empty strings (which would render
  // "Hana Mizushima, " mid-load). An all-unresolved cast falls to the draft's own "New chat" copy —
  // `deriveChatTitle`'s "Untitled chat" is the committed room's word for a room that exists.
  const names = cast.map((c) => c.name.trim()).filter((name) => name.length > 0);
  const title = names.length > 0 ? deriveChatTitle(null, names) : "New chat";
  return (
    <Row gap="row" align="center" className="min-w-0">
      <ChatIdentityCluster avatars={<DraftCastAvatars cast={cast} />} title={title} />
      {draftMembersTabJustified(characterIds) ? <RosterChipButton count={DRAFT_VIEWER_SEATS + characterIds.length} onClick={openMembersTab} /> : null}
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
