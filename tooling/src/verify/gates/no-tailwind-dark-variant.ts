// Gate: no-tailwind-dark-variant (#954) — polarity is ThemeScope-derived color-scheme + light-dark(); a
// named-theme dark: utility cannot see custom-theme polarity. Comment-SAFE: AST literal carriers only.
// CARRIERS: JSX/object `className`, className variables, and literals nested in cn/clsx/cva/tv/twMerge.
// DECLARED LIMIT: a runtime-assembled or opaque cross-module class string has no static literal to judge.
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import { fileLoaded } from "../lib/pass.ts";

const MESSAGE =
  "Tailwind dark: utility creates a second polarity mechanism that cannot see ThemeScope-derived custom-theme polarity (client-architecture-lockdown.md §4.6, #954).";
const FIX = "Use a polarity-aware light-dark() token selected by ThemeScope's derived color-scheme; never branch paint with dark:.";
const CLASS_COMPOSERS: ReadonlySet<string> = new Set(["cn", "clsx", "cva", "tv", "twMerge"]);
const DARK_VARIANT_RE = /(?:^|:)dark:(?=\S)/u;
const WHITESPACE_RE = /\s+/u;
const REAL_TREE_ANCHOR = "packages/ui/src/styles/globals.css";
const GATE_SELF = "tooling/src/verify/gates/no-tailwind-dark-variant.ts";

let classStringCount = 0;

interface DarkToken {
  readonly token: string;
  readonly offset: number;
}

function isNamedClassCarrier(node: Node): boolean {
  const variable = node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  if (variable?.getName() === "className") {
    return true;
  }
  const property = node.getFirstAncestorByKind(SyntaxKind.PropertyAssignment);
  return property?.getName() === "className";
}

function isClassStringSite(node: Node): boolean {
  const jsxAttr = node.getFirstAncestorByKind(SyntaxKind.JsxAttribute);
  if (jsxAttr?.getNameNode().getText() === "className") {
    return true;
  }
  if (isNamedClassCarrier(node)) {
    return true;
  }
  return node.getAncestors().some((ancestor) => {
    if (!Node.isCallExpression(ancestor)) {
      return false;
    }
    return CLASS_COMPOSERS.has(ancestor.getExpression().getText());
  });
}

function darkTokens(nodeText: string): DarkToken[] {
  const body = nodeText.slice(1, -1);
  const hits: DarkToken[] = [];
  let cursor = 0;
  for (const part of body.split(WHITESPACE_RE)) {
    const at = body.indexOf(part, cursor);
    cursor = at + part.length;
    if (part.length > 0 && DARK_VARIANT_RE.test(part)) {
      hits.push({ token: part, offset: at + 1 });
    }
  }
  return hits;
}

export const gate: GateDescriptor = {
  name: "no-tailwind-dark-variant",
  docRow: "client-architecture-lockdown.md §4.6 (#954)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  scanRoot: (path) => path.startsWith("packages/client/src/") || path.startsWith("packages/ui/src/"),
  kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral, SyntaxKind.TemplateHead, SyntaxKind.TemplateMiddle, SyntaxKind.TemplateTail],
  begin: () => {
    classStringCount = 0;
  },
  visit: (node, _sf, ctx) => {
    if (!isClassStringSite(node)) {
      return;
    }
    classStringCount++;
    for (const hit of darkTokens(node.getText())) {
      ctx.report(node, hit);
    }
  },
  finalize: (ctx) => {
    ctx.scan({ unit: "class string", candidates: classStringCount, scanned: classStringCount });
    if (fileLoaded(ctx, REAL_TREE_ANCHOR) && classStringCount === 0) {
      ctx.report({
        file: GATE_SELF,
        line: 1,
        column: 0,
        message: "class-string derivation returned zero carriers — the dark-variant census is blind, not clean",
      });
    }
  },
  mustFlag: [
    {
      files: 'export const G = <div className="dark:bg-card" />;\n',
      at: "packages/ui/src/x.tsx",
      expect: { token: "dark:bg-card" },
      why: "the founding JSX className shape — a literal dark utility is RED",
    },
    {
      files: 'export const styles = cn("hover:dark:text-foreground", condition && "block");\n',
      at: "packages/client/src/x.ts",
      expect: { token: "hover:dark:text-foreground" },
      why: "a stacked dark variant in a TypeScript cn() composition is RED",
    },
    {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: test fixture exercises a template-literal carrier
      files: "export const variants = tv({ slots: { root: `dark:${tone}` } });\n",
      at: "packages/ui/src/x.ts",
      why: "a dynamic utility after a static dark: prefix in a tv() template head is RED",
    },
    {
      files: 'export const props = { className: "dark:border-border" };\n',
      at: "packages/client/src/x.ts",
      expect: { token: "dark:border-border" },
      why: "an object className carrier is covered even before JSX spread",
    },
  ],
  mustPass: [
    {
      files: 'export const shiki = { dark: "github-dark" };\nexport const token = "--color-sky-cloud-dark";\n',
      at: "packages/ui/src/x.ts",
      why: "legitimate Shiki dark keys and token names are not class strings",
    },
    {
      files: 'export const copy = "Never write dark:bg-card in prose";\n// dark:text-foreground is documentation\n',
      at: "packages/client/src/x.ts",
      why: "unrelated string text and comments are not class carriers",
    },
    {
      files: 'export const G = <div className="bg-card text-foreground" />;\n',
      at: "packages/ui/src/x.tsx",
      why: "ordinary polarity-aware token utilities remain legal",
    },
  ],
};
