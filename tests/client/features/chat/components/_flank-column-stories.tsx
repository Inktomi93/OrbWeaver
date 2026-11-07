import { CtClientProviders } from "@orb/testkit/browser";
import type { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";
import { useId, useRef } from "react";
import { FlankColumn } from "#client/features/chat/components/room-flank.tsx";
import type { FlankPresentation } from "#client/features/chat/hooks/use-flank-presentation.ts";

const NOOP = (): void => undefined;

/** The states a room's plugin column takes: out of the way, over the transcript, in the row as a panel, and in the row outside panel mode. */
const STATES = {
  parked: { panelMode: true, inline: false, expanded: false, occupiesRow: false, toggle: NOOP },
  overlaid: { panelMode: true, inline: false, expanded: true, occupiesRow: false, toggle: NOOP },
  inRowPanel: { panelMode: true, inline: true, expanded: true, occupiesRow: true, toggle: NOOP },
  band: { panelMode: false, inline: false, expanded: true, occupiesRow: true, toggle: NOOP },
} as const satisfies Record<string, FlankPresentation>;

/** The production flank column in one presentation state, in a clipped row, beside a probe of the overlay shadow. */
export function FlankColumnStory({ state, theme }: { readonly state: keyof typeof STATES; readonly theme?: keyof typeof SEED_THEME_VALUE_SETS }): ReactElement {
  const columnRef = useRef<HTMLDivElement>(null);
  const id = useId();
  return (
    <CtClientProviders>
      <div data-theme={theme}>
        {/* The shell grid owns the slide's motion variables, bound to the motion tokens; the grid's own tracks are not under test. */}
        <div
          className="relative flex overflow-x-clip"
          style={{
            blockSize: "12rem",
            inlineSize: "40rem",
            ["--shell-motion" as string]: `var(${TOKENS["motion.base"].cssVar})`,
            ["--shell-ease" as string]: `var(${TOKENS["ease.out-expo"].cssVar})`,
          }}
        >
          <FlankColumn columnRef={columnRef} flank={STATES[state]} id={id}>
            <span>Plugin panel</span>
          </FlankColumn>
        </div>
        <span
          data-probe="overlay-shadow"
          style={{ display: "block", blockSize: "1rem", inlineSize: "1rem", boxShadow: `var(${TOKENS["shadow.overlay"].cssVar})` }}
        />
      </div>
    </CtClientProviders>
  );
}
