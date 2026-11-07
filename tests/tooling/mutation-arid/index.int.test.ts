// The unit pins build nodes by hand, so they prove the logic and not the shape. This walks the AST babel really
// emits, in both directions: a real exhaustive arm must match, and a reachable case must not.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@babel/parser";
import { expect, test } from "@orb/testkit/tooling";
import { shouldIgnoreArid } from "@orb/tooling/mutation-arid";

/** The canonical two-arm dispatcher: the `can()` kernel, whose two `default:` clauses are the house exhaustiveness shape. */
const SUBJECT = "packages/server/src/domain/admin/guard.ts";

/** Babel attaches these back-references and position blobs to most nodes; walking them re-visits the same
 *  subtree (and, for `loc`, adds nothing the predicate reads). */
const SKIP_KEYS = new Set(["loc", "leadingComments", "trailingComments"]);

interface Walked {
  readonly switchCases: number;
  readonly defaultArms: number;
  readonly matchedLines: readonly number[];
  readonly matchedTypes: readonly string[];
}

/** The mutable half of `Walked`, threaded through the walk so the recursion stays a pure function of
 *  (node, parent) instead of a closure over four captured counters. */
interface Tally {
  switchCases: number;
  defaultArms: number;
  readonly matchedLines: number[];
  readonly matchedTypes: string[];
}

interface AstNode {
  readonly type?: unknown;
  readonly test?: unknown;
  readonly loc?: { readonly start: { readonly line: number } };
}

/** Census one node: count the arm if it is a `SwitchCase`, and record it if the predicate claims it.
 *  `path` is the duck-typed shape the Stryker plugin hands the rule — node plus its parent chain. */
function census(n: AstNode, path: unknown, tally: Tally): void {
  if (n.type === "SwitchCase") {
    tally.switchCases += 1;
    const { test: caseValue } = n;
    if (caseValue === null || caseValue === undefined) {
      tally.defaultArms += 1;
    }
  }
  if (shouldIgnoreArid(path as Parameters<typeof shouldIgnoreArid>[0]) !== undefined) {
    const loc = n.loc;
    tally.matchedLines.push(loc === undefined ? -1 : loc.start.line);
    tally.matchedTypes.push(n.type as string);
  }
}

function walk(node: unknown, parentPath: unknown, tally: Tally): void {
  if (node === null || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      walk(child, parentPath, tally);
    }
    return;
  }
  const n = node as AstNode;
  if (typeof n.type !== "string") {
    return;
  }
  const path = { node, parentPath };
  census(n, path, tally);
  for (const key of Object.keys(node)) {
    if (!SKIP_KEYS.has(key)) {
      walk((node as Record<string, unknown>)[key], path, tally);
    }
  }
}

function walkReal(repoRoot: string): Walked {
  const ast = parse(readFileSync(join(repoRoot, SUBJECT), "utf8"), { sourceType: "module", plugins: ["typescript"] });
  const tally: Tally = { switchCases: 0, defaultArms: 0, matchedLines: [], matchedTypes: [] };
  walk(ast.program, undefined, tally);
  return tally;
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
