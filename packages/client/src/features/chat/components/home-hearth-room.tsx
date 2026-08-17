// The HEARTH — home's resume-room hero (program #102, mockup variant C `.fire`). The one room you would
// actually pick up, at focal weight: its cast's faces at hero scale, its title at the headline step, the
// last line anyone said in it, who is in it, how long ago, and one Resume affordance.
//
// IT IS THE SURFACE'S ONE FOCAL ELEMENT (CD3), and the CD3 re-rule of 2026-08-16 is why it exists: home
// used to spend its single focal on the temp-chat primary — a button that makes a room which deletes
// itself in a day — while six live rooms sat at list weight beside it. The owner moved the focal here
// (#102, the variant-C pick); temp chat is a secondary button now.
//
// THE FOCAL IS CARRIED BY STRIPE + GLOW, NOT BY ACCENT FILL. Measured on the mockup, accent-painted area
// is 0% of the viewport — the room reads as the loudest thing through a `--color-speaker` stripe at
// `--immersive-stripe-width` and the rationed `--shadow-glow` on a `::before` layer. The pseudo-element
// is not decoration-by-preference: `design-audit-checks.ts` classifies a chromatic glow on an element's
// OWN box-shadow as the generated-UI tell, and the ::before is the sanctioned carrier. It never sits
// behind reading text (it rides the island's edge at -1px).
//
// EVERY COLOUR HERE IS A PER-THEME TOKEN, not a Hearth literal: `--color-speaker` resolves to three
// different values across the built-in themes and to the scope's own primary under an imported one, and
// the glow token moves with it. "Hearth Room" is the REGISTER, never a palette.
//
// A11y follows the `ListRow clickable` model rather than inventing one: the island is the operable thing
// (`Card interactive` — role=button + Enter/Space) and the excerpt + the cast/age line ride
// `aria-describedby`. A heading inside a button is not addressable by AT, so the title is
// `Text voice="focal"`; the block's own `h2` comes from the home tile band above it.
//
// ITS NAME IS A VERB, not the room (side-eye 2026-08-16 F5). "The room title alone" is what a ListRow's
// name is, and it was wrong for the ONE island on the surface you are meant to act on: `Resume <room>`
// matches the visible affordance and tells AT what activation does. The same finding removed the cast
// strip from the accessible tree — the seats are already in the credit line the island is described by,
// and the stack was announcing each of them a second and third time through nested `img` roles.

import { blobUrl } from "@orb/contracts/assets";
import type { ChatId } from "@orb/kit/ids";
import { AvatarStack } from "@orb/ui/avatar-stack";
import { Badge } from "@orb/ui/badge";
import { Card } from "@orb/ui/card";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { CSSProperties, ReactElement } from "react";
import { useId } from "react";
import { timeLib } from "#lib";
import type { ChatRowPortrait } from "../lib/chat-summary-row.ts";
import { castCredit, chatSummaryRowView } from "../lib/chat-summary-row.ts";

type HearthChat = Parameters<typeof chatSummaryRowView>[0];

/** The cast strip's slot budget: three faces, then a "+N". The hero is a portrait of the ROOM, and a
 *  fourth 64px face pushes the title's column below its own measure at the 1280px pane. */
const CAST_SLOTS = 4;

/** The speaker stripe — the same three declarations the immersive chat rows paint (message-row-variants
 *  `STRIPE_LEFT`), inline because a border WIDTH from a non-spacing token has no utility. */
const STRIPE: CSSProperties = {
  borderInlineStartWidth: "var(--immersive-stripe-width)",
  borderInlineStartStyle: "solid",
  borderInlineStartColor: "var(--color-speaker)",
};

/** The rationed accent glow, on the sanctioned ::before carrier. `rounded-(--radius-card)` mirrors the
 *  form-tier island radius the Card itself resolves from `tiers.css`, so the halo tracks the edge it is
 *  a halo for; the literal `rounded-card` utility is the ELEVATED-family step the density A1 arm reserves
 *  for the sealed ui package, and a feature spelling it would reach past the tier that already answered. */
const GLOW =
  "relative isolate before:pointer-events-none before:absolute before:-inset-px before:-z-10 before:rounded-(--radius-card) before:opacity-30 before:shadow-glow before:transition-opacity before:duration-(--motion-base) before:ease-out-expo before:content-[''] hover:before:opacity-75";

