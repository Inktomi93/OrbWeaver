import { CtIsolation } from "@orb/testkit/browser";
import { ListRow } from "@orb/ui/list-row";
import { Tabs, TabsList, TabsTab } from "@orb/ui/tabs";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

const ACCENT = "oklch(0.72 0.175 52)";
/** A mid-lightness carried page: a tint cannot sit far from it, so the ink on the tint has the least room. */
const CARRIED_MID_GREEN = "oklch(0.55 0.12 140)";

/** A selected ListRow and an active rail cell: both paint a tone tint under their label. */
function Marked(): ReactElement {
  return (
    <div style={{ backgroundColor: "var(--color-background)", padding: "1rem", inlineSize: "20rem" }}>
      <ListRow title="Connections" clickable={true} selected={true} />
      <Tabs defaultValue="active">
        <TabsList>
          <TabsTab layout="cell" value="active">
            Active cell
          </TabsTab>
          <TabsTab layout="cell" value="other">
            Other cell
          </TabsTab>
        </TabsList>
      </Tabs>
      {/* The two inks a tint could carry, resolved where the primary tone is stamped. */}
      <span data-probe="text-on-tint" data-tone="primary" style={{ color: "var(--color-tone-text-on-tint)" }}>
        probe
      </span>
      <span data-probe="page-ink" data-tone="primary" style={{ color: "var(--color-foreground)" }}>
        probe
      </span>
    </div>
  );
}

/** The marked pair inside a custom ThemeScope on a mid-lightness page, which picks an accent so the primary tone is judged. */
export function SelectedInkStory(): ReactElement {
  return (
    <CtIsolation subject="Selected ListRow and active Tabs cell" isolates="The ink each paints on its tone tint under a carried ThemeScope">
      <ThemeScope tokens={{ background: CARRIED_MID_GREEN, accent: ACCENT }}>
        <Marked />
      </ThemeScope>
    </CtIsolation>
  );
}

/** The marked pair under a seed palette, where the tone's text-on-tint and the page ink are different colours. */
export function SelectedInkSeedStory({ theme }: { readonly theme?: keyof typeof SEED_THEME_VALUE_SETS }): ReactElement {
  return (
    <CtIsolation subject="Selected ListRow and active Tabs cell" isolates="Which ink each paints on its tone tint under a seed palette">
      <div data-theme={theme}>
        <Marked />
      </div>
    </CtIsolation>
  );
}
