// The KaTeX math plugin for `<Streamdown plugins={{ math }}>`. Streamdown bundles Mermaid but not
// KaTeX, so this seal supplies the whole math stack: remark-math (parse) -> rehype-katex (render) +
// the stylesheet. `getStyles` is deliberately omitted — the bundler owns the CSS + font url() rewrites.
import "katex/dist/katex.min.css";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import type { MathPlugin } from "streamdown";
import { TOKENS } from "#tokens";

// rehype-katex forces throwOnError:false internally — a malformed equation renders in `errorColor`
// rather than throwing. Token-color it so a bad equation mid-stream reads as an app-palette error.
const KATEX_OPTIONS = { errorColor: TOKENS["color.destructive"].value } as const;

export const MARKDOWN_MATH_PLUGIN: MathPlugin = {
  name: "katex",
  type: "math",
  remarkPlugin: remarkMath,
  rehypePlugin: [rehypeKatex, KATEX_OPTIONS],
};
