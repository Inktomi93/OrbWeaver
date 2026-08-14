// The chat cast bar: a thin read-only row of one chip per character participant, mounted above the
// transcript. Per-member controls live in the Members panel + speak-as in the composer — this strip is
// presence-at-a-glance only, no mutations. Size-gated: null unless the roster has >1 of a relevant kind
// (>1 character or >1 present human).
//
// ONE STRIP, ONE SOURCE (chat-creation-draft-mode-replacement.md §4.1, R1). It briefly had a DRAFT twin that
// read its seats from the founding CARDS, because a pre-send room had no roster and a group draft therefore
// showed no cast at all (side-eye P2, 2026-08-06). The room has a roster from the creation click — and
// `useStartChat` seeds this exact `getChat` key from `startChat`'s response — so the committed strip is
// populated on the first frame and the twin is gone. The read is non-suspense: the strip is decoration, so
// a cold cache degrades to null rather than blocking the transcript.

import { blobUrl } from "@orb/contracts/assets";
import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Crown, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { cn } from "@orb/ui/lib";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useTRPC } from "#data";
import { testId } from "#lib";
import { filterCharacters, resolveHumanParticipants } from "../lib/roster.ts";
import { AddMemberPopover } from "./add-member-popover.tsx";

export interface ChatCastBarProps {
  readonly chatId: ChatId;
}

const HUMAN_CHIP_CAP = 5;

/** One rendered cast seat — the minimal projection the strip paints. */
interface CastSeat {
  readonly key: string;
  /** The deterministic fallback-hue seed — the character id, so one entity is one colour everywhere. */
  readonly hueSeed: string;
  readonly displayName: string;
  readonly avatarHash: string | null;
  /** A muted seat (roster `disabled`). */
  readonly disabled: boolean;
}

/** THE cast strip. `actions` is the add-member door (or null for a non-host). */
function CastBarStrip({
  cast,
  humans,
  actions,
}: {
  readonly cast: readonly CastSeat[];
  readonly humans: readonly ParticipantView[];
  readonly actions: ReactNode;
}): ReactElement | null {
  if (cast.length <= 1 && humans.length <= 1) {
    return null;
  }
  return (
    <Row gap="field" align="center" className="flex-wrap px-block py-row" data-testid={testId("chatCastBar")} aria-label="Cast">
      {(cast.length > 1 ? cast : []).map((member) => (
        <Row
          key={member.key}
          gap="row"
          align="center"
          data-slot="cast-chip"
          data-muted={member.disabled ? "" : undefined}
          className={cn(member.disabled && "opacity-50")}
        >
          <Avatar size="sm" fallbackDelay={0} hueSeed={member.hueSeed} {...(member.avatarHash === null ? {} : { src: blobUrl(member.avatarHash) })}>
            {initialsFor(member.displayName)}
          </Avatar>
          <Text as="span" size="label" weight="medium" tone={member.disabled ? "muted" : undefined}>
            {member.displayName}
          </Text>
        </Row>
      ))}
      {actions}
      {humans.length > 1 ? <HumanChips humans={humans} /> : null}
    </Row>
  );
}

/** Seats from the same `chat.getChat` the message list + Context panel already read. */
export function ChatCastBar({ chatId }: ChatCastBarProps): ReactElement | null {
  const trpc = useTRPC();
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const roster = filterCharacters(chat?.participants ?? []);
  const humans = resolveHumanParticipants(chat?.participants ?? []);
  const cast: readonly CastSeat[] = roster.map((member) => ({
    key: member.id,
    hueSeed: member.characterId,
    displayName: member.displayName,
    avatarHash: member.avatarHash,
    disabled: member.disabled,
  }));
  const isHost = chat?.viewerIsHost === true;
  const existingCharacterIds: readonly CharacterId[] = roster.map((member) => member.characterId);
  return (
    <CastBarStrip cast={cast} humans={humans} actions={isHost ? <AddMemberPopover chatId={chatId} existingCharacterIds={existingCharacterIds} /> : null} />
  );
}

function HumanChips({ humans }: { readonly humans: readonly ParticipantView[] }): ReactElement {
  const visible = humans.slice(0, HUMAN_CHIP_CAP);
  const overflow = humans.length - visible.length;
  return (
    <Row gap="row" align="center" aria-label="People" data-slot="cast-bar-humans">
      {visible.map((member) => (
        <Row key={member.id} gap="row" align="center" data-slot="human-chip">
          <Avatar size="sm" fallbackDelay={0} hueSeed={member.id} {...(member.avatarHash === null ? {} : { src: blobUrl(member.avatarHash) })}>
            {initialsFor(member.displayName)}
          </Avatar>
          <Text as="span" size="label" weight="medium">
            {member.displayName}
          </Text>
          {member.role === "host" ? <Icon icon={Crown} size="xs" aria-label="Host" data-slot="host-crown" /> : null}
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
