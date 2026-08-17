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
// (`Card interactive` — role=button + Enter/Space), its NAME is the room title alone, and the excerpt +
// the cast/age line ride `aria-describedby`. A heading inside a button is not addressable by AT, so the
// title is `Text voice="focal"`; the block's own `h2` comes from the home tile band above it.

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
import { chatSummaryRowView } from "../lib/chat-summary-row.ts";

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
  const cast = chat.participantNames.length > 0 ? chat.participantNames.join(" · ") : "No characters";
  return (
    <Card
      aria-describedby={`${scentId} ${castId}`}
      aria-labelledby={titleId}
      className={GLOW}
      data-home-hearth={chat.id}
      interactive={true}
      onClick={(): void => onResume(chat.id)}
      style={STRIPE}
    >
      <Row align="start" gap="block">
        {portraits.length === 0 ? null : (
          <AvatarStack
            aria-label={cast}
            className="shrink-0"
            items={portraits.map((seat) => ({ name: seat.name, ...(seat.hash === null ? {} : { src: blobUrl(seat.hash) }) }))}
            max={CAST_SLOTS}
            size="hero"
          />
        )}
        <Stack className="min-w-0 flex-1" gap="row">
          <Row gap="row">
            <Text as="span" className="min-w-0 truncate" id={titleId} voice="focal">
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
            <Text as="span" className="min-w-0 truncate" id={castId} voice="gloss">
              {cast} · last turn {timeLib.formatRelativeCompact(when)} ago
            </Text>
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
