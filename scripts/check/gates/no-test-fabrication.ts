// Gate: no-test-fabrication (core/Spine-Testing.md §5; test-support-dry-punchlist.md W1h) — bans two
// fabricated-entity shapes that compile STRAIGHT THROUGH a type change ("source changed, tests never
// knew"): (a) `X as unknown as Y` double-casts, and (b) an object/array-literal `as Y` (not
// const/any/unknown) — both survive Y gaining/renaming a required field silently; use a typed factory
// or `satisfies Y` instead. Escape: `// FABRICATION-OK: <reason>`. BASELINE RATCHET: a file violates only when its live count exceeds its committed baseline — shrink-only.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AsExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { Finding, GateDescriptor, GateRunCtx } from "../contract.ts";
import type { Check, Violation } from "../harness.ts";

const TESTS_REL_RE = /\/(?<rel>tests\/.*)$/u;
const ESCAPE = "FABRICATION-OK";
const EXEMPT_TYPES: ReadonlySet<string> = new Set(["const", "any", "unknown"]);
const BASELINE_REL = "scripts/check/gates/no-test-fabrication.baseline.json";

const DOUBLE_CAST_MSG =
  "`X as unknown as Y` double-cast in a test — fabricates a typed value that survives Y gaining/renaming a " +
  "required field (test-support-dry-punchlist.md W1h). Use a typed factory (makeY(overrides?)) or narrow the " +
  "real value. Deliberate invalid-input probe? mark it `// FABRICATION-OK: <reason>`.";
const LITERAL_CAST_MSG = (typeText: string): string =>
  `object/array-literal \`as ${typeText}\` in a test — a hand-shaped literal asserted complete survives ` +
  `${typeText} growing a field (test-support-dry-punchlist.md W1h). Use a typed factory or \`satisfies ` +
  `${typeText}\` (which re-checks on every change). Deliberate invalid-input probe? mark it \`// ${ESCAPE}: <reason>\`.`;

/** True when the AsExpression is `<inner> as unknown as Y` — i.e. its expression is itself an AsExpression
 *  casting to the `unknown` keyword. Detected on the OUTER node so each double-cast counts once. */
function isDoubleUnknownCast(node: AsExpression): boolean {
  const inner = node.getExpression();
  if (!Node.isAsExpression(inner)) {
    return false;
  }
  return inner.getTypeNode()?.getKind() === SyntaxKind.UnknownKeyword;
}

/** True when the AsExpression casts an object/array LITERAL to a concrete type (not const/any/unknown). */
function isLiteralFabrication(node: AsExpression): boolean {
  const expr = node.getExpression();
  if (!(Node.isObjectLiteralExpression(expr) || Node.isArrayLiteralExpression(expr))) {
    return false;
  }
  return !EXEMPT_TYPES.has(node.getTypeNode()?.getText() ?? "");
}

/** The `// FABRICATION-OK` escape can sit on the cast's own line or the line directly above. */
function isEscaped(node: AsExpression, sf: SourceFile): boolean {
  const lines = sf.getFullText().split("\n");
  const line = node.getStartLineNumber(); // 1-based
  const onLine = lines[line - 1] ?? "";
  const above = lines[line - 2] ?? "";
  return onLine.includes(ESCAPE) || above.includes(ESCAPE);
}

/** Every fabrication site in one test file, as (line, message) pairs. */
export function fabricationSites(sf: SourceFile): { line: number; message: string }[] {
  const sites: { line: number; message: string }[] = [];
  for (const node of sf.getDescendantsOfKind(SyntaxKind.AsExpression)) {
    let message: string | undefined;
    if (isDoubleUnknownCast(node)) {
      message = DOUBLE_CAST_MSG;
    } else if (isLiteralFabrication(node)) {
      message = LITERAL_CAST_MSG(node.getTypeNode()?.getText() ?? "?");
    }
    if (message === undefined || isEscaped(node, sf)) {
      continue;
    }
    sites.push({ line: node.getStartLineNumber(), message });
  }
  return sites;
}

/** The tests/-relative path of a test source file, or undefined if it isn't under tests/. */
export function testsRel(path: string): string | undefined {
  return TESTS_REL_RE.exec(path)?.groups?.["rel"];
}

function loadBaseline(root: string): Record<string, number> {
  const path = join(root, BASELINE_REL);
  if (!existsSync(path)) {
    return {};
  }
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, number>;
}

/** Factory so the self-test can inject a baseline; report.ts registers the file-loading default. */
export function createNoTestFabrication(baseline?: Record<string, number>): Check {
  return {
    name: "no-test-fabrication",
    run: ({ root, project }): Violation[] => {
      const base = baseline ?? loadBaseline(root);
      const violations: Violation[] = [];
      for (const sf of project.getSourceFiles()) {
        const rel = testsRel(sf.getFilePath());
        if (rel === undefined) {
          continue;
        }
        const sites = fabricationSites(sf);
        const budget = base[rel] ?? 0;
        if (sites.length <= budget) {
          continue;
        }
        // Over budget — surface the sites past the allowance (the newest fabrications).
        for (const site of sites.slice(budget)) {
          violations.push({ file: rel, line: site.line, message: site.message });
        }
      }
      return violations;
    },
  };
}

