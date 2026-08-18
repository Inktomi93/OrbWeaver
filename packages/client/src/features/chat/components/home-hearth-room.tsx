// The HEARTH — home's resume-room hero (program #102, mockup variant C `.fire`). The one room you would
// actually pick up, at focal weight: its title at the headline step, the last line anyone said in it, who
// is in it, and one Resume affordance.
//
// IT IS THE SURFACE'S ONE FOCAL ELEMENT (CD3), and the CD3 re-rule of 2026-08-16 is why it exists: home
// used to spend its single focal on the temp-chat primary — a button that makes a room which deletes
// itself in a day — while six live rooms sat at list weight beside it. The owner moved the focal here
// (#102, the variant-C pick); temp chat is a secondary button now.
//
// THE SPEAKER STRIPE IS GONE (rail sweep P2-5, 2026-08-17), and it was a LAW violation, not a taste call:
// a 3px chromatic border on ONE edge of a rounded card is `side-tab` AND `border-accent-on-rounded` in
// `design-audit-checks.ts` — the two impeccable accent-border rules, both absolute, and the audit's own
// detector missed it (routed as an audit-detector finding on the same sweep). The focal is now carried by
// the two SANCTIONED carriers alone: the elevated island (`--radius-card` + `--shadow-overlay`, the Card
// primitive's own opt-in) and the rationed `--shadow-glow` on a `::before` layer, resting at 0.6 rather
// than the 0.3 that made it invisible in a screenshot. The pseudo-element is not decoration-by-preference:
// the same checks classify a chromatic glow on an element's OWN box-shadow as the generated-UI tell, and
// the ::before is the sanctioned carrier. It never sits behind reading text (it rides the edge at -1px).
//
// EVERY COLOUR HERE IS A PER-THEME TOKEN, not a Hearth literal: the glow token resolves per theme, and to
// the scope's own primary under an imported one. "Hearth Room" is the REGISTER, never a palette.
//
// IT CARRIES EACH FACT ONCE (rail sweep P2-6). The island shipped with a 3-face 64px cover-crop strip AND
// the mono cast line (the same cast twice, one of them illegible at that crop), and with a
// "· LAST TURN 2W AGO" stamp under a masthead sentence that already read "You left off 2w ago in …" (the
// same instant twice, 90px apart). The strip is deleted and the stamp is the masthead's alone; the cast
// line is the island's ONE cast rendering and no longer truncates, because nothing shares its row.
//
// A11y follows the `ListRow clickable` model rather than inventing one: the island is the operable thing
// (`Card interactive` — role=button + Enter/Space) and the excerpt + the cast line ride
// `aria-describedby`. A heading inside a button is not addressable by AT, so the title is
// `Text voice="focal"`; the block's own `h2` comes from the home tile band above it.
//
// ITS NAME IS A VERB, not the room (side-eye 2026-08-16 F5). "The room title alone" is what a ListRow's
// name is, and it was wrong for the ONE island on the surface you are meant to act on: `Resume <room>`
// matches the visible affordance and tells AT what activation does. The trailing "→" is `aria-hidden` for
// the same reason every other arrow on home is: a glyph is not part of an affordance's name.

import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Card } from "@orb/ui/card";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId } from "react";
import { TrailingArrow } from "#components";
import { castCredit, chatSummaryRowView } from "../lib/chat-summary-row.ts";

type HearthChat = Parameters<typeof chatSummaryRowView>[0];

/** The rationed accent glow, on the sanctioned ::before carrier — and, since the speaker STRIPE went (see
 *  the header), the island's only accent. `rounded-(--radius-card)` mirrors the elevated island radius the
 *  Card itself resolves, so the halo tracks the edge it is a halo for; the literal `rounded-card` utility is
 *  the ELEVATED-family step the density A1 arm reserves for the sealed ui package, and a feature spelling it
 *  would reach past the tier that already answered.
 *
 *  IT RESTS LOUDER NOW (rail sweep P2-11): at `opacity-30` the halo was invisible in a screenshot, so the
 *  focal was carried entirely by the banned stripe. `opacity-60` at rest, full on hover — the rationed glow
 *  doing the job the stripe was doing illegally. */
