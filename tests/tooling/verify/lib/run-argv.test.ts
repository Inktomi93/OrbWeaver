// The verify argv grammar where `--changed` is both a selector and a tier. The wider parse matrix lives in
// tests/tooling/verify/ops/run.int.test.ts; this file pins the pre-commit spelling.
import { parse } from "../../../../tooling/src/verify/lib/run-argv.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

// A docs-only path keeps selection resolution off the compiler-closure planner.
const DOC = "docs/law/Constitution.md";

function tierAndScope(argv: readonly string[]): readonly [string, string | undefined] {
  const r = parse(argv);
  if ("error" in r) {
    throw new Error(`expected a parse, got misuse: ${r.error}`);
  }
  return [r.tier, r.selection?.kind];
}

test("--changed beside an explicit tier is only the selector: pre-commit runs the static stages over the working change", () => {
  expect(tierAndScope(["--static", "--changed", DOC])).toStrictEqual(["static", "changed"]);
  expect(tierAndScope(["--tier", "static", "--changed", DOC]), "the --tier spelling agrees").toStrictEqual(["static", "changed"]);
  expect(tierAndScope(["--changed", DOC]), "alone, --changed still names the inner-loop tier").toStrictEqual(["changed", "changed"]);
});
