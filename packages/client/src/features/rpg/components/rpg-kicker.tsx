// The ONE section-header voice for every rpg takeover tab (the mock's `.kicker` — micro caps · semibold ·
// micro tracking · muted, with the trailing hairline rule): Status "CHARACTERS — 3", Scene "ON STAGE — 2",
// Quests/Journal groups, the GM console sections. One anatomy ⇒ one type hierarchy across all tabs
// (section header > card title > field label > value > meta), all on the theme type-scale tokens.
// `crown` flips the crown-gold host-only voice; `trailing` hosts a section affordance (the
// hand-lock pin) between the text and the rule.
// The label is a real h3, the rung every other `voice="kicker"` section heading in the client uses (the
// you-sheet, the member card viewer); the takeover panel is an `aside` with no heading of its own, so there is
// no h2 to nest under and h3 keeps the rung uniform across tabs.
// LANDMARK RULE: a Kicker section is a heading, never a region. The tab panel is the landmark (the context
// bracket names it), and the h3s are the navigation inside it.

import { Row } from "@orb/ui/layout";
import { Separator } from "@orb/ui/separator";
import { Heading } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";

export interface RpgKickerProps {
  readonly children: ReactNode;
  /** Crown-gold host-only voice (highlight). @defaultValue false */
  readonly crown?: boolean;
  /** An affordance beside the text (the section lock pin) — sits before the rule. */
  readonly trailing?: ReactNode;
}

/** A muted letter-spaced caps section heading with a trailing rule (the mock's `.kicker`). The rule is the
 *  `@orb/ui/separator` primitive (`flex-1` to fill the row) — never a hand-styled raw element in a feature. */
export function Kicker({ children, crown = false, trailing }: RpgKickerProps): ReactElement {
  return (
    <Row gap="field" align="center">
      {/* `voice="kicker"` IS this anatomy (micro · caps · semibold · micro tracking · muted) — the
          crown case only re-colours it, so the className carries the colour and nothing else. */}
      <Heading level={3} voice="kicker" className={crown ? "text-accolade" : ""}>
        {children}
      </Heading>
      {trailing}
      <Separator className="flex-1" />
    </Row>
  );
}
