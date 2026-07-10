// Gate: no-test-fabrication (core/Spine-Testing.md §5; test-support-dry-punchlist.md §5 / W1h) — bans the
// two fabricated-entity shapes that compile STRAIGHT THROUGH a type change, the "source changed, tests
// never knew" hole:
//   (a) `X as unknown as Y` double-casts — the escape hatch that silently survives Y gaining/renaming a
//       required field (the 2026-07-09 census found 168, concentrated on ResolvedCredential/ModelCapability
//       /UpdateCharacterInput/… — server/infra owns 72).
//   (b) an object- or array-literal `as Y` where Y is not `const`/`any`/`unknown` — a hand-shaped literal
//       asserted complete; when Y grows a field, the literal is silently wrong (census: 67). The fix is a
//       typed factory (`makeResolvedCredential(overrides?)` — a new required field errors in ONE place) or
//       `satisfies Y` (which re-checks the literal against Y on every change).
//
// ESCAPE HATCH: a `// FABRICATION-OK: <reason>` comment on the SAME line or the line ABOVE the cast exempts
// that site — for the deliberate invalid-input probes (the `never`-cast negative-space tests, `{__behaviors}`
// stubs) that fabricate on PURPOSE.
//
// BASELINE RATCHET (no-test-fabrication.baseline.json, tests/-relative path → current count): a file
// violates only when its live count EXCEEDS its baseline (a file absent from the baseline has baseline 0, so
// a NEW fabrication anywhere is RED). Shrink an entry as W1h converts its sites to factories/`satisfies`;
// never grow one. Regenerate deliberately (scripts/check/gen-fabrication-baseline.ts) only when a legitimate
// bulk shift lands — the point is the count can only fall.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AsExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
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

export const noTestFabrication: Check = createNoTestFabrication();
