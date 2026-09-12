// Gate: no-raw-color-in-css (UI-Architecture-and-Layout.md / D43) — parsed declarations only.
// The generated theme.css is the authoritative raw-color definition surface; comments, selectors, and
// declaration content strings are not color declarations and remain outside this policy.
// FAMILY: a singleton until a second CSS-literal sibling converts. The loader law (lib/policy-module.ts, the
// final contract's "a policy with no proven sibling is a singleton family under its own id") refuses a lone member
// whose `family` is not its id — `css-literal-geometry` was declared here for the 14 LEGACY CSS gates that share the
// authored-css reader, and the mixed door (#1584 §5) is the first loader to have run this module. Re-declare the
// shared family in the same commit that converts the second member.
// WHERE A BROKEN RESOURCE REFUSES — not here (mirrors `server-layout.ts`'s header). A declared resource
// that comes back missing/empty/unresolved/malformed makes `resolveResourceDeclarations`
// (`lib/resource-declaration.ts:182`) THROW during the POPULATION phase, and the receipt phase withholds
// every consumer, both before `create`/`evaluate` run (guide §11 ruling 3). This module owns no not-ready
// branch: it reads the CSS inventory through `readyResourceValue`, whose throw is an assertion that the
// runtime's own refusal already held.
import { defineGate } from "../contract/policy.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const GENERATED_THEME = "packages/ui/src/styles/theme.css";
const MESSAGE =
  "raw color literal in CSS (UI-Architecture-and-Layout.md / D43) — use a var(--color-*) token or a token-derived relative color; raw literals live only in generated theme.css.";
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/u;
const COLOR_FN_RE = /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\s*\(/u;

function withoutQuotedContent(value: string): string {
  let authored = "";
  let quote = "";
  let escaped = false;
  for (const char of value) {
    if (escaped) {
      escaped = false;
    } else if (quote !== "" && char === "\\") {
      escaped = true;
    } else if (quote !== "" && char === quote) {
      quote = "";
    } else if (quote === "" && (char === '"' || char === "'")) {
      quote = char;
    } else if (quote === "") {
      authored += char;
    }
  }
  return authored;
}

function rawColor(value: string): boolean {
  const authored = withoutQuotedContent(value);
  return HEX_RE.test(authored) || (COLOR_FN_RE.test(authored) && !authored.includes("var(--"));
}

function valuePosition(text: string, declarationOffset: number, value: string): { readonly line: number; readonly column: number } {
  const offset = text.indexOf(value, declarationOffset);
  if (offset === -1) {
    throw new Error(`CSS declaration value has no exact authored position: ${value}`);
  }
  const before = text.slice(0, offset);
  const newline = before.lastIndexOf("\n");
  return { line: before.split("\n").length, column: offset - newline };
}

export const gate = defineGate({
  id: "no-raw-color-in-css",
  family: "no-raw-color-in-css",
  authority: "ordinary",
  severity: "error",
  population: { of: "none", why: "CSS is a ResourceHost fact population, never a compiler population" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "authored-css" }],
  message: MESSAGE,
  fix:
    "use a var(--color-*) token or oklch(from var(--color-*) l c h / α). A deliberate site is waived with " +
    "`@orb-waive no-raw-color-in-css(<position>): <reason>` on the line above, where <position> is the " +
    "WHOLE raw color value text itself (e.g. `#ff0000`, `oklch(0.5 0.2 30)`).",
  create: (ctx) => ({
    evaluate: () => {
      const inventory = readyResourceValue(ctx.resources.cssInventory("authored"));
      for (const declaration of inventory.declarations) {
        if (declaration.file !== GENERATED_THEME && rawColor(declaration.value)) {
          const source = inventory.files.find(({ path }) => path === declaration.file);
          if (source === undefined) {
            throw new Error(`CSS declaration has no source resource: ${declaration.file}`);
          }
          ctx.report.file(declaration.file, {
            ...valuePosition(source.text, declaration.offset, declaration.value),
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
        "packages/ui/src/x/near.css": '/* #abc rgb(0 0 0) */\n.near { content: "#abc"; color: var(--color-foreground); }\n',
      },
      why: "comments, selector text, and content strings are not color declarations",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/styles/waived.css":
          ".waived {\n  /* @orb-waive no-raw-color-in-css(#ff0000): deliberate external brand color */\n  color: #ff0000;\n}\n",
        "packages/ui/src/styles/clean.css": ".clean { color: var(--color-foreground); }\n",
      },
      why: "one exact ordinary waiver suppresses one raw declaration finding",
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
