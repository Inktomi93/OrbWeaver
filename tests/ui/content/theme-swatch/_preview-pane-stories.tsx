import type { SeedScopeProps } from "@orb/testkit/browser";
import { CtIsolation, SeedScope } from "@orb/testkit/browser";
import { Card } from "@orb/ui/card";
import { Surface } from "@orb/ui/layout";
import { ThemePreviewPane } from "@orb/ui/theme-swatch";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

const FILLS = ["background", "accent", "sidebar", "sidebarEdge", "translucent"] as const;

// What each probe paints, so a pane reads against the colour or step it stands for.
const PROBES = {
  "bg-background": { backgroundColor: `var(${TOKENS["color.background"].cssVar})` },
  "bg-accent": { backgroundColor: `var(${TOKENS["color.accent"].cssVar})` },
  "bg-sidebar": { backgroundColor: `var(${TOKENS["color.sidebar"].cssVar})` },
  "bg-card": { backgroundColor: `var(${TOKENS["color.card"].cssVar})` },
  "bg-translucent": { backgroundColor: `var(${TOKENS["color.reading-plate"].cssVar})` },
  "ink-card": { color: `var(${TOKENS["color.card-foreground"].cssVar})` },
  "ink-accent": { color: `var(${TOKENS["color.accent-foreground"].cssVar})` },
  "ink-sidebar": { color: `var(${TOKENS["color.sidebar-foreground"].cssVar})` },
  "ink-plate": { color: `var(${TOKENS["color.reading-plate-foreground"].cssVar})` },
  "edge-tone": { borderColor: `var(${TOKENS["color.tone-edge"].cssVar})`, borderStyle: "solid" },
  "edge-sidebar": { borderColor: `var(${TOKENS["color.sidebar-border"].cssVar})`, borderStyle: "solid" },
  "radius-base": { borderRadius: `var(${TOKENS["radius.base"].cssVar})` },
  "radius-control": { borderRadius: `var(${TOKENS["radius.control"].cssVar})` },
  "radius-inset": { borderRadius: `var(${TOKENS["radius.inset"].cssVar})` },
  "pad-block": { padding: `var(${TOKENS["spacing.block"].cssVar})` },
  "pad-row": { padding: `var(${TOKENS["spacing.row"].cssVar})` },
} as const;

/** Every fill and shape of a pane, tier-less and inside an instrument Surface, beside probes. */
export function PreviewPaneStory(props: SeedScopeProps): ReactElement {
  return (
    <CtIsolation subject="ThemePreviewPane" isolates="Each fill and shape of a preview pane, tier-less and inside an instrument Surface, beside probes">
      <SeedScope {...props}>
        <div
          style={{
            display: "grid",
            gap: "0.5rem",
            backgroundColor: `var(${TOKENS["color.background"].cssVar})`,
            color: `var(${TOKENS["color.foreground"].cssVar})`,
          }}
        >
          {FILLS.map((fill) => (
            <ThemePreviewPane key={fill} data-case={`fill-${fill}`} fill={fill}>
              {fill}
            </ThemePreviewPane>
          ))}
          <ThemePreviewPane data-case="row" fill="background" shape="row">
            row
          </ThemePreviewPane>
          <ThemePreviewPane data-case="row-none" fill="background" padding="none" shape="row">
            row with no inset
          </ThemePreviewPane>
          <ThemePreviewPane data-case="inset" fill="background" shape="inset">
            inset
          </ThemePreviewPane>
          <ThemePreviewPane data-case="lifted" fill="sidebar" lifted={true} shape="inset">
            lifted
          </ThemePreviewPane>
          <Surface tier="instrument">
            <ThemePreviewPane data-case="tier-island" fill="background">
              island in a tier
            </ThemePreviewPane>
            <ThemePreviewPane data-case="tier-row" fill="background" padding="none" shape="row">
              row in a tier
            </ThemePreviewPane>
          </Surface>
          {/* An elevated card always paints the overlay shadow, so its box-shadow is the one a lifted pane reads. */}
          <Card data-probe="lift" elevated={true}>
            lift
          </Card>
          {Object.entries(PROBES).map(([name, probe]) => (
            <span key={name} data-probe={name} data-tone="neutral" style={{ display: "block", ...probe }} />
          ))}
        </div>
      </SeedScope>
    </CtIsolation>
  );
}
