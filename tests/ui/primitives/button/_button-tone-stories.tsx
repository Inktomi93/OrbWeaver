import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

const EDGE = `var(${TOKENS["color.tone-edge"].cssVar})`;
const SOLID = `var(${TOKENS["color.tone-solid"].cssVar})`;
const TEXT = `var(${TOKENS["color.tone-text"].cssVar})`;
const TEXT_ON_TINT = `var(${TOKENS["color.tone-text-on-tint"].cssVar})`;

/** A resting and a selected outline row on the selection rail, beside probes for the neutral edge and the primary solid. */
export function SelectionRailStory(): ReactElement {
  return (
    <CtIsolation subject="Button selection rail" isolates="The rail row's tone at rest and when selected">
      <Button variant="outline" selection="rail">
        resting row
      </Button>
      <Button variant="outline" selection="rail" data-selected="">
        selected row
      </Button>
      <span data-probe="neutral-edge" data-tone="neutral" style={{ color: EDGE }} />
      <span data-probe="primary-solid" data-tone="primary" style={{ color: SOLID }} />
    </CtIsolation>
  );
}

/** A neutral outline and a neutral ghost button inside an info soft card, beside probes for the inks each should take. */
export function HostInkStory(): ReactElement {
  return (
    <CtIsolation subject="Button host ink" isolates="Which fill-less style takes its host's ink inside a soft tone card">
      <Card tone="info" variant="soft">
        <Button variant="outline">outline in a card</Button>
        <Button variant="ghost">ghost in a card</Button>
        <span data-probe="info-text-on-tint" data-tone="info" style={{ color: TEXT_ON_TINT }} />
      </Card>
      <span data-probe="neutral-text" data-tone="neutral" style={{ color: TEXT }} />
    </CtIsolation>
  );
}
