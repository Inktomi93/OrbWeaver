// The Mermaid diagram config for `<Streamdown mermaid={…}>`. Mermaid is bundled INSIDE streamdown
// (its package.json deps), so no new dependency — the seal only supplies a token-styled theme + a
// graceful, token-styled error component (Streamdown renders diagrams on-complete and hands render
// failures to `errorComponent`, the #343-class white-screen guard at the diagram granularity, on top
// of the seal-level `MarkdownErrorBoundary`).
import type { ReactElement } from "react";
import type { MermaidErrorComponentProps, MermaidOptions } from "streamdown";
import { TOKENS } from "#tokens";

// Mermaid's `theme: "base"` is the ONLY theme whose `themeVariables` are honored — the built-in named
// themes ignore overrides. Map the diagram surface onto the message/code-block chrome tokens so a
// rendered flowchart tracks the app palette instead of Mermaid's stock lavender. Static token
// literals, same rationale as shiki-theme.ts.
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

/**
 * The token-styled diagram-error surface (Streamdown's `MermaidOptions.errorComponent`). Mirrors the
 * `MarkdownErrorBoundary` fallback voice but at diagram granularity, and — unlike the boundary — can
 * offer a retry (Mermaid re-renders are cheap and often fix a transient race) plus the raw source so a
 * broken diagram is still copy-recoverable. Utility classes only (tokens via Tailwind theme; no raw
 * color literals).
 */
function MermaidError({ error, retry }: MermaidErrorComponentProps): ReactElement {
  return (
    <div
      data-slot="markdown-mermaid-error"
      className="rounded-control border border-destructive/40 bg-card p-block text-label text-muted-foreground"
    >
      <p className="text-destructive">Diagram failed to render.</p>
      <p className="mt-field font-mono text-code">{error}</p>
      <button
        type="button"
        onClick={retry}
        className="mt-row rounded-control border border-border px-field py-field text-label hover:bg-accent"
      >
        Retry
      </button>
    </div>
  );
}

/** The `mermaid` prop for `<Streamdown>` — token theme + the graceful error surface above. */
export const MARKDOWN_MERMAID_OPTIONS: MermaidOptions = {
  config: { theme: "base", themeVariables: MERMAID_THEME_VARIABLES },
  errorComponent: MermaidError,
};
