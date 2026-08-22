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
//
// #490 — THE STRIP IS READ-ONLY AGAIN, WHICH IS WHAT THE PARAGRAPH ABOVE ALWAYS SAID. A host-only
// `AddMemberPopover` had been mounted here as a trailing "+", so "add a character" had TWO doors visible at
// the same time in the default room layout (this strip's glyph and the CONTEXT panel's CAST header glyph —
// `design-audit` `duplicate-action-door`, confirmed on the shot). §13 single-homing: two homes for one
// concept is a defect, not a convenience, and the tie-break is not taste — this file's own first paragraph
// declares "presence-at-a-glance only, no mutations", and §14 puts configuration in CONTEXT. So the door
// keeps its ONE home in `committed-members-tab.tsx` and the strip goes back to what it says it is.

import { blobUrl } from "@orb/contracts/assets";
import type { ParticipantView } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Crown, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { cn } from "@orb/ui/lib";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { testId } from "#lib";
import { BG_PHOTO_BAND_PLATE } from "../lib/message-row-backing.ts";
import { filterCharacters, resolveHumanParticipants } from "../lib/roster.ts";

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

/** THE cast strip. */
function CastBarStrip({ cast, humans }: { readonly cast: readonly CastSeat[]; readonly humans: readonly ParticipantView[] }): ReactElement | null {
  if (cast.length <= 1 && humans.length <= 1) {
    return null;
  }
  return (
    // OVER ART THE STRIP TAKES THE DERIVED BAND PLATE (#229/#237). It sits in `.shell-main`, which a
    // wallpaper makes transparent (shell.css), so its chips and names floated on the raw photo with only
    // the halo text-shadow behind them — the same over-art chrome class #106/#221 closed for the message
    // row's own bands, and the one rule #237 extends across the shell's chrome. `BG_PHOTO_BAND_PLATE`
    // pairs the polarity-derived plate with its matching ink and is inert without a wallpaper.
    <Row
      gap="field"
      align="center"
      className={cn("flex-wrap px-block py-row", BG_PHOTO_BAND_PLATE)}
      data-testid={testId("chatCastBar")}
      aria-label="Cast"
      role="group"
    >
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
  return <CastBarStrip cast={cast} humans={humans} />;
}

function HumanChips({ humans }: { readonly humans: readonly ParticipantView[] }): ReactElement {
  const visible = humans.slice(0, HUMAN_CHIP_CAP);
  const overflow = humans.length - visible.length;
  return (
    <Row gap="row" align="center" aria-label="People" data-slot="cast-bar-humans" role="group">
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
