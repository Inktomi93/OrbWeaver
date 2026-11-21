import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { ThemeScope } from "@orb/ui/theme-scope";
import { SEED_THEME_VALUE_SETS, TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

/**
 * A solid primary button under the accent an author picked, on the page that paints it: a custom scope carrying its own
 * `background`, or an accent-only scope over a shipped palette (`theme`) as the shell root hands it down.
 */
export function AccentButtonStory({
  accent,
  background,
  theme,
}: {
  readonly accent: string;
  readonly background?: string;
  readonly theme?: keyof typeof SEED_THEME_VALUE_SETS;
}): ReactElement {
  const ambient = theme === undefined ? undefined : SEED_THEME_VALUE_SETS[theme].vars;
  return (
    <CtIsolation subject="Button" isolates="The solid steps a primary button paints under a ThemeScope accent">
      <div data-theme={theme} style={{ backgroundColor: `var(${TOKENS["color.background"].cssVar})`, padding: "1rem" }}>
        <ThemeScope
          tokens={background === undefined ? { accent } : { accent, background }}
          {...(ambient === undefined
            ? {}
            : { ambientBackground: ambient[TOKENS["color.background"].cssVar], ambientAccent: ambient[TOKENS["color.primary"].cssVar] })}
        >
          <Button tone="primary" variant="solid">
            Save
          </Button>
        </ThemeScope>
      </div>
    </CtIsolation>
  );
}
