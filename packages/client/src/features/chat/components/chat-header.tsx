// ChatHeaderSurface — the active chat's identity for the shell TOPBAR (UIP-202 / ux-flow-revamp J3).
// The route composes this into `AppShell`'s `header` slot for a COMMITTED chat, so the topbar shows the
// chat identity ONCE (killing the triple-title smell) while the shell stays domain-agnostic — it only
// forwards a ReactNode. The route passes this only for a committed chat, so a draft/none renders the
// shell's section-name default.
//
// THE FULL J3 IDENTITY HEADER (L4): a lead avatar (solo) or an `@orb/ui/avatar-stack` (a group of
// characters) · the chat title · a participant-count chip · the ⋯ `ChatOptionsMenu` (J6 chat-level
// actions). Avatars stay initials-only — the roster carries `avatarAssetId` but no client asset-URL
// resolver exists yet (#67/#21), so fabricating an image src would be invention (the AvatarStack `src`
// is deliberately omitted → its initials fallback). There is NO "scene"/description field anywhere in
// the chat data model, so the chip is an honest participant COUNT, never a fabricated scene label.
//
// SHARED-CACHE, NON-SUSPENSE (the ChatCastBar precedent): reads the SAME `chat.getChat` query the room
// already suspends on (usually warm), via a plain `useQuery` so the always-present topbar never suspends
// on its own account — it degrades to a neutral title until the cache populates.

import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Avatar } from "@orb/ui/avatar";
import { AvatarStack } from "@orb/ui/avatar-stack";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { initialsForAttribution } from "../lib/attribution";
import { resolveViewerIsHost } from "../lib/roster";
import { ChatOptionsMenu } from "./chat-options-menu";

export interface ChatHeaderSurfaceProps {
  /** A COMMITTED chat id — the route composes this only for a committed chat (a draft has no server row). */
  readonly chatId: ChatId;
}

/** A character participant (only characters carry an avatar/name in the identity cluster). */
type CharacterParticipant = ParticipantView & {
  readonly characterId: NonNullable<ParticipantView["characterId"]>;
};

function isCharacter(p: ParticipantView): p is CharacterParticipant {
  return p.kind === "character" && p.characterId !== null;
}

/** The topbar chat-identity header: character avatar(s) · title · participant-count chip · ⋯ options
 *  menu. Route-composed into `AppShell.header`. */
export function ChatHeaderSurface({ chatId }: ChatHeaderSurfaceProps): ReactElement {
  const trpc = useTRPC();
  // Non-suspense: the topbar must never suspend on its own account (the ChatCastBar pattern). Degrades
  // to a neutral title until the (usually warm) getChat cache populates.
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const title = chat?.title ?? "Untitled chat";
  const cast = (chat?.participants ?? []).filter(isCharacter);
  const characterIds: readonly CharacterId[] = cast.map((c) => c.characterId);
  const isHost = chat === undefined ? false : resolveViewerIsHost(chat.participants);

  return (
    <Row gap="row" align="center" justify="between" className="min-w-0">
      <Row gap="row" align="center" className="min-w-0">
        <CastAvatars cast={cast} />
        <Text size="title" weight="semibold" className="truncate">
          {title}
        </Text>
        {/* Honest participant COUNT chip (no scene field exists in the data model). */}
        {cast.length > 1 ? (
          <Text size="micro" tone="muted" transform="caps" className="whitespace-nowrap">
            {cast.length} characters
          </Text>
        ) : null}
      </Row>
      <ChatOptionsMenu
        chatId={chatId}
        title={chat?.title ?? null}
        characterIds={characterIds}
        isHost={isHost}
      />
    </Row>
  );
}

/** One avatar for a solo cast; an overlapping `AvatarStack` for a group (initials-only — no asset-URL
 *  resolver yet, #67/#21); nothing for an empty cast (an assistant-style chat). Split out to keep the
 *  header's render a flat expression (no nested ternary). */
function CastAvatars({
  cast,
}: {
  readonly cast: readonly CharacterParticipant[];
}): ReactElement | null {
  if (cast.length === 0) {
    return null;
  }
  if (cast.length === 1) {
    return (
      <Avatar size="sm" fallbackDelay={0}>
        {initialsForAttribution(cast[0]?.displayName ?? "")}
      </Avatar>
    );
  }
  return (
    <AvatarStack
      size="sm"
      items={cast.map((c) => ({ name: c.displayName }))}
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
  const names = results.map((r) => r.data?.name ?? "");
  const first = names[0]?.trim() ?? "";
  const title = first.length > 0 ? first : "New chat";
  return (
    <Row gap="row" align="center" className="min-w-0">
      <DraftCastAvatars names={names} />
      <Text size="title" weight="semibold" className="truncate">
        {title}
      </Text>
    </Row>
  );
}

/** The draft cast's avatar cluster — sourced from `character.get` NAMES (initials only; no asset-URL
 *  resolver yet, #67). Solo ⇒ one avatar; group ⇒ an `AvatarStack`; empty ⇒ nothing (a blank chat). */
function DraftCastAvatars({ names }: { readonly names: readonly string[] }): ReactElement | null {
  if (names.length === 0) {
    return null;
  }
  if (names.length === 1) {
    return (
      <Avatar size="sm" fallbackDelay={0}>
        {initialsForAttribution(names[0] ?? "")}
      </Avatar>
    );
  }
  return (
    <AvatarStack
      size="sm"
      items={names.map((name) => ({ name }))}
      aria-label={`${names.length} characters`}
    />
  );
}
