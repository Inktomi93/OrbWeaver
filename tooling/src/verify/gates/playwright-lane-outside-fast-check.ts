// Gate: playwright-lane-outside-fast-check — browser-mode test suffixes (.ct.tsx, .spec.ts) must never
// appear in vitest project include arrays. Vitest cannot run Playwright CT or e2e files; importing them
// under vitest hangs the worker in browser-mode negotiation and reads as a mysterious timeout.
// ARM A: RUNTIME_BY_FAMILY maps a browser family to "vitest" instead of its playwright runner.
// ARM B: a vitest project include glob literally contains a browser-only suffix.
// DECLARED LIMITS: only catches LITERAL suffix globs; a programmatic rewrite that injects the suffix at
// runtime is invisible to the syntax walk.
// FAMILY: singleton — subject is the vitest config project includes, not a repeated shape.
// POPULATION: the two authored files that own the runner boundary: test-kinds.ts and vitest.config.ts.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const TEST_KINDS = "tooling/src/_shared/test-kinds.ts";
const VITEST_CONFIG = "vitest.config.ts";

/** Suffixes that belong to Playwright, never vitest. */
const BROWSER_SUFFIXES = [".ct.tsx", ".spec.ts"];
const BROWSER_FAMILIES = new Set(["component", "e2e"]);

const MESSAGE =
  "browser-mode test suffixes (.ct.tsx, .spec.ts) must not appear in vitest project includes — " +
  "vitest cannot execute Playwright CT or e2e files and the import hangs the worker; " +
  "tooling/src/_shared/test-kinds.ts RUNTIME_BY_FAMILY is the one home for runner assignment";

const FIX = "ensure RUNTIME_BY_FAMILY maps component to playwright-ct and e2e to playwright-e2e, and that no vitest include glob matches a browser suffix";

/** ARM A: check if a RUNTIME_BY_FAMILY property maps a browser family to vitest. */
function checkFamilyMapping(node: MorphNode): string | null {
  if (!Node.isPropertyAssignment(node)) {
    return null;
  }
  const name = node.getName();
  if (!BROWSER_FAMILIES.has(name)) {
    return null;
  }
  const initializer = node.getInitializer();
  if (initializer === undefined || !Node.isStringLiteral(initializer)) {
    return null;
  }
  const value = initializer.getLiteralText();
  if (value !== "vitest" && value !== "vitest-typecheck") {
    return null;
  }
  return name;
}

/** ARM B: check if a string literal in vitest.config.ts contains a browser suffix. */
function checkBrowserSuffix(node: MorphNode): string | null {
  if (!Node.isStringLiteral(node)) {
    return null;
  }
  const text = node.getLiteralText();
  for (const suffix of BROWSER_SUFFIXES) {
    if (text.includes(suffix)) {
      return suffix;
    }
  }
  return null;
}

export const gate = defineGate({
  id: "playwright-lane-outside-fast-check",
  family: "playwright-lane-outside-fast-check",
  authority: "hard",
  severity: "error",
  population: { in: ["@tooling"], under: [TEST_KINDS], also: [VITEST_CONFIG] },
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const findings: { node: MorphNode; detail: string; token: string }[] = [];

    return {
      visitors: [
        {
          kinds: [SyntaxKind.PropertyAssignment],
          visit: (node, sourceFile) => {
            if (ctx.relativePath(sourceFile) !== TEST_KINDS) {
              return;
            }
            const family = checkFamilyMapping(node);
            if (family !== null) {
              findings.push({
                node,
                detail: `RUNTIME_BY_FAMILY maps "${family}" to a vitest runner instead of its playwright runner`,
                token: family,
              });
            }
          },
        },
        {
          kinds: [SyntaxKind.StringLiteral],
          visit: (node, sourceFile) => {
            if (ctx.relativePath(sourceFile) !== VITEST_CONFIG) {
              return;
            }
            const suffix = checkBrowserSuffix(node);
            if (suffix !== null) {
              findings.push({
                node,
                detail: `vitest config include glob contains browser suffix "${suffix}"`,
                token: suffix,
              });
            }
          },
        },
      ],
      evaluate: () => {
        ctx.receipt({ kind: "population", source: "playwright-lane-boundary", members: ctx.files.length, unresolved: 0 });
        for (const { node, detail, token } of findings) {
          ctx.report.node(node, { message: `${MESSAGE} — ${detail}`, fix: FIX, token, offset: 0 });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: {
        [TEST_KINDS]: [
          "const RUNTIME_BY_FAMILY = {",
          '  unit: "vitest",',
          '  integration: "vitest",',
          '  contract: "vitest",',
          '  type: "vitest-typecheck",',
          '  component: "vitest",',
          '  e2e: "playwright-e2e",',
          "} as const;",
          "",
        ].join("\n"),
      },
      expect: { count: 1, token: "component", messageIncludes: "RUNTIME_BY_FAMILY" },
      why: "a browser family (component) mapped to vitest would hang the worker in browser-mode negotiation — the founding defect shape",
    },
    {
      mode: "source",
      files: {
        [TEST_KINDS]: [
          "const RUNTIME_BY_FAMILY = {",
          '  unit: "vitest",',
          '  integration: "vitest",',
          '  contract: "vitest",',
          '  type: "vitest-typecheck",',
          '  component: "playwright-ct",',
          '  e2e: "vitest",',
          "} as const;",
          "",
        ].join("\n"),
      },
      expect: { count: 1, token: "e2e", messageIncludes: "RUNTIME_BY_FAMILY" },
      why: "the e2e family mapped to vitest is the same browser-hang defect as the component arm",
    },
    {
      mode: "source",
      files: {
        [VITEST_CONFIG]: 'const include = ["tests/**/*.ct.tsx"];\n',
      },
      expect: { count: 1, token: ".ct.tsx", messageIncludes: "browser suffix" },
      why: "a vitest include glob containing .ct.tsx would pull Playwright CT files into the vitest runner",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        [TEST_KINDS]: [
          "const RUNTIME_BY_FAMILY = {",
          '  unit: "vitest",',
          '  integration: "vitest",',
          '  contract: "vitest",',
          '  type: "vitest-typecheck",',
          '  component: "playwright-ct",',
          '  e2e: "playwright-e2e",',
          "} as const;",
          "",
        ].join("\n"),
      },
      why: "the sanctioned runtime mapping — every browser family goes to its playwright runner",
    },
    {
      mode: "source",
      files: {
        [VITEST_CONFIG]: 'const include = ["tests/**/*.test.ts", "tests/**/*.int.test.ts"];\n',
      },
      why: "vitest include globs containing only node-runner suffixes are the sanctioned shape",
    },
  ],
});
