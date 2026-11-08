import { ThemeScope } from "@orb/ui/theme-scope";
import { SEED_THEME_VALUE_SETS, TOKENS } from "@orb/ui/tokens";
import type { ReactElement, ReactNode } from "react";

/** A seed palette (Hearth when absent) and, with `background`, a nested custom scope that takes the seed as its ambient. */
export interface SeedScopeProps {
  readonly theme?: keyof typeof SEED_THEME_VALUE_SETS;
  readonly background?: string;
}

/** The scope a primitive's CT mounts its cases in: the seed's page and ink, or a carried scope nested in it, as the shell root hands one down. */
export function SeedScope({ theme, background, children }: SeedScopeProps & { readonly children: ReactNode }): ReactElement {
  const ambient = theme === undefined ? undefined : SEED_THEME_VALUE_SETS[theme].vars;
  return (
    <div
      data-theme={theme}
      style={{ backgroundColor: `var(${TOKENS["color.background"].cssVar})`, color: `var(${TOKENS["color.foreground"].cssVar})`, padding: "1rem" }}
    >
      {background === undefined ? (
        children
      ) : (
        <ThemeScope
          tokens={{ background }}
          {...(ambient === undefined
            ? {}
            : { ambientBackground: ambient[TOKENS["color.background"].cssVar], ambientAccent: ambient[TOKENS["color.primary"].cssVar] })}
        >
          {children}
        </ThemeScope>
      )}
    </div>
  );
}
