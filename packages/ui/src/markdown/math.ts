// The KaTeX math plugin for `<Streamdown plugins={{ math }}>`. Streamdown bundles Mermaid but NOT
// KaTeX (verified against its package.json deps — mermaid is there, katex is not), so the seal
// supplies the whole math stack: remark-math (parse `$…$` / `$$…$$`) → rehype-katex (render to KaTeX
// HTML) + the KaTeX stylesheet.
//
// STYLES: a plain side-effect CSS import (the standard bundler path, mirroring @orb/client's
// `import "./shell.css"`). The consuming Vite build inlines katex.min.css and rewrites its `fonts/…`
// url()s to hashed assets — which is why this is preferred over Streamdown's optional `getStyles`
// (that injects an inline `<style>` whose RELATIVE font urls would 404). We therefore OMIT `getStyles`
// and let the bundler own the stylesheet + fonts.
import "katex/dist/katex.min.css";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import type { MathPlugin } from "streamdown";
import { TOKENS } from "#tokens";

// rehype-katex forces `throwOnError:false` internally (its Options is `Omit<KatexOptions,
// "displayMode"|"throwOnError">`) — a malformed equation renders in `errorColor` rather than throwing,
// which is exactly the graceful-degradation the streaming/untrusted path needs. Token-color the error
// so a bad `$\frac{`​ mid-stream reads as an error in the app palette, not KaTeX's stock maroon.
const KATEX_OPTIONS = { errorColor: TOKENS["color.destructive"].value } as const;

/**
 * The `MathPlugin` handed to `<Streamdown plugins={{ math }}>` (the `PluginConfig.math` slot). `name`
 * / `type` are the discriminant fields Streamdown keys on; `remarkPlugin` parses, `rehypePlugin`
 * renders. `getStyles` is deliberately omitted (see file header — the bundler owns the CSS).
 */
export const MARKDOWN_MATH_PLUGIN: MathPlugin = {
  name: "katex",
  type: "math",
  remarkPlugin: remarkMath,
  rehypePlugin: [rehypeKatex, KATEX_OPTIONS],
};
