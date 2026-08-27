// @instrument-proof: the family-(2) predicate must fire on the AST BABEL ACTUALLY EMITS for a real
//   `default:` exhaustiveness arm — the unit pins build their nodes by hand, so they prove the LOGIC and
//   not the SHAPE. If babel spelled a default arm `test: undefined` where the rule expects `null` (or
//   nested the `never` declaration one level deeper), every unit pin would still pass while the ignorer
//   silently matched nothing on the real tree: a decorative suppressor, the exact lying-instrument class
//   this repo keeps paying for.
// @instrument-absence-proof: the same walk must NOT match a reachable `case` arm or an ordinary block —
//   an over-matching rule would delete real mutants from the denominator and inflate the score, which is
//   the dangerous direction (a ratchet that cannot go down).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@babel/parser";
import { shouldIgnoreArid } from "../../../../tooling/src/mutation-arid/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** The canonical two-arm dispatcher: `domain/admin/guard.ts` is the `can()` kernel, and its two `default:`
 *  clauses are the house exhaustiveness shape (`const _exhaustive: never = …`). Measured with
 *  `pnpm mutation:probe` on 2026-08-26: 6 of its 8 planted survivors sat in exactly these two arms. */
const SUBJECT = "packages/server/src/domain/admin/guard.ts";

interface Walked {
  readonly switchCases: number;
  readonly defaultArms: number;
  readonly matchedLines: readonly number[];
  readonly matchedTypes: readonly string[];
}

function walkReal(repoRoot: string): Walked {
  const ast = parse(readFileSync(join(repoRoot, SUBJECT), "utf8"), { sourceType: "module", plugins: ["typescript"] });
  let switchCases = 0;
  let defaultArms = 0;
  const matchedLines: number[] = [];
  const matchedTypes: string[] = [];
  const walk = (node: unknown, parentPath: unknown): void => {
    if (node === null || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        walk(child, parentPath);
      }
      return;
    }
    const n = node as { readonly type?: unknown; readonly test?: unknown; readonly loc?: { readonly start: { readonly line: number } } };
    if (typeof n.type !== "string") {
      return;
    }
    const path = { node, parentPath };
    if (n.type === "SwitchCase") {
      switchCases += 1;
      if (n.test === null || n.test === undefined) {
        defaultArms += 1;
      }
    }
    // The predicate reads the same duck-typed shape the Stryker plugin hands it.
    if (shouldIgnoreArid(path as Parameters<typeof shouldIgnoreArid>[0]) !== undefined) {
      matchedLines.push(n.loc?.start.line ?? -1);
      matchedTypes.push(n.type);
    }
    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "leadingComments" || key === "trailingComments") {
        continue;
      }
      walk((node as Record<string, unknown>)[key], path);
    }
  };
  walk(ast.program, undefined);
  return { switchCases, defaultArms, matchedLines, matchedTypes };
}

test("family (2) fires on the AST babel really emits — and only on the unreachable arms", ({ repoRoot }) => {
  const seen = walkReal(repoRoot);

  // The corpus this is measured against, so a REFACTOR of guard.ts that removes its dispatchers turns this
  // into a loud red rather than a vacuous green (matched:0 would otherwise "pass" the absence arm).
  expect(seen.switchCases, "guard.ts must still be a dispatcher — otherwise this pin proves nothing").toBeGreaterThan(0);
  expect(seen.defaultArms, "guard.ts must still carry `default:` exhaustiveness arms").toBe(2);

  // POSITIVE: both arms matched. The rule matches the SwitchCase and the BlockStatement inside it; Stryker
  // ignores the subtree under whichever it hits first, so both is redundant, never wrong.
  expect(seen.matchedLines.length, "the real `default:` arms must be recognised").toBeGreaterThan(0);
  expect(new Set(seen.matchedTypes)).toEqual(new Set(["SwitchCase", "BlockStatement"]));

  // NEGATIVE: exactly the default arms, never a reachable `case`. guard.ts has 6 cases and 2 defaults, so a
  // rule that leaked onto reachable arms would show more matched SwitchCases than defaults.
  const matchedSwitchCases = seen.matchedTypes.filter((t) => t === "SwitchCase").length;
  expect(matchedSwitchCases, "only the `default:` arms may match — a reachable case is live code").toBe(seen.defaultArms);
});
