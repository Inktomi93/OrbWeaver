// Policy: ui-size-via-variant — sealed control sizes belong to primitive variants, not call-site classes.
// Tailwind's registered token scale makes call-site sizing a deterministic override of the primitive.
// The shared Tailwind reader preserves both important spellings and exact authored token positions.
// The legacy named-import and literal-className limits remain: no namespace tags, computed className,
// CSS-variable shorthand, or min-w/max-w/max-h widening. Unsized layout/media APIs own no size seal.
// Two former file-wide Select permissions now bind only their w-auto occurrences through ordinary
// markers. Central authority owns staleness; the family test replaces the legacy stale-table proof.
// Population is unchanged: client and UI authored sources. Per-file imports live inside create.
import type { JsxOpeningElement, JsxSelfClosingElement, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readTailwindClassToken, readTailwindClassTokens } from "../lib/tailwind-class-token.ts";

// These APIs intentionally take their box geometry from callers; they have no primitive size to override.
const UNSIZED_BOX_SPECIFIERS = new Set(["@orb/ui/layout", "@orb/ui/skeleton", "@orb/ui/theme-scope", "@orb/ui/crossfade-image", "@orb/ui/background-video"]);

const SIZE_UTILITY_RE = /^(?<util>h|min-h|size|w)-(?<val>[a-z0-9./-]+)$/u;
/** Values that are LAYOUT decisions, not box sizes — never flagged. Viewport units + intrinsic keywords. */
const KEYWORD_VALUE_RE = /^(?:full|fit|min|max|screen|[sld]v[hw])$/u;
const FRACTION_VALUE_RE = /^\d+\/\d+$/u;
const NUMERIC_VALUE_RE = /^(?:\d+(?:\.\d+)?|px)$/u;
const CUSTOM_TOKEN_VALUE_RE = /^[a-z][a-z0-9-]*$/u;

/** Is this whitespace-split class token a banned size utility (terminal segment)? The variant chain is
 *  dropped first (`focus:h-9` → `h-9`), then the important modifier on whichever side it sits
 *  (`focus:!h-9` / `focus:h-9!` → `h-9`) — Tailwind puts `!` on the UTILITY, never before the variants. */
function isBannedSizeToken(token: string): boolean {
  const terminal = readTailwindClassToken(token).utility;
  const match = SIZE_UTILITY_RE.exec(terminal);
  if (match?.groups === undefined) {
    return false;
  }
  const { util, val } = match.groups;
  if (util === undefined || val === undefined) {
    return false;
  }
  if (KEYWORD_VALUE_RE.test(val) || FRACTION_VALUE_RE.test(val)) {
    return false;
  }
  // `min-h-0` is the flex-overflow constraint RELEASE (the `min-w-0` twin), not a size — legitimate.
  if (util === "min-h" && val === "0") {
    return false;
  }
  return val === "auto" || NUMERIC_VALUE_RE.test(val) || CUSTOM_TOKEN_VALUE_RE.test(val);
}

/** A banned size token + its 0-based offset into the class-string node's `getText()`. */
interface BannedToken {
  readonly token: string;
  readonly offset: number;
}

/** Every banned size token in a class-string node's text (quotes/backticks at [0] and [-1]). */
function bannedSizeTokens(nodeText: string): BannedToken[] {
  return readTailwindClassTokens(nodeText).filter((part) => isBannedSizeToken(part.token));
}

function classNameLiteral(el: JsxOpeningElement | JsxSelfClosingElement): Node | undefined {
  const attr = el.getAttribute("className");
  if (attr === undefined || !Node.isJsxAttribute(attr)) {
    return;
  }
  const init = attr.getInitializer();
  if (init === undefined) {
    return;
  }
  if (Node.isStringLiteral(init)) {
    return init;
  }
  if (!Node.isJsxExpression(init)) {
    return;
  }
  const expr = init.getExpression();
  return expr !== undefined && (Node.isStringLiteral(expr) || Node.isNoSubstitutionTemplateLiteral(expr)) ? expr : undefined;
}

const UI_SPECIFIER_RE = /^@orb\/ui(?:\/|$)/u;
const MESSAGE =
  "sizes come from variants — a call-site sizing utility overrides the primitive's sealed box; add a size/layout variant to the primitive instead.";

