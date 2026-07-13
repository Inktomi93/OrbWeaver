// ChatHeaderSurface — the active chat's identity for the shell TOPBAR (UIP-202 / ux-flow-revamp J3).
// The route composes this into `AppShell`'s `header` slot for a COMMITTED chat, so the topbar shows the
// chat identity ONCE (killing the triple-title smell) while the shell stays domain-agnostic — it only
// forwards a ReactNode. The route passes this only for a committed chat, so a draft/none renders the
// shell's section-name default.
//
// THE FULL J3 IDENTITY HEADER (L4): a lead avatar (solo) or an `@orb/ui/avatar-stack` (a group of
// characters) · the chat title · the MEMBER-COUNT chip · the ⋯ `ChatOptionsMenu` (J6 chat-level
// actions). Avatars render real images via `ParticipantView.avatarHash`/`blobUrl` (#67) with initials as
// the load-failure/missing-avatar fallback (`Avatar`'s built-in behavior — never a manual branch here).
// There is NO "scene"/description field anywhere in the chat data model, so the chip is an honest
// participant COUNT, never a fabricated scene label.
//
// THE MEMBER-COUNT CHIP IS A BUTTON (FINAL-Chat-Tab-Redesign §6.1): it counts the PRESENT participants
// (humans + characters — the Members panel's own population) and TOGGLES the CONTEXT panel — a §5.1
// leaf writer (`setPanelMode` for the active section; on open it also points the `contextTab` seam at
// "members" so the chip is the canonical 1-click way into the Members panel; the surface's §7 ONE rule
// falls back to Overrides where Members doesn't render). Accessible name: "Members — N".
//
// SHARED-CACHE, NON-SUSPENSE (the ChatCastBar precedent): reads the SAME `chat.getChat` query the room
// already suspends on (usually warm), via a plain `useQuery` so the always-present topbar never suspends
// on its own account — it degrades to a neutral title until the cache populates.

import { blobUrl } from "@orb/contracts/assets";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Avatar } from "@orb/ui/avatar";
import { AvatarStack } from "@orb/ui/avatar-stack";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve Icon/Users fine (the shell-topbar.tsx precedent).
import { Icon, Users } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { setContextTab, setPanelMode, usePanelOverride } from "#state";
import { initialsForAttribution } from "../lib/attribution";
import { filterCharacters } from "../lib/roster";
import { ChatOptionsMenu } from "./chat-options-menu";

export interface ChatHeaderSurfaceProps {
  /** A COMMITTED chat id — the route composes this only for a committed chat (a draft has no server row). */
  readonly chatId: ChatId;
  /** `/api/auth/config.multiHumanCapable` (route-threaded, PD-106) — forwarded to the ⋯ menu's
   *  membership rows; single-user installs render none of them. */
  readonly multiHumanCapable?: boolean;
}

/** A character participant (only characters carry an avatar/name in the identity cluster) — the
 *  `filterCharacters` (../lib/roster) element type, derived locally (the type itself isn't exported
 *  there — feature types don't live in a feature `lib/`, `no-inline-types`). */
type CharacterParticipant = ReturnType<typeof filterCharacters>[number];

/** The topbar chat-identity header: character avatar(s) · title · participant-count chip · ⋯ options
 *  menu. Route-composed into `AppShell.header`. */
export function ChatHeaderSurface({
  chatId,
  multiHumanCapable = false,
}: ChatHeaderSurfaceProps): ReactElement {
  const trpc = useTRPC();
  // Non-suspense: the topbar must never suspend on its own account (the ChatCastBar pattern). Degrades
  // to a neutral title until the (usually warm) getChat cache populates.
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const title = chat?.title ?? "Untitled chat";
  const cast = filterCharacters(chat?.participants ?? []);
  // The Members population: every PRESENT participant, human AND character (`leftSeq === null`).
  const memberCount = (chat?.participants ?? []).filter((p) => p.leftSeq === null).length;
  // The CONTEXT toggle (a §5.1 leaf writer): the persisted per-panel override is the only client-side
  // signal of the panel's user-chosen mode ("chats" boots context COLLAPSED, and LAW 3's runtime
  // default is also collapsed) — undefined therefore reads as closed, so the first click opens.
  const contextOverride = usePanelOverride("chats", "context");
  const toggleMembersPanel = (): void => {
    const isOpen = contextOverride === "docked" || contextOverride === "overlay";
    if (isOpen) {
      setPanelMode("context", "collapsed");
      return;
    }
    // Point the tab seam at Members BEFORE docking — the chip is the canonical way in (§6.1); the
    // surface's §7 ONE rule falls back to Overrides where Members doesn't render.
    setContextTab("members");
    setPanelMode("context", "docked");
  };
  // id + display name per character — seeds "New chat with same cast" AND the per-character gallery entries.
  const castMembers = cast.map((c) => ({ characterId: c.characterId, name: c.displayName }));
  // Host gate: the server-resolved, per-viewer `ChatDetail.viewerIsHost` (the ONE honest source, shared
  // with the CONTEXT panel) — `=== true` so a load-window `undefined` / a member reads NON-host and the
  // host-only ⋯ actions never flash. NOT the first-human-seat proxy, which mis-grants once a 2nd human
  // is seated.
  const isHost = chat?.viewerIsHost === true;

  return (
    <Row gap="row" align="center" justify="between" className="min-w-0">
      <Row gap="row" align="center" className="min-w-0">
        <CastAvatars cast={cast} />
        <Text size="title" weight="semibold" className="truncate">
          {title}
        </Text>
        {/* The member-count chip — an honest PRESENT-participant count that toggles CONTEXT to the
            Members tab (§6.1; accessible name "Members — N"). */}
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

/** One avatar for a solo cast; an overlapping `AvatarStack` for a group; nothing for an empty cast (an
 *  assistant-style chat). Real images via `avatarHash`/`blobUrl` (#67), initials as the Avatar's own
 *  missing-image fallback. Split out to keep the header's render a flat expression (no nested ternary). */
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
        // Seed the fallback hue off the character id (the SAME seed the message row + library card use) so
        // an imageless character reads the same color in the header as in the transcript — not the
        // constant `alt=""` bucket every un-seeded avatar used to share.
        hueSeed={lead.characterId}
        {...(lead.avatarHash === null ? {} : { src: blobUrl(lead.avatarHash) })}
      >
        {initialsForAttribution(lead.displayName)}
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
  /** The draft's founding cast (`DraftSeed.characterIds`) — a draft has no server row to read a roster
   *  from, so the identity is sourced from `character.get` per founding character. */
  readonly characterIds: readonly CharacterId[];
}

/** The DRAFT topbar identity (J2/J3): the seeded character avatar(s) + name + a "New thread" chip, so a
 *  new chat is character-first from frame one instead of an anonymous void. No `ChatOptionsMenu` — a draft
 *  has no chat-level actions yet. Non-suspense (the always-present topbar never suspends — the
 *  `ChatHeaderSurface` precedent), degrading to a neutral title until the (usually warm) reads populate. */
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

/** The draft cast's avatar cluster — sourced from `character.get` (name + avatarHash, #67). Solo ⇒ one
 *  avatar; group ⇒ an `AvatarStack`; empty ⇒ nothing (a blank chat). */
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
        {initialsForAttribution(lead.name)}
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
