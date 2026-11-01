import { CtClientProviders } from "@orb/testkit/browser";
import type { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";
import { renderContextBoundaryDivider } from "#client/features/chat/components/message-row-divider.tsx";

/** The two extremes a photo can put behind the label: the page ink's colour and the page's own. */
const ART = { light: `var(${TOKENS["color.foreground"].cssVar})`, dark: `var(${TOKENS["color.background"].cssVar})` } as const;

/** The production context-boundary divider in a room with art (`data-has-bg-image`) behind it, or on a plain room. */
export function ContextDividerStory({ art, theme }: { readonly art?: keyof typeof ART; readonly theme?: keyof typeof SEED_THEME_VALUE_SETS }): ReactElement {
  return (
    <CtClientProviders>
      <div data-theme={theme}>
        <div
          data-has-bg-image={art === undefined ? undefined : ""}
          style={{ backgroundColor: art === undefined ? `var(${TOKENS["color.background"].cssVar})` : ART[art], padding: "1rem" }}
        >
          {renderContextBoundaryDivider(true, "12k of 32k")}
        </div>
        <span data-probe="transparent" style={{ backgroundColor: "transparent" }} />
        <span data-probe="reading-plate" style={{ backgroundColor: `var(${TOKENS["color.reading-plate"].cssVar})` }} />
        <span data-probe="reading-plate-foreground" style={{ color: `var(${TOKENS["color.reading-plate-foreground"].cssVar})` }} />
      </div>
    </CtClientProviders>
  );
}
