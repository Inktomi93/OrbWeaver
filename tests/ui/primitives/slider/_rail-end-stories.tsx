import { CtIsolation } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import { Slider, SliderRailEnd } from "@orb/ui/slider";
import type { ReactElement } from "react";

const FOLDED_PX = 300;
const WIDE_PX = 700;

function Cell({ probe, width }: { readonly probe: string; readonly width: number }): ReactElement {
  return (
    <div style={{ inlineSize: width }}>
      <Container>
        <Slider aria-label="Level" defaultValue={50} thumbLabels={["Level"]} />
        <SliderRailEnd data-probe={`${probe}-end`}>
          <span data-probe={`${probe}-value`}>1</span>
          <span data-probe={`${probe}-reset`}>2</span>
        </SliderRailEnd>
      </Container>
    </div>
  );
}

/** A value cluster under a slider, in a container narrower and wider than the knob grid's fold step. */
export function SliderRailEndStory(): ReactElement {
  return (
    <CtIsolation subject="SliderRailEnd" isolates="The cluster's end edge against the slider rail's, below and above the fold step">
      <Cell probe="folded" width={FOLDED_PX} />
      <Cell probe="wide" width={WIDE_PX} />
    </CtIsolation>
  );
}
