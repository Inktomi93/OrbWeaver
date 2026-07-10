// The chat CAST BAR (task #29 — the group roster GLANCE strip). A thin, READ-ONLY row of one chip per
// character participant (Avatar + name), mounted in the CONTENT region above the transcript
// (chat-room-surface.tsx) — NOT a shell region (the shell is domain-agnostic, UI-Arch §4.1; the cast bar
// is chat-domain content composed into the CONTENT slot the route already wires). Per-member CONTROLS
// (mute · talkativeness · force-turn) live in the CONTEXT-panel Roster tab (roster-panel.tsx) + speak-as
// in the composer (speak-as-select.tsx) — this strip is presence-at-a-glance only, no mutations.
//
// SIZE-GATED (D16 — solo is the roster-of-1 degenerate case, not an `isGroup` branch): renders `null`
// for a roster of ≤1 character, so a 1:1 chat shows no bar. A muted (`disabled`) member still appears,
// dimmed (`opacity-50`) — mute is passive arbitration exclusion, the member is still in the room.
//
// The roster read is `chat.getChat`'s `ChatDetail.participants` — the SAME query the message-list +
// CONTEXT panel already suspend on for this chat, so this shares the warm cache (no extra fetch). A
// non-suspense `useQuery` degrades to `null` until the cache is populated (a glance strip need not
// suspend the whole room); the room only mounts this for a COMMITTED chat (a draft has no server roster).

import { blobUrl } from "@orb/contracts/assets";
import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Avatar } from "@orb/ui/avatar";
import { Row } from "@orb/ui/layout";
import { cn } from "@orb/ui/lib";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { testId } from "#lib";
import { initialsForAttribution } from "../lib/attribution";
import { resolveViewerIsHost } from "../lib/roster";
import { AddMemberPopover } from "./add-member-popover";

export interface ChatCastBarProps {
  /** A COMMITTED chat id — the room mounts this only for a committed chat (a draft has no server roster). */
  readonly chatId: ChatId;
}

/** A character participant — narrowed from the roster (a human/agent/observer seat has no place here).
 *  `Omit` (not a same-key intersection — a known TS assignability footgun that gets harder for the
 *  checker to prove as `ParticipantView` grows optional fields, silently losing the `.filter` narrow). */
type CharacterParticipant = Omit<ParticipantView, "characterId"> & {
  readonly characterId: NonNullable<ParticipantView["characterId"]>;
};

function isCharacter(p: ParticipantView): p is CharacterParticipant {
  return p.kind === "character" && p.characterId !== null;
}

/** The read-only cast strip — one chip per character; `null` for a roster of ≤1 (solo). */
export function ChatCastBar({ chatId }: ChatCastBarProps): ReactElement | null {
  const trpc = useTRPC();
  // Non-suspense: this glance strip degrades to `null` until the (usually already-warm) getChat cache
  // populates, rather than suspending the whole chat pane on its own account.
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  // The explicit cast (not relying on the `.filter` narrowing overload) sidesteps a TS generic-inference
  // limitation: as `ParticipantView` grows optional fields (`renderPolicy?`/`themeOverride?`), the checker
  // stops proving `CharacterParticipant extends ParticipantView` for the `filter<S extends T>` overload
  // and silently falls back to the non-narrowing one. `isCharacter` still does the real runtime filtering.
  const cast = (chat?.participants ?? []).filter(isCharacter) as readonly CharacterParticipant[];

  // Size-gate (D16 roster-of-1): a solo chat shows no cast bar.
  if (cast.length <= 1) {
    return null;
  }

  // J7 add-member: the trailing "+" is HOST-only (the verb is host-gated server-side; mirror it so a
  // member never sees an affordance that would only NOT_FOUND). `chat` is defined here (cast came from it).
  const isHost = chat !== undefined && resolveViewerIsHost(chat.participants);
  const existingCharacterIds: readonly CharacterId[] = cast.map((member) => member.characterId);

  return (
    <Row
      gap="field"
      align="center"
      className="flex-wrap px-block py-row"
      data-testid={testId("chatCastBar")}
      aria-label="Cast"
    >
      {cast.map((member) => (
        <Row
          key={member.id}
          gap="row"
          align="center"
          data-slot="cast-chip"
          data-muted={member.disabled ? "" : undefined}
          className={cn(member.disabled && "opacity-50")}
        >
          <Avatar
            size="sm"
            fallbackDelay={0}
            // Seed off the character id (matching the transcript row + library card) so an imageless
            // member's chip is its own deterministic color, not the shared `alt=""` bucket.
            hueSeed={member.characterId}
            {...(member.avatarHash === null ? {} : { src: blobUrl(member.avatarHash) })}
          >
            {initialsForAttribution(member.displayName)}
          </Avatar>
          <Text as="span" size="label" weight="medium" tone={member.disabled ? "muted" : undefined}>
            {member.displayName}
          </Text>
        </Row>
      ))}
      {isHost ? (
        <AddMemberPopover chatId={chatId} existingCharacterIds={existingCharacterIds} />
      ) : null}
    </Row>
  );
}