export const gate = defineGate({
  id: "ui-size-via-variant",
  family: "tailwind-class-token",
  authority: "ordinary",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "use the primitive's size/layout variant; an intentional exception needs an exact @orb-waive ui-size-via-variant(<reported-token>) marker and its reason.",
  create: (ctx) => {
    const imports = new Map<SourceFile, ReadonlySet<string>>();
    return {
      visitFile: (sf) => {
        const names = new Set<string>();
        for (const declaration of sf.getImportDeclarations()) {
          const module = declaration.getModuleSpecifierValue();
          if (UI_SPECIFIER_RE.test(module) && !UNSIZED_BOX_SPECIFIERS.has(module)) {
            for (const named of declaration.getNamedImports()) {
              names.add((named.getAliasNode() ?? named.getNameNode()).getText());
            }
          }
        }
        imports.set(sf, names);
      },
      visitors: [
        {
          kinds: [SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement],
          visit: (node) => {
            if (!(Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node))) {
              return;
            }
            const tag = node.getTagNameNode();
            if (!(Node.isIdentifier(tag) && imports.get(node.getSourceFile())?.has(tag.getText()) === true)) {
              return;
            }
            const literal = classNameLiteral(node);
            if (literal === undefined) {
              return;
            }
            for (const hit of bannedSizeTokens(literal.getText())) {
              ctx.report.node(literal, { token: hit.token, offset: hit.offset });
            }
          },
        },
      ],
    };
  },
  mustFlag: [
    {
      files: {
        "packages/client/src/features/x/x.tsx": 'import { Button } from "@orb/ui/button";\nexport const G = <Button className="size-auto">x</Button>;\n',
      },
      expect: { count: 1 },
      why: "the F2 incident shape — `size-auto` on Button; auto is a size verdict the variant owns",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/x/tabs.tsx": 'import { TabsTab } from "@orb/ui/tabs";\nexport const G = <TabsTab className="h-auto" />;\n',
      },
      expect: { count: 1 },
      why: "the pre-layout-variant incident shape — `h-auto` on TabsTab",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/x/two.tsx": 'import { Button } from "@orb/ui/button";\nexport const G = <Button className="h-control w-40">x</Button>;\n',
      },
      expect: {
        count: 2,
      },
      why: "a custom-token (`h-control`) and a numeric (`w-40`) size utility — both override the primitive box under the registered token scale",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/x/hyphen.tsx":
          'import { Button } from "@orb/ui/button";\nexport const G = <Button className="h-control-sm">x</Button>;\n',
      },
      expect: {
        count: 1,
        token: "h-control-sm",
      },
      why: "a multi-segment sealed token (`h-control-sm`) — the value class carries `-` since #169; without it every real seal spelling was invisible",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/x/hyphensize.tsx": 'import { Avatar } from "@orb/ui/avatar";\nexport const G = <Avatar className="size-avatar-md" />;\n',
      },
      expect: {
        count: 1,
        token: "size-avatar-md",
      },
      why: "the `size` shorthand with a multi-segment token — the same hole, on the axis the F2 incident used",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/x/variantpfx.tsx": 'import { Input } from "@orb/ui/input";\nexport const G = <Input className="focus:h-9" />;\n',
      },
      expect: { count: 1 },
      why: "a variant-prefixed size utility (focus:h-9) — the terminal segment still flags",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/x/bangpfx.tsx":
          'import { Button } from "@orb/ui/button";\nexport const G = <Button className="!size-6 !p-0">x</Button>;\n',
      },
      expect: { count: 1 },
      why: "the v3-era `!` PREFIX (`!size-6`) — the escape hatch the 13 inline-button sites used; `!p-0` is out of scope (padding), so exactly ONE finding",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/x/bangsfx.tsx": 'import { Button } from "@orb/ui/button";\nexport const G = <Button className="h-auto!">x</Button>;\n',
      },
      expect: { count: 1 },
      why: "v4's canonical `!` SUFFIX (`h-auto!`) — the same important modifier on the other side, equally registered by the v4.3 engine",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/x/bangvariant.tsx": 'import { Input } from "@orb/ui/input";\nexport const G = <Input className="focus:!h-9" />;\n',
      },
      expect: { count: 1 },
      why: "important + a variant chain (focus:!h-9) — Tailwind puts `!` on the utility, so stripping happens AFTER the `:` split",
      mode: "source",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/client/src/features/x/rawdiv.tsx": 'export const G = <div className="h-auto size-auto w-40" />;\n',
      },
      why: "a raw HTML element — not a @orb/ui component; other gates own raw-element classes",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/x/localcomp.tsx":
          'const Button = (p: { className: string }) => <div />;\nexport const G = <Button className="size-auto" />;\n',
      },
      why: "a LOCAL component named Button — not imported from @orb/ui, out of scope",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/x/layoutok.tsx":
          'import { Button } from "@orb/ui/button";\nexport const G = <Button className="w-full max-w-md min-w-0 shrink-0">x</Button>;\n',
      },
      why: "layout constraints/proportions (w-full, max-w-*, min-w-0) are legitimate call-site decisions — passes",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/x/minh0.tsx": 'import { Stack } from "@orb/ui/layout";\nexport const G = <Stack className="min-h-0" />;\n',
      },
      why: "min-h-0 is the flex-child overflow release (the min-w-0 twin), not a size — passes",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/x/keywords.tsx": 'import { Row } from "@orb/ui/layout";\nexport const G = <Row className="h-full w-fit" />;\n',
      },
      why: "keyword values (full/fit) are proportional layout, not box sizes — passes",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/x/hyphenfence.tsx":
          'import { Button } from "@orb/ui/button";\nexport const G = <Button className="min-w-touch-target max-w-cq-md max-h-control-sm">x</Button>;\n',
      },
      why: "min-w/max-w/max-h stay OUT of scope after the #169 hyphen widening — the fence is an axis fence, not a value-shape one",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/x/unsized.tsx":
          'import { Skeleton } from "@orb/ui/skeleton";\nimport { Stack } from "@orb/ui/layout";\nexport const G = <Stack className="size-9"><Skeleton className="h-3 w-40" /></Stack>;\n',
      },
      why: "UNSIZED-BOX modules (layout kit, Skeleton) — no size of their own, geometry IS the call site's datum, exempt",
      mode: "source",
    },
    {
      files: {
        "packages/client/src/features/x/bangfence.tsx":
          'import { Button } from "@orb/ui/button";\nexport const G = <Button className="!w-full !min-h-0 !p-0 !shrink-0">x</Button>;\n',
      },
      why: "the `!` strip does NOT widen the fence — an important keyword/proportional value (!w-full), the min-h-0 release and non-size utilities all still pass",
      mode: "source",
    },
  ],
});
