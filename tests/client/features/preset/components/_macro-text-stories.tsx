import { scanMacroRuns } from "@orb/kit/macro";
import { CtClientProviders } from "@orb/testkit/browser";
import type { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";
import { MacroText } from "#client/features/preset/components/macro-text.tsx";

const TEMPLATE = "You are {{char}} in a story with {{user}}.";

/** The production macro text in both frames, beside probes for the info tone's roles and the tight spacing step. */
export function MacroTextStory({ theme }: { readonly theme?: keyof typeof SEED_THEME_VALUE_SETS }): ReactElement {
  const tokens = scanMacroRuns(TEMPLATE);
  return (
    <CtClientProviders>
      <div data-theme={theme}>
        <div data-frame="quoted">
          <MacroText tokens={tokens} />
        </div>
        <div data-frame="bare">
          <MacroText frame="bare" tokens={tokens} />
        </div>
        <span data-probe="info-tint" data-tone="info" style={{ backgroundColor: `var(${TOKENS["color.tone-tint"].cssVar})` }} />
        <span data-probe="info-ink" data-tone="info" style={{ color: `var(${TOKENS["color.tone-text-on-tint"].cssVar})` }} />
        <span data-probe="tight" style={{ display: "block", inlineSize: `var(${TOKENS["spacing.tight"].cssVar})` }} />
      </div>
    </CtClientProviders>
  );
}
