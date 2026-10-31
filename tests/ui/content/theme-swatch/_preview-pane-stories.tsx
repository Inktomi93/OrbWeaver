import { CtIsolation } from "@orb/testkit/browser";
import { Card } from "@orb/ui/card";
import { Surface } from "@orb/ui/layout";
import { ThemePreviewPane } from "@orb/ui/theme-swatch";
import type { ReactElement } from "react";
import type { SeedScopeProps } from "../../primitives/_seed-scope.tsx";
import { SeedScope } from "../../primitives/_seed-scope.tsx";

const FILLS = ["background", "accent", "sidebar", "sidebarEdge", "translucent"] as const;

// What each probe paints, so a pane reads against the colour or step it stands for.
const PROBES = {
  "bg-background": { backgroundColor: "var(--color-background)" },
  "bg-accent": { backgroundColor: "var(--color-accent)" },
  "bg-sidebar": { backgroundColor: "var(--color-sidebar)" },
  "bg-card": { backgroundColor: "var(--color-card)" },
  "bg-translucent": { backgroundColor: "color-mix(in oklab, var(--color-card) 80%, transparent)" },
  "ink-card": { color: "var(--color-card-foreground)" },
  "ink-accent": { color: "var(--color-accent-foreground)" },
  "ink-sidebar": { color: "var(--color-sidebar-foreground)" },
  "edge-tone": { borderColor: "var(--color-tone-edge)", borderStyle: "solid" },
  "edge-sidebar": { borderColor: "var(--color-sidebar-border)", borderStyle: "solid" },
  "radius-base": { borderRadius: "var(--radius-base)" },
  "radius-control": { borderRadius: "var(--radius-control)" },
  "radius-inset": { borderRadius: "var(--radius-inset)" },
  "pad-block": { padding: "var(--spacing-block)" },
  "pad-row": { padding: "var(--spacing-row)" },
} as const;

/** Every fill and shape of a pane, tier-less and inside an instrument Surface, beside probes. */
export function PreviewPaneStory(props: SeedScopeProps): ReactElement {
  return (
    <CtIsolation subject="ThemePreviewPane" isolates="Each fill and shape of a preview pane, tier-less and inside an instrument Surface, beside probes">
      <SeedScope {...props}>
        <div style={{ display: "grid", gap: "0.5rem", backgroundColor: "var(--color-background)", color: "var(--color-foreground)" }}>
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
