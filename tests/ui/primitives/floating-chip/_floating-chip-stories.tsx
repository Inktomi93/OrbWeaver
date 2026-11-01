import { CtIsolation } from "@orb/testkit/browser";
import { Card } from "@orb/ui/card";
import { FloatingChip } from "@orb/ui/floating-chip";
import { Surface } from "@orb/ui/layout";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";
import type { SeedScopeProps } from "../_seed-scope.tsx";
import { SeedScope } from "../_seed-scope.tsx";

/** A shown and a hidden chip, in and out of an instrument tier, beside popover, edge, radius and shadow probes. */
export function FloatingChipStory(props: SeedScopeProps): ReactElement {
  return (
    <CtIsolation subject="FloatingChip" isolates="A shown and a hidden chip in and out of an instrument Surface, beside role probes">
      <SeedScope {...props}>
        <div
          style={{
            display: "grid",
            gap: "0.5rem",
            backgroundColor: `var(${TOKENS["color.background"].cssVar})`,
            color: `var(${TOKENS["color.foreground"].cssVar})`,
          }}
        >
          <FloatingChip data-case="shown" presence="shown">
            shown
          </FloatingChip>
          <FloatingChip data-case="hidden" presence="hidden">
            hidden
          </FloatingChip>
          <Surface tier="instrument">
            <FloatingChip data-case="tier-shown" presence="shown">
              shown in a tier
            </FloatingChip>
          </Surface>
          <span
            data-probe="popover"
            style={{ backgroundColor: `var(${TOKENS["color.popover"].cssVar})`, color: `var(${TOKENS["color.popover-foreground"].cssVar})`, display: "block" }}
          />
          <span
            data-probe="edge"
            data-tone="neutral"
            style={{ borderColor: `var(${TOKENS["color.tone-edge"].cssVar})`, borderStyle: "solid", display: "block" }}
          />
          <span data-probe="pill" style={{ borderRadius: `var(${TOKENS["radius.full"].cssVar})`, display: "block" }} />
          {/* An elevated card always paints the overlay shadow, so its box-shadow is the one a lifted box reads. */}
          <Card data-probe="lift" elevated={true}>
            lift
          </Card>
        </div>
      </SeedScope>
    </CtIsolation>
  );
}
