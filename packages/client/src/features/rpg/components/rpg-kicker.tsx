// The ONE section-header voice for every rpg takeover tab (the mock's `.kicker` — micro caps · semibold ·
// micro tracking · muted, with the trailing hairline rule): Status "ROSTER — 3", Scene "ON STAGE — 2",
// Quests/Journal groups, the GM console sections. One anatomy ⇒ one type hierarchy across all tabs
// (section header > card title > field label > value > meta), all on the theme type-scale tokens.
// `crown` flips the crown-gold host-only voice; `trailing` hosts a section affordance (the
// hand-lock pin) between the text and the rule.

import { Row } from "@orb/ui/layout";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";

export interface RpgKickerProps {
  readonly children: ReactNode;
  /** Crown-gold host-only voice (highlight). @defaultValue false */
  readonly crown?: boolean;
  /** An affordance beside the text (the section lock pin) — sits before the rule. */
  readonly trailing?: ReactNode;
}

/** A muted letter-spaced caps section label with a trailing rule (the mock's `.kicker`). The rule is the
 *  `@orb/ui/separator` primitive (`flex-1` to fill the row) — never a hand-styled raw element in a feature. */
export function Kicker({ children, crown = false, trailing }: RpgKickerProps): ReactElement {
  return (
    <Row gap="field" align="center">
      {/* `voice="kicker"` IS this anatomy (micro · caps · semibold · micro tracking · muted) — the
          crown case only re-colours it, so the className carries the colour and nothing else. */}
      <Text voice="kicker" className={crown ? "text-highlight" : ""}>
        {children}
      </Text>
      {trailing}
      <Separator className="flex-1" />
    </Row>
  );
}
