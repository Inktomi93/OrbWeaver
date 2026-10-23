import { CtIsolation } from "@orb/testkit/browser";
import type { ThemeScopeProps } from "@orb/ui/theme-scope";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";

export function ThemeBoundaryStory({
  tokens,
  outerTokens = {},
}: {
  readonly tokens: ThemeScopeProps["tokens"];
  readonly outerTokens?: ThemeScopeProps["tokens"];
}): ReactElement {
  return (
    <CtIsolation subject="ThemeScope token boundary" isolates="Public primitive parsing and nested CSS inheritance without application state">
      <ThemeScope tokens={outerTokens}>
        <ThemeScope tokens={tokens}>
          <p style={{ color: "var(--color-prose-body)" }}>Theme boundary reached.</p>
        </ThemeScope>
      </ThemeScope>
    </CtIsolation>
  );
}
