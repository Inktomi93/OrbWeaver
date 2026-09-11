// Gate: no-tailwind-dark-variant (#954) — polarity is ThemeScope-derived color-scheme + light-dark(); a
// named-theme dark: utility cannot see custom-theme polarity. Class carriers come from the neutral static
// provenance walker; Tailwind's scanner is used only to tokenize an already-proven exact class value.
import { Scanner } from "@tailwindcss/oxide";
import type { Node } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import { fileLoaded, repoRel } from "../lib/pass.ts";
import type { RuntimeClassPrefix, StaticClassCandidate, StaticClassSegment } from "../lib/static-class-expression.ts";
import { walkStaticClassExpressions } from "../lib/static-class-expression.ts";

const MESSAGE =
  "Tailwind dark: utility creates a second polarity mechanism that cannot see ThemeScope-derived custom-theme polarity; an `unresolved:*` token means static provenance could not prove the census clean (client-architecture-lockdown.md §4.6).";
const FIX = "Use a polarity-aware light-dark() token selected by ThemeScope's derived color-scheme; never branch paint with dark:.";
const REAL_TREE_ANCHOR = "packages/ui/src/lib/class-merge.ts";
const GATE_SELF = "tooling/src/verify/gates/no-tailwind-dark-variant.ts";

interface Part {
  readonly text: string;
  readonly start: number;
}

interface ParseState {
  readonly stack: string[];
  quote: string;
  escaped: boolean;
}

interface AnchoredToken {
  readonly node: Node;
  readonly offset: number;
  readonly token: string;
}

function consumesQuoteOrEscape(state: ParseState, char: string): boolean {
  if (state.escaped) {
    state.escaped = false;
    return true;
  }
  if (char === "\\") {
    state.escaped = true;
    return true;
  }
  if (state.quote.length > 0) {
    if (char === state.quote) {
      state.quote = "";
    }
    return true;
  }
  if (char === '"' || char === "'") {
    state.quote = char;
    return true;
  }
  return false;
}

function consumesBracket(state: ParseState, char: string): boolean {
  const closes: Readonly<Record<string, string>> = { "]": "[", ")": "(", "}": "{" };
  if (char === "[" || char === "(" || char === "{") {
    state.stack.push(char);
    return true;
  }
  const open = closes[char];
  if (open === undefined) {
    return false;
  }
  if (state.stack.at(-1) === open) {
    state.stack.pop();
  }
  return true;
}

/** Split only top-level variant separators: colons inside arbitrary selectors/functions are data. */
function topLevelParts(candidate: string): Part[] {
  const parts: Part[] = [];
  const state: ParseState = { stack: [], quote: "", escaped: false };
  let start = 0;
  for (let index = 0; index < candidate.length; index += 1) {
    const char = candidate[index] ?? "";
    if (consumesQuoteOrEscape(state, char) || consumesBracket(state, char)) {
      continue;
    }
    if (char === ":" && state.stack.length === 0) {
      parts.push({ text: candidate.slice(start, index), start });
      start = index + 1;
    }
  }
  parts.push({ text: candidate.slice(start), start });
  return parts;
}

function darkPart(candidate: string): Part | undefined {
  return topLevelParts(candidate)
    .slice(0, -1)
    .find((part) => part.text === "dark");
}

function sourceToken(segments: readonly StaticClassSegment[], valueOffset: number, token: string): AnchoredToken | undefined {
  const segment = segments.find((part) => valueOffset >= part.valueStart && valueOffset < part.valueEnd) ?? segments[0];
  if (segment === undefined) {
    return;
  }
  return {
    node: segment.node,
    offset: segment.sourceStart + Math.max(0, valueOffset - segment.valueStart) - segment.node.getStart(),
    token,
  };
}

