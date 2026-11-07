import { CtIsolation } from "@orb/testkit/browser";
import { Section } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

const NARROW_HOST_PX = 160;

/** A kicker band with trailing content, at a width that fits it and at one that does not. */
export function SectionTrailingStory(): ReactElement {
  return (
    <CtIsolation subject="Section" isolates="The kicker band and its trailing slot">
      <Section data-probe="wide" kicker="Rewrite" trailing={<Text data-probe="wide-tally">three kept</Text>}>
        Body
      </Section>
      <div style={{ inlineSize: NARROW_HOST_PX }}>
        <Section kicker="Rewrite" trailing={<Text data-probe="narrow-tally">a tally too long for this band</Text>} />
      </div>
    </CtIsolation>
  );
}