const GLOW =
  "relative isolate before:pointer-events-none before:absolute before:-inset-px before:-z-10 before:rounded-(--radius-card) before:opacity-60 before:shadow-glow before:transition-opacity before:duration-(--motion-base) before:ease-out-expo before:content-[''] hover:before:opacity-100";

export function HomeHearthRoom({ chat, onResume }: { readonly chat: HearthChat; readonly onResume: (chatId: ChatId) => void }): ReactElement {
  const { title, subtitle } = chatSummaryRowView(chat);
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
      className={`group ${GLOW}`}
      data-home-hearth={chat.id}
      // THE ELEVATED ISLAND (rail sweep P2-11). The hero is the ONE thing home wants a cold eye to land
      // on, and it was a form-tier box with a banned accent stripe doing the shouting. `elevated` is the
      // primitive's own floating-island opt-in — `--radius-card` + `--shadow-overlay` — which is a
      // sanctioned carrier and reads at a glance in a screenshot; the stripe was neither.
      elevated={true}
      interactive={true}
      onClick={(): void => onResume(chat.id)}
    >
      {/* ONE COLUMN, NO ART. The cast strip is gone (rail sweep P2-5/P2-6): three 64px cover-CROPS of
          portraits are illegible at that size, and every seat in them was already spelled out, in order,
          in the credit line two rows below — the island rendered its cast twice and its recency twice
          (the masthead sentence directly above carries the age). What the hero owes is the room's NAME,
          the line you left on, who is in it, and one affordance. So the column IS the island now, which
          also retires the `@md` stack-vs-row split the strip forced at a narrow pane. */}
      <Stack className="min-w-0" gap="row">
        <Row gap="row">
          {/* CLAMPED, NEVER TRUNCATED (side-eye F7). At the 430px coarse mount `truncate` rendered
              "Example — …" — the one string on the surface that says WHICH room you are resuming, ellipsed
              to nothing. Two lines is the honest budget: enough to identify any room the corpus produces,
              not enough to become a paragraph at the focal step. */}
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
        <Row align="center" gap="row" justify="between">
          {/* THE CREDIT LINE (side-eye F12/F15) — the island's ONE cast rendering now that the face strip
              is gone, and therefore no longer truncated: it used to clip because a 136px strip and a
              stamp span shared the row with it. `credit` is the mock's own register (mono, caps, tracked,
              muted) at the LABEL step, not micro — this line sits inside the hero's own button, so it is
              interactive text and 10.5px would be under the readable floor.
              NO STAMP HERE ANY MORE (rail sweep P2-6): "· LAST TURN 2W AGO" restated, in the same 90px of
              page, what the masthead sentence directly above the island already says ("You left off 2w ago
              in …"). One instant, one rendering — the masthead owns the sentence form (its own header
              carries the `formatRelativeAgo` ruling), and the hero owns the room. */}
          <Text as="span" className="min-w-0 flex-1" id={castId} voice="credit">
            {cast}
          </Text>
          {/* NOT a nested button, and no longer dressed as one (rail sweep P3-17). The island IS the
              control; this was `text-primary` — link ink, inside a card whose whole surface is the
              affordance — so a user read it as "the link is over there" and the 700px of card beside it as
              inert. It is a HINT now: the muted credit register, lifting to full ink with the card's own
              hover, and the arrow nudges with it. The arrow itself is `aria-hidden` so the island's
              accessible name stays the verb phrase and not a glyph name. */}
          <Text
            as="span"
            className="shrink-0 text-muted-foreground transition-colors duration-(--motion-fast) ease-out-expo group-hover:text-foreground"
            voice="credit"
          >
            Resume <TrailingArrow className="inline-block transition-transform duration-(--motion-fast) ease-out-expo group-hover:translate-x-tight" />
          </Text>
        </Row>
      </Stack>
    </Card>
  );
}