// A per-file baseline ratchet: each test file's live fabrication count vs its baseline budget; the sites
// past the budget are surfaced. The baseline is read from fs via ctx.root — on a synthetic tree that path
// doesn't exist → an empty baseline (budget 0), so any fabrication is flagged. The baseline is loaded
// once per run (begin).
let passBaseline: Record<string, number> = {};

export const gate: GateDescriptor = {
  name: "no-test-fabrication",
  docRow: "core/Spine-Testing.md §5 (test-support-dry-punchlist.md W1h)",
  status: "active",
  scopeSafety: "whole-project", // the baseline budget is a per-file whole-tree count
  message: DOUBLE_CAST_MSG,
  fix: "use a typed factory (makeY(overrides?)) or `satisfies Y`; mark a deliberate invalid-input probe `// FABRICATION-OK: <reason>`.",
  scanRoot: (p) => p.startsWith("tests/"),
  begin: (ctx: GateRunCtx) => {
    passBaseline = loadBaseline(ctx.root);
  },
  visitFile: (sf, ctx) => {
    const rel = testsRel(sf.getFilePath());
    if (rel === undefined) {
      return;
    }
    const sites = fabricationSites(sf);
    const budget = passBaseline[rel] ?? 0;
    if (sites.length <= budget) {
      return;
    }
    // Over budget — surface the sites past the allowance (the newest fabrications).
    for (const site of sites.slice(budget)) {
      const finding: Finding = {
        file: rel,
        line: site.line,
        column: 0,
        message: site.message,
        token: site.message === DOUBLE_CAST_MSG ? "double-cast" : "literal-cast",
      };
      ctx.report(finding);
    }
  },
  // NOTE: the BASELINE-BUDGET ratchet arms (a file AT its baseline passes; EXCEEDING REDs only the excess;
  // a regenerate-baseline shift) need an INJECTED baseline via createNoTestFabrication — the conformance
  // runner cannot inject one (an in-memory example has no baseline.json), so those arms are not expressible
  // as examples. Their coverage is retained in tests/tooling/no-test-fabrication.residual.test.ts (the
  // baseline arithmetic) + the live `pnpm check:structure` run (the real baseline.json). Only the pure
  // detection FLAG/PASS branches (budget 0) port as examples below.
  mustFlag: [
    {
      files: "export const x = {} as unknown as { a: number };\n",
      at: "tests/tooling/x.test.ts",
      expect: { messageIncludes: "double-cast" },
      why: "an `X as unknown as Y` double-cast in a test with no baseline budget — a fabrication (W1h)",
    },
    {
      files: "export const b = { n: 1 } as Widget;\n",
      at: "tests/tooling/lit.test.ts",
      expect: { messageIncludes: "literal" },
      why: "an object-literal `as Y` (Y not const/any/unknown) — a hand-shaped literal asserted complete",
    },
    {
      files: "export const c = [1, 2] as Widget[];\n",
      at: "tests/tooling/arr.test.ts",
      expect: { messageIncludes: "literal" },
      why: "an array-literal `as Y[]` — the same fabrication shape",
    },
  ],
  mustPass: [
    {
      files: "export const x = { a: 1 } satisfies { a: number };\n",
      at: "tests/tooling/y.test.ts",
      why: "`satisfies Y` re-checks the literal on every change — the sanctioned shape, passes",
    },
    {
      files:
        "export const a = { n: 1 } as const;\nexport const b = { n: 1 } as unknown;\nexport const c = [1] as any;\n",
      at: "tests/tooling/exempt.test.ts",
      why: "`as const`/`as unknown`/`as any` are the exempt cast types — passes",
    },
    {
      files: "export const b = { n: 1 } as Widget; // FABRICATION-OK: invalid-input probe\n",
      at: "tests/tooling/escape-same.test.ts",
      why: "a `// FABRICATION-OK` comment on the SAME line exempts the deliberate-fabrication site — passes",
    },
    {
      files:
        "// FABRICATION-OK: negative-space never-cast\nexport const a = {} as unknown as Widget;\n",
      at: "tests/tooling/escape-above.test.ts",
      why: "a `// FABRICATION-OK` comment on the line ABOVE exempts the site — passes",
    },
    {
      files: "export const a = {} as unknown as { n: number };\n",
      at: "packages/server/src/domain/widget/x.ts",
      why: "scope: a fabrication cast OUTSIDE tests/ is not gated here — passes",
    },
  ],
};
