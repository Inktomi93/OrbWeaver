// The chat CAST BAR (task #29 — the group roster GLANCE strip). A thin, READ-ONLY row of one chip per
// character participant (Avatar + name), mounted in the CONTENT region above the transcript
// (chat-room-surface.tsx) — NOT a shell region (the shell is domain-agnostic, UI-Arch §4.1; the cast bar
// is chat-domain content composed into the CONTENT slot the route already wires). Per-member CONTROLS
// (mute · talkativeness · force-turn) live in the CONTEXT-panel Roster tab (roster-panel.tsx) + speak-as
// in the composer (speak-as-select.tsx) — this strip is presence-at-a-glance only, no mutations.
//
// SIZE-GATED (D16 — solo is the roster-of-1 degenerate case, not an `isGroup` branch): renders `null`
// unless the roster has >1 of a RELEVANT kind (>1 character OR >1 present human — the §12 disclosure
// rule per kind), so a 1:1 chat shows no bar. A muted (`disabled`) member still appears, dimmed
// (`opacity-50`) — mute is passive arbitration exclusion, the member is still in the room.
//
// HUMAN CHIPS (FINAL-Chats §8.3 / redesign §6.2 — Wave 3): present human members render as presence
// chips AFTER the cast — same read, NO controls (controls live in the Members panel; the two-surface
// glance-vs-act split is deliberate), capped stack (overflow collapses to a "+N" tail), crown on the
// host (§13: "dimmed = muted, crown = host" is the bar's whole glance vocabulary).
//
// The roster read is `chat.getChat`'s `ChatDetail.participants` — the SAME query the message-list +
// CONTEXT panel already suspend on for this chat, so this shares the warm cache (no extra fetch). A
// non-suspense `useQuery` degrades to `null` until the cache is populated (a glance strip need not
// suspend the whole room); the room only mounts this for a COMMITTED chat (a draft has no server roster).

import { blobUrl } from "@orb/contracts/assets";
import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Avatar } from "@orb/ui/avatar";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve Crown/Icon fine (the shell-topbar.tsx precedent).
import { Crown, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { cn } from "@orb/ui/lib";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { testId } from "#lib";
import { initialsForAttribution } from "../lib/attribution";
import { filterCharacters, resolveHumanParticipants } from "../lib/roster";
import { AddMemberPopover } from "./add-member-popover";

export interface ChatCastBarProps {
  /** A COMMITTED chat id — the room mounts this only for a committed chat (a draft has no server roster). */
  readonly chatId: ChatId;
}

/** The human-chip overflow cap — presence at a glance, not a directory (the Members panel is). */
const HUMAN_CHIP_CAP = 5;

/** The read-only cast strip — character chips + (multi-human rooms) human presence chips; `null`
 *  below both per-kind disclosure floors (a second character or a second present human reveals it). */
export function ChatCastBar({ chatId }: ChatCastBarProps): ReactElement | null {
  const trpc = useTRPC();
  // Non-suspense: this glance strip degrades to `null` until the (usually already-warm) getChat cache
  // populates, rather than suspending the whole chat pane on its own account.
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const cast = filterCharacters(chat?.participants ?? []);
  const humans = resolveHumanParticipants(chat?.participants ?? []);

  // Size-gate per KIND (D16/§12): >1 character OR >1 present human reveals the bar; a 1:1 solo chat
  // shows nothing.
  if (cast.length <= 1 && humans.length <= 1) {
    return null;
  }

  // J7 add-member: the trailing "+" is HOST-only (the verb is host-gated server-side; mirror it so a
  // member never sees an affordance that would only NOT_FOUND). The server-resolved, per-viewer
  // `ChatDetail.viewerIsHost` (the ONE honest source, shared with the CONTEXT panel) — `=== true` so a
  // member reads NON-host; NOT the first-human-seat proxy, which mis-grants once a 2nd human is seated.
  const isHost = chat?.viewerIsHost === true;
  const existingCharacterIds: readonly CharacterId[] = cast.map((member) => member.characterId);

  return (
    <Row
      gap="field"
      align="center"
      className="flex-wrap px-block py-row"
      data-testid={testId("chatCastBar")}
      aria-label="Cast"
    >
      {/* Character chips reveal at >1 character (D16/§12 — per-kind disclosure); a solo-cast
          multi-human room shows only the human presence chips. */}
      {(cast.length > 1 ? cast : []).map((member) => (
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
      {humans.length > 1 ? <HumanChips humans={humans} /> : null}
    </Row>
  );
}

/** The human presence chips (§8.3) — capped stack, crown on the host, zero controls. */
function HumanChips({ humans }: { readonly humans: readonly ParticipantView[] }): ReactElement {
  const visible = humans.slice(0, HUMAN_CHIP_CAP);
  const overflow = humans.length - visible.length;
  return (
    <Row gap="row" align="center" aria-label="People" data-slot="cast-bar-humans">
      {visible.map((member) => (
        <Row key={member.id} gap="row" align="center" data-slot="human-chip">
          <Avatar
            size="sm"
            fallbackDelay={0}
            // Seed off the participant id — an imageless human still gets a deterministic color
            // (the Members-row precedent), never the shared blank bucket.
            hueSeed={member.id}
            {...(member.avatarHash === null ? {} : { src: blobUrl(member.avatarHash) })}
          >
            {initialsForAttribution(member.displayName)}
          </Avatar>
          <Text as="span" size="label" weight="medium">
            {member.displayName}
          </Text>
          {member.role === "host" ? (
            <Icon icon={Crown} size="xs" aria-label="Host" data-slot="host-crown" />
          ) : null}
        </Row>
      ))}
      {overflow > 0 ? (
        <Text as="span" size="micro" tone="muted" className="font-mono">
          +{overflow}
        </Text>
      ) : null}
    </Row>
  );
}
