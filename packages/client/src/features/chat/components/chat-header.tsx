// ChatHeaderSurface — the active chat's identity for the shell TOPBAR (UIP-202 / ux-flow-revamp J3).
// The route composes this into `AppShell`'s `header` slot for a COMMITTED chat, so the topbar shows the
// chat identity ONCE (killing the triple-title smell) while the shell stays domain-agnostic — it only
// forwards a ReactNode. The route passes this only for a committed chat, so a draft/none renders the
// shell's section-name default.
//
// THE FULL J3 IDENTITY HEADER (L4): a lead avatar (solo) or an `@orb/ui/avatar-stack` (a group of
// characters) · the chat title · a participant-count chip · the ⋯ `ChatOptionsMenu` (J6 chat-level
// actions). Avatars render real images via `ParticipantView.avatarHash`/`blobUrl` (#67) with initials as
// the load-failure/missing-avatar fallback (`Avatar`'s built-in behavior — never a manual branch here).
// There is NO "scene"/description field anywhere in the chat data model, so the chip is an honest
// participant COUNT, never a fabricated scene label.
//
// SHARED-CACHE, NON-SUSPENSE (the ChatCastBar precedent): reads the SAME `chat.getChat` query the room
// already suspends on (usually warm), via a plain `useQuery` so the always-present topbar never suspends
// on its own account — it degrades to a neutral title until the cache populates.

import { blobUrl } from "@orb/contracts/assets";
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
import { ChatOptionsMenu } from "./chat-options-menu";

export interface ChatHeaderSurfaceProps {
  /** A COMMITTED chat id — the route composes this only for a committed chat (a draft has no server row). */
  readonly chatId: ChatId;
}

/** A character participant (only characters carry an avatar/name in the identity cluster). `Omit` (not a
 *  same-key intersection — a known TS assignability footgun that gets harder for the checker to prove as
 *  `ParticipantView` grows optional fields, silently losing the `.filter` narrow). */
type CharacterParticipant = Omit<ParticipantView, "characterId"> & {
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
  // The explicit cast (not relying on the `.filter` narrowing overload) sidesteps a TS generic-inference
  // limitation: as `ParticipantView` grows optional fields (`renderPolicy?`/`themeOverride?`), the checker
  // stops proving `CharacterParticipant extends ParticipantView` for the `filter<S extends T>` overload
  // and silently falls back to the non-narrowing one. `isCharacter` still does the real runtime filtering.
  const cast = (chat?.participants ?? []).filter(isCharacter) as readonly CharacterParticipant[];
  const characterIds: readonly CharacterId[] = cast.map((c) => c.characterId);
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