export function HomeHearthRoom({
  chat,
  portraits,
  onResume,
}: {
  readonly chat: HearthChat;
  readonly portraits: readonly ChatRowPortrait[];
  readonly onResume: (chatId: ChatId) => void;
}): ReactElement {
  const { title, subtitle, when } = chatSummaryRowView(chat);
  const titleId = useId();
  const scentId = useId();
  const castId = useId();
  const cast = castCredit(chat.participantNames);
  return (
    <Card
      // THE NAME CARRIES THE VERB (side-eye 2026-08-16 F5). `aria-labelledby={titleId}` named the island
      // "The Ashen Spire" — a room, not an action — so the one operable thing on home announced as a noun
      // and a screen-reader user had to infer that activating it resumed anything. `Resume <room>` is the
      // same promise the visible "Resume →" affordance makes, which is also what keeps voice control
      // working (WCAG 2.5.3: the spoken name contains the read label).
      aria-describedby={`${scentId} ${castId}`}
      aria-label={`Resume ${title}`}
      className={GLOW}
      data-home-hearth={chat.id}
      interactive={true}
      onClick={(): void => onResume(chat.id)}
      style={STRIPE}
    >
      {/* STACKED AT A NARROW PANE (side-eye F7 — the review's first-listed arm, and the measured one).
          A 2-line clamp alone was not enough: at the 430px coarse mount the 136px cast strip left the text
          column 194px, so the room title still clamped to "Example — The Ashen…" AND the credit line ran
          under the Resume affordance. Above `@md` nothing changes; below it the art goes over the column
          and the column gets the island's full width, which is the only budget that fits both lines. */}
      <Row align="start" className="flex-col @md:flex-row" gap="block">
        {portraits.length === 0 ? null : (
          // DECORATIVE HERE, and only here (side-eye F5). The strip's seats are already spelled out, in
          // order, in the credit line below — which rides the island's own `aria-describedby` — so a named
          // stack made the hero announce its cast twice and its room name five times over. The stack keeps
          // its names everywhere it is the ONLY place they appear (a chats-list row); on the hero it is art.
          //
          // …and it is SQUARE art (the RULED question on this review): the mock draws the hero cast at
          // `--radius-base` while every other strip stays circular. Circles are chats-list vocabulary; the
          // hearth is a portrait of the room.
          <AvatarStack
            aria-hidden={true}
            className="shrink-0"
            items={portraits.map((seat) => ({ name: seat.name, ...(seat.hash === null ? {} : { src: blobUrl(seat.hash) }) }))}
            max={CAST_SLOTS}
            shape="rounded"
            size="hero"
          />
        )}
        <Stack className="w-full min-w-0 flex-1" gap="row">
          <Row gap="row">
            {/* CLAMPED, NEVER TRUNCATED (side-eye F7). At the 430px coarse mount the room title had ~300px
                of column beside a 136px cast strip and `truncate` rendered "Example — …" — the one string
                on the surface that says WHICH room you are resuming, ellipsed to nothing. Two lines is the
                honest budget: enough to identify any room the corpus produces, not enough to become a
                paragraph at the focal step. */}
            <Text as="span" className="line-clamp-2 min-w-0" id={titleId} voice="focal">
              {title}
            </Text>
            {chat.isGame ? (
              <Badge intent="neutral" size="sm" tone="soft">
                Game
              </Badge>
            ) : null}
          </Row>
          {/* The last line anyone said, at the reading step and capped at the reading measure — prose in a
              column wider than its own measure is a row with a hole in it. Two lines: enough to recognise
              the moment you left, not enough to become the transcript. */}
          <Text className="line-clamp-2 max-w-(--reading-measure)" id={scentId} voice="reading">
            {subtitle}
          </Text>
          <Row gap="row" justify="between">
            {/* THE CREDIT LINE (side-eye F12/F15). It was the `gloss` voice — 10.5px, sentence case, weight
                400 — carrying FULL character names, which made it two defects at once: interactive text
                under the readable floor, and the widest min-content contribution on the page (see
                `castCredit`). The `credit` voice is the mock's own register (mono, caps, tracked, muted) at
                the label step, and the names are short forms.
                THE CAST YIELDS, THE STAMP DOES NOT: at the label step a three-name cast already runs past
                the column, and ONE truncating span ellipsed the recency off the end ("… LAST TURN 2…") —
                the one datum in the line you actually came for. So it is two spans in one described
                group: the cast shrinks and clips, the stamp keeps its intrinsic width. The middot lives
                INSIDE the stamp because the accessible-description computation concatenates adjacent
                inline nodes with no separator (the ListRow `subtitleLead` precedent).
                READS "just now", NOT "NOW AGO" (stickler 2026-08-16 F1): `formatRelativeCompact` returns
                the WORD "now" for a sub-minute or future span, so composing it with a literal " ago" put
                "· LAST TURN NOW AGO" on the focal element the instant after a turn — the state the hero is
                most often seen in. `formatRelativeAgo` is the kit's sentence-ago form ("just now" / "<stamp>
                ago", no horizon), so the tense lives in the kit and the credit line never spells it. */}
            <Row className="min-w-0 flex-1" gap="row" id={castId}>
              <Text as="span" className="min-w-0 truncate" voice="credit">
                {cast}
              </Text>
              <Text as="span" className="shrink-0" voice="credit">
                · last turn {timeLib.formatRelativeAgo(when)}
              </Text>
            </Row>
            {/* NOT a nested button: the island is the control (see the header). This is its label, and
                the arrow is the same TEXT arrow every other "All chats →" affordance on home uses — the
                `@orb/ui/icons` export list is a curated seal, and one hero does not earn a new glyph. */}
            <Text as="span" className="shrink-0 text-primary" voice="label">
              Resume →
            </Text>
          </Row>
        </Stack>
      </Row>
    </Card>
  );
}
