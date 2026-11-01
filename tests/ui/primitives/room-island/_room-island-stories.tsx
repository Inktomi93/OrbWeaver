import { CtIsolation } from "@orb/testkit/browser";
import { Surface } from "@orb/ui/layout";
import { RoomIsland } from "@orb/ui/room-island";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";
import type { SeedScopeProps } from "../_seed-scope.tsx";
import { SeedScope } from "../_seed-scope.tsx";

/** An island in and out of an instrument tier, a field host, an armed drop target and a stack, beside role probes. */
export function RoomIslandStory(props: SeedScopeProps): ReactElement {
  return (
    <CtIsolation subject="RoomIsland" isolates="An island in and out of an instrument Surface, as a field host, as an armed drop target and as a stack">
      <SeedScope {...props}>
        <div
          style={{
            display: "grid",
            gap: "0.5rem",
            backgroundColor: `var(${TOKENS["color.background"].cssVar})`,
            color: `var(${TOKENS["color.foreground"].cssVar})`,
          }}
        >
          <RoomIsland data-case="island" ownSlot="test-island">
            island
          </RoomIsland>
          <Surface tier="instrument">
            <RoomIsland data-case="tier-island" ownSlot="test-island">
              island in a tier
            </RoomIsland>
          </Surface>
          <RoomIsland data-case="holds-field" holdsField={true} ownSlot="test-island">
            <input aria-label="field" />
          </RoomIsland>
          <RoomIsland data-case="drop-armed" data-drag-over="" dropTarget={true} ownSlot="test-island">
            armed
          </RoomIsland>
          <RoomIsland data-case="stack" layout="stack" ownSlot="test-island">
            stack
          </RoomIsland>
          <span data-probe="card" style={{ backgroundColor: `var(${TOKENS["color.card"].cssVar})`, display: "block" }} />
          <span
            data-probe="edge"
            data-tone="neutral"
            style={{ borderColor: `var(${TOKENS["color.tone-edge"].cssVar})`, borderStyle: "solid", display: "block" }}
          />
          <span data-probe="muted" style={{ backgroundColor: `var(${TOKENS["color.muted"].cssVar})`, display: "block" }} />
          <span data-probe="primary" style={{ borderColor: `var(${TOKENS["color.primary"].cssVar})`, borderStyle: "solid", display: "block" }} />
          <span
            data-probe="island"
            style={{ borderRadius: `var(${TOKENS["radius.card"].cssVar})`, padding: `var(${TOKENS["spacing.field"].cssVar})`, display: "block" }}
          />
        </div>
      </SeedScope>
    </CtIsolation>
  );
}