function exactTokens(scanner: Scanner, value: StaticClassCandidate): AnchoredToken[] {
  const findings: AnchoredToken[] = [];
  for (const scanned of scanner.getCandidatesWithPositions({ content: value.value, extension: "html" })) {
    if (darkPart(scanned.candidate) !== undefined) {
      const anchored = sourceToken(value.segments, Number(scanned.position), scanned.candidate);
      if (anchored !== undefined) {
        findings.push(anchored);
      }
    }
  }
  return findings;
}

function runtimeToken(value: RuntimeClassPrefix): AnchoredToken | undefined {
  const part = darkPart(value.prefix);
  return part === undefined ? undefined : sourceToken(value.segments, part.start, "dark:");
}

export const gate: GateDescriptor = {
  name: "no-tailwind-dark-variant",
  docRow: "client-architecture-lockdown.md §4.6 (#954)",
  status: "active",
  scopeSafety: "whole-project",
  message: MESSAGE,
  fix: FIX,
  scanRoot: (path) => path.startsWith("packages/client/src/") || path.startsWith("packages/ui/src/"),
  run: (ctx) => {
    const files = ctx.files.filter((source) => {
      const path = repoRel(ctx.root, source.getFilePath());
      return path.startsWith("packages/client/src/") || path.startsWith("packages/ui/src/");
    });
    const walked = walkStaticClassExpressions(files);
    const scanner = new Scanner({ sources: [] });
    for (const candidate of walked.candidates) {
      for (const anchored of exactTokens(scanner, candidate)) {
        ctx.report(anchored.node, { token: anchored.token, offset: anchored.offset });
      }
    }
    for (const prefix of walked.runtimePrefixes) {
      const anchored = runtimeToken(prefix);
      if (anchored !== undefined) {
        ctx.report(anchored.node, { token: anchored.token, offset: anchored.offset });
      }
    }
    for (const unresolved of walked.unresolved) {
      ctx.report(unresolved.node, { token: `unresolved:${unresolved.reason}`, offset: 0 });
    }
    const scanned = walked.candidates.length + walked.runtimePrefixes.length;
    ctx.scan({
      unit: "static class value",
      candidates: scanned + walked.unresolved.length + walked.opaque.length,
      scanned,
      skipped: { unresolved: walked.unresolved.length, "opaque-runtime": walked.opaque.length },
    });
    if (fileLoaded(ctx, REAL_TREE_ANCHOR) && walked.roots === 0) {
      ctx.report({
        file: GATE_SELF,
        line: 1,
        column: 0,
        message:
          "static class-expression derivation returned zero carrier roots — the dark-variant census is blind, not clean (tooling/src/verify/lib/static-class-expression.ts)",
      });
    }
  },
  mustFlag: [
    {
      files: 'export const G = <div className="dark:bg-card" />;\n',
      at: "packages/ui/src/x.tsx",
      expect: { token: "dark:bg-card" },
      why: "direct JSX className remains the founding RED",
    },
    {
      files: 'import { clsx } from "clsx";\nexport const x = clsx?.(clsx("hover:dark:text-foreground"));\n',
      at: "packages/client/src/x.ts",
      expect: { token: "hover:dark:text-foreground" },
      why: "nested and optional canonical composer calls are provenance roots",
    },
    {
      files:
        'import { clsx as imported } from "clsx";\nconst local = imported;\nconst forward = (...args: Parameters<typeof local>) => local(...args) ?? "";\nexport const x = forward("dark:alias-wrapper");\n',
      at: "packages/ui/src/x.ts",
      expect: { token: "dark:alias-wrapper" },
      why: "import alias, local alias, and simple forwarding wrapper preserve composer identity",
    },
    {
      files: {
        "packages/ui/src/composer.ts": 'export { clsx as join } from "clsx";\n',
        "packages/ui/src/x.ts": 'import { join as compose } from "./composer.ts";\nexport const x = compose("dark:reexported-composer");\n',
      },
      expect: { token: "dark:reexported-composer" },
      why: "composer identity survives cross-file re-export and consumer aliases",
    },
    {
      files: 'import * as kit from "clsx";\nexport const a = kit.clsx("dark:namespace-dot");\nexport const b = kit["clsx"]?.("dark:namespace-bracket");\n',
      at: "packages/client/src/x.ts",
      expect: { count: 2 },
      why: "namespace dot, optional, and static-bracket calls are declaration-proven",
    },
    {
      files: {
        "packages/ui/src/producer.ts": 'export const CARD = "dark:bg-card";\n',
        "packages/ui/src/barrel.ts": 'export { CARD as SURFACE } from "./producer.ts";\n',
        "packages/client/src/consumer.tsx": 'import { SURFACE } from "../../ui/src/barrel.ts";\nexport const x = <div className={SURFACE} />;\n',
      },
      expect: { token: "dark:bg-card", line: 1 },
      why: "cross-file constants and re-export aliases report at the producer literal",
    },
    {
      files:
        'import clsx from "clsx";\nconst shared = ["dark:array", { "dark:object-key": true }];\nexport const x = clsx([false && "dark:dead", ...shared]);\n',
      at: "packages/ui/src/x.ts",
      expect: { count: 3 },
      why: "arrays, object class maps, values, and spreads remain visible to join composers",
    },
    {
      files:
        'import { tv } from "tailwind-variants";\nexport const x = tv({ slots: { root: "dark:slot" }, variants: { tone: { loud: { root: "hover:dark:nested" } } }, compoundVariants: [{ tone: "dark:selector", class: "dark:compound" }], defaultVariants: { tone: "dark:default" } });\n',
      at: "packages/ui/src/x.ts",
      expect: { count: 3 },
      why: "tv slots, nested variant slots, and compound class fields are class-bearing while selectors/defaults are not",
    },
    {
      files: `const tone = "card";
const a = \`hover:dark:bg-\${tone}\`;
const b = "focus:" + "dark:text-foreground";
export const x = <div className={[a, b]} />;
`,
      at: "packages/client/src/x.tsx",
      expect: { count: 2 },
      why: "resolvable template substitutions and concatenation preserve exact candidates",
    },
    {
      files:
        'declare const key: "a" | "b";\nconst map = { a: "dark:static", b: "hover:dark:dynamic" } as const;\nexport const x = <div className={[map.a, map[key]]} />;\n',
      at: "packages/ui/src/x.tsx",
      expect: { count: 2 },
      why: "static member access and conservative dynamic object indexing cover the static property universe",
    },
    {
      files: `declare const tone: string;
export const x = <div className={\`dark:\${tone}\`} />;
`,
      at: "packages/ui/src/x.tsx",
      expect: { token: "dark:" },
      why: "runtime dark prefix is a separate AST proof because Oxide emits no complete candidate",
    },
    {
      files: 'export const props = { className: "dark:border-border" };\n',
      at: "packages/client/src/x.ts",
      expect: { token: "dark:border-border" },
      why: "object className is a real carrier root before JSX spread",
    },
    {
      files: "const A = B;\nconst B = A;\nexport const x = <div className={A} />;\n",
      at: "packages/ui/src/x.tsx",
      expect: { messageIncludes: "unresolved" },
      why: "a static cycle is counted and fails loud instead of producing a clean zero",
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
      why: "unrelated prose and comments are not class carriers",
    },
    {
      files: 'function cn(value: string) { return value.length; }\nexport const inert = cn("dark:not-a-class");\n',
      at: "packages/ui/src/x.ts",
      why: "an arbitrary local function named cn has no composer provenance",
    },
    {
      files:
        'import { tv } from "tailwind-variants";\nexport const x = tv({ variants: { tone: { loud: "bg-card" } }, defaultVariants: { tone: "dark:not-a-class" } });\n',
      at: "packages/ui/src/x.ts",
      why: "variant selectors/defaults are configuration values, not class candidates",
    },
    {
      files: 'export const G = <div className="[&_.dark:x]:bg-card darkroom:bg-card bg-card text-foreground" />;\n',
      at: "packages/ui/src/x.tsx",
      why: "nested selector text and non-exact dark prefixes are not top-level dark variants",
    },
  ],
};
