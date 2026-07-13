// Mermaid diagram config for `<Streamdown mermaid={...}>`. Mermaid ships bundled inside streamdown —
// this only supplies a token-styled theme + a graceful, token-styled error component.
import type { ReactElement } from "react";
import type { MermaidErrorComponentProps, MermaidOptions } from "streamdown";
import { Button } from "#primitives/button";
import { TOKENS } from "#tokens";

// Mermaid's `theme: "base"` is the ONLY theme whose `themeVariables` are honored — named themes ignore overrides.
const MERMAID_THEME_VARIABLES = {
  background: TOKENS["color.card"].value,
  primaryColor: TOKENS["color.secondary"].value,
  primaryTextColor: TOKENS["color.foreground"].value,
  primaryBorderColor: TOKENS["color.border"].value,
  secondaryColor: TOKENS["color.muted"].value,
  tertiaryColor: TOKENS["color.accent"].value,
  lineColor: TOKENS["color.muted-foreground"].value,
  textColor: TOKENS["color.foreground"].value,
  fontFamily: TOKENS["font.sans"].value,
} as const;

/** Token-styled diagram-error surface, offering retry plus the raw source so a broken diagram stays copy-recoverable. */
function MermaidError({ error, retry }: MermaidErrorComponentProps): ReactElement {
  return (
    <div
      data-slot="markdown-mermaid-error"
      className="rounded-control border border-destructive/40 bg-card p-block text-label text-muted-foreground"
    >
      <p className="text-destructive">Diagram failed to render.</p>
      <p className="mt-field font-mono text-code">{error}</p>
      <Button className="mt-row" intent="ghost" onClick={retry} size="sm">
        Retry
      </Button>
    </div>
  );
}

/** The `mermaid` prop for `<Streamdown>` — token theme + the graceful error surface above. */
export const MARKDOWN_MERMAID_OPTIONS: MermaidOptions = {
  config: { theme: "base", themeVariables: MERMAID_THEME_VARIABLES },
  errorComponent: MermaidError,
};
