// The chat character bar: a thin read-only row of one chip per character participant, mounted above the
// transcript. Per-member controls live in the Members panel + speak-as in the composer — this strip is
// presence-at-a-glance only, no mutations. Size-gated: null unless the roster has >1 of a relevant kind
// (>1 character or >1 present human).
//
// ONE STRIP, ONE SOURCE (D166). It briefly had a DRAFT twin that
// read its seats from the founding CARDS, because a pre-send room had no roster and a group draft therefore
// showed no characters at all (side-eye P2, 2026-08-06). The room has a roster from the creation click — and
// `useStartChat` seeds this exact `getChat` key from `startChat`'s response — so the committed strip is
// populated on the first frame and the twin is gone. The read is non-suspense: the strip is decoration, so
// a cold cache degrades to null rather than blocking the transcript.
//
// #511 — ON A PHONE IT IS AN AVATAR STACK: THE NAMES GO `sr-only` AT A COARSE POINTER. Measured on the
// real room pane at a coarse pointer (chat-character-bar.ct.tsx carries the full matrix): a crowded-but-ordinary
// roster — two humans still named by their EMAIL plus four card-realistic character names — wrapped this
// strip to 3 rows / 100px at 430px, 4 rows / 130px at 390px and 5 rows / 160px at 320px. The tax GREW as
// the screen shrank, because the strip's answer to "no room" is to wrap and every wrapped row is taken from
// the transcript — the "the reason you opened the room is the smallest thing on screen" finding
// (side-eye 2026-08-22). Hiding the names at a coarse pointer makes it ONE row at every width and every
// roster size: a flat band instead of one that scales with narrowness.
//
// `sr-only`, NOT a removal: the name stays in the accessibility tree, so a screen-reader user loses
// nothing and the strip still announces WHO is in the room. What a sighted phone reader gets is the face —
// the avatar's image, or its initials over the per-character hue seed — which is the same identification
// the chat LIST rows already run on.
//
// The variant itself is NOT spelled here — axis-3 device capability is a shell/shared-layer concern
// (`no-pointer-variants-in-features`, UI-Architecture §4b), so this composes the named fragment
// `LABEL_TO_SR_ONLY_AT_COARSE` from `#components`. It is deliberately NOT `HIDE_AT_COARSE`: that one is
// `display:none`, which would drop the names out of the accessibility tree as well as out of the row.
//
// POINTER-CONDITIONAL, not width-conditional, for the reason `--spacing-touch-target` is: the phone is the
// host that has BOTH the scarce height (a topbar and a bottom tab bar bracket the room) and the reader
// holding the device a foot away, where a face reads faster than a name. A narrow DESKTOP window is
// narrow without being short, and it keeps its names.
//
// THE REFUSED ARMS (recorded so they are not re-minted): merging the character row into the TOPBAR would put a
// second roster read beside `chat-header`'s member-count chip (§13 single-homing) and reaches into shell
// chrome this component does not own; collapse-on-scroll leaves the worst case standing at first paint,
// which is exactly when the reader is deciding whether the room is worth their thumb.
//
// #490 — THE STRIP IS READ-ONLY AGAIN, WHICH IS WHAT THE PARAGRAPH ABOVE ALWAYS SAID. A host-only
// `AddMemberPopover` had been mounted here as a trailing "+", so "add a character" had TWO doors visible at
// the same time in the default room layout (this strip's glyph and the CONTEXT panel's CHARACTERS header glyph —
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
import { LABEL_TO_SR_ONLY_AT_COARSE } from "#components";
import { useTRPC } from "#data";
import { testId } from "#lib";
import { BG_PHOTO_BAND_PLATE } from "../lib/message-row-backing.ts";
import { filterCharacters, resolveHumanParticipants } from "../lib/roster.ts";

export interface ChatCharacterBarProps {
  readonly chatId: ChatId;
}

const HUMAN_CHIP_CAP = 5;

/** One rendered character seat — the minimal projection the strip paints. */
interface CharacterSeat {
  readonly key: string;
  /** The deterministic fallback-hue seed — the character id, so one entity is one colour everywhere. */
  readonly hueSeed: string;
  readonly displayName: string;
  readonly avatarHash: string | null;
  /** A muted seat (roster `disabled`). */
  readonly disabled: boolean;
}

/** THE character strip. */
function CharacterBarStrip({
  characters,
  humans,
}: {
  readonly characters: readonly CharacterSeat[];
  readonly humans: readonly ParticipantView[];
}): ReactElement | null {
  if (characters.length <= 1 && humans.length <= 1) {
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
      data-testid={testId("chatCharacterBar")}
      aria-label="Characters"
      role="group"
    >
      {(characters.length > 1 ? characters : []).map((member) => (
        <Row
          key={member.key}
          gap="row"
          align="center"
          data-slot="character-chip"
          data-muted={member.disabled ? "" : undefined}
          className={cn(member.disabled && "opacity-50")}
        >
          <Avatar size="sm" fallbackDelay={0} hueSeed={member.hueSeed} {...(member.avatarHash === null ? {} : { src: blobUrl(member.avatarHash) })}>
            {initialsFor(member.displayName)}
          </Avatar>
          {/* `pointer-coarse:sr-only` — the #511 avatar-stack arm (header). The name keeps its place in
              the accessibility tree; it simply stops spending the row's width on a phone. */}
          <Text as="span" className={cn(LABEL_TO_SR_ONLY_AT_COARSE, member.disabled && "text-muted-foreground")} voice="label">
            {member.displayName}
          </Text>
        </Row>
      ))}
      {humans.length > 1 ? <HumanChips humans={humans} /> : null}
    </Row>
  );
}

/** Seats from the same `chat.getChat` the message list + Context panel already read. */
export function ChatCharacterBar({ chatId }: ChatCharacterBarProps): ReactElement | null {
  const trpc = useTRPC();
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const roster = filterCharacters(chat?.participants ?? []);
  const humans = resolveHumanParticipants(chat?.participants ?? []);
  const characters: readonly CharacterSeat[] = roster.map((member) => ({
    key: member.id,
    hueSeed: member.characterId,
    displayName: member.displayName,
    avatarHash: member.avatarHash,
    disabled: member.disabled,
  }));
  return <CharacterBarStrip characters={characters} humans={humans} />;
}

function HumanChips({ humans }: { readonly humans: readonly ParticipantView[] }): ReactElement {
  const visible = humans.slice(0, HUMAN_CHIP_CAP);
  const overflow = humans.length - visible.length;
  return (
    <Row gap="row" align="center" aria-label="People" data-slot="character-bar-humans" role="group">
      {visible.map((member) => (
        <Row key={member.id} gap="row" align="center" data-slot="human-chip">
          <Avatar size="sm" fallbackDelay={0} hueSeed={member.id} {...(member.avatarHash === null ? {} : { src: blobUrl(member.avatarHash) })}>
            {initialsFor(member.displayName)}
          </Avatar>
          {/* Same #511 arm as the character chip — and this is where it earns most: a human seat is named
              by its EMAIL until a persona names it (#162), the widest chip the strip ever paints. */}
          <Text as="span" className={LABEL_TO_SR_ONLY_AT_COARSE} voice="label">
            {member.displayName}
          </Text>
          {member.role === "host" ? <Icon icon={Crown} size="xs" aria-label="Host" data-slot="host-crown" /> : null}
        </Row>
      ))}
      {overflow > 0 ? (
        <Text as="span" voice="gloss" className="font-mono">
          +{overflow}
        </Text>
      ) : null}
    </Row>
  );
}
