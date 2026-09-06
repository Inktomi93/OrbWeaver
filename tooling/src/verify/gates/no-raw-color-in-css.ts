// Gate: no-raw-color-in-css (UI-Architecture-and-Layout.md / D43) — parsed declarations only.
// The generated theme.css is the authoritative raw-color definition surface; comments, selectors, and
// declaration content strings are not color declarations and remain outside this policy.
import { defineGate } from "../contract/policy.ts";

const GENERATED_THEME = "packages/ui/src/styles/theme.css";
const MESSAGE =
  "raw color literal in CSS (UI-Architecture-and-Layout.md / D43) — use a var(--color-*) token or a token-derived relative color; raw literals live only in generated theme.css.";
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/u;
const COLOR_FN_RE = /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\s*\(/u;

function rawColor(value: string): boolean {
  return HEX_RE.test(value) || (COLOR_FN_RE.test(value) && !value.includes("var(--"));
}

export const gate = defineGate({
  id: "no-raw-color-in-css",
  family: "css-literal-geometry",
  authority: "ordinary",
  severity: "error",
  population: { of: "none", why: "CSS is a ResourceHost fact population, never a compiler population" },
  analysis: "resource",
  execution: "entire-population",
  resources: [{ kind: "authored-css" }],
  message: MESSAGE,
  fix: "use a var(--color-*) token or oklch(from var(--color-*) l c h / α)",
  create: (ctx) => ({
    evaluate: () => {
      const inventory = ctx.resources.cssInventory("authored");
      if (inventory.status !== "ready") {
        return;
      }
      for (const declaration of inventory.value.declarations) {
        if (declaration.file !== GENERATED_THEME && rawColor(declaration.value)) {
          ctx.report.file(declaration.file, {
            line: declaration.line,
            column: declaration.column,
            token: declaration.value,
          });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        "packages/client/src/features/x/x.css": ".a {\n  color: #ff0000;\n}\n",
        "packages/ui/src/styles/clean.css": ".clean { color: var(--color-foreground); }\n",
      },
      expect: { count: 1, line: 2, token: "#ff0000" },
      why: "one raw declaration produces one exact declaration finding",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/styles/clean.css": ".clean { color: var(--color-foreground); }\n",
        "packages/ui/src/x/x.css": ".a { background: oklch(0.5 0.2 30); }\n",
      },
      expect: { count: 1, token: "oklch(0.5 0.2 30)" },
      why: "raw functional color outside generated theme.css",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "packages/client/src/styles/clean.css": ".clean { color: var(--color-foreground); }\n",
        "packages/ui/src/x/near.css": '/* #abc rgb(0 0 0) */\n.#abc { content: "#abc"; color: var(--color-foreground); }\n',
      },
      why: "comments, selector text, and content strings are not color declarations",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/styles/clean.css": ".clean { color: var(--color-foreground); }\n",
        "packages/ui/src/styles/theme.css": ":root { --color-primary: oklch(0.7 0.1 250); }\n",
      },
      why: "generated theme.css is the exact authoritative raw-color source",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/styles/clean.css": ".clean { color: var(--color-foreground); }\n",
        "packages/ui/src/x/derived.css": ".a { color: oklch(from var(--color-primary) l c h / .5); }\n",
      },
      why: "token-derived relative color",
    },
  ],
});
