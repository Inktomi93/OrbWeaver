// The verify argv grammar where `--changed` is both a selector and a tier, read through `parseRequest`, which
// resolves no selection and so spawns nothing. The wider parse matrix lives in run.int.test.ts.
import { parseRequest } from "../../../../tooling/src/verify/lib/run-argv.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const DOC = "docs/law/Constitution.md";

function tierAndScope(argv: readonly string[]): readonly [string, string | undefined] {
  const r = parseRequest(argv);
  if ("error" in r) {
    throw new Error(`expected a parse, got misuse: ${r.error}`);
  }
  return [r.tier, r.request?.kind];
}

test("--changed beside an explicit tier is only the selector: pre-commit runs the static stages over the working change", () => {
  expect(tierAndScope(["--static", "--changed", DOC])).toStrictEqual(["static", "changed"]);
  expect(tierAndScope(["--tier", "static", "--changed", DOC]), "the --tier spelling agrees").toStrictEqual(["static", "changed"]);
  expect(tierAndScope(["--changed", DOC]), "alone, --changed still names the inner-loop tier").toStrictEqual(["changed", "changed"]);
});

// The commit gate spells `--changed staged`: the index, never the working change; `git` and bare keep the working change.
test("--changed staged selects the index; bare and git select the working change", () => {
  expect(tierAndScope(["--static", "--changed", "staged"])).toStrictEqual(["static", "staged"]);
  expect(tierAndScope(["--static", "--changed", "git"])).toStrictEqual(["static", "changed"]);
  expect(tierAndScope(["--static", "--changed"])).toStrictEqual(["static", "changed"]);
});

test("--changed beside --push or --full stays misuse: those tiers are whole-tree bars, and a scoped one would skip the queue", () => {
  for (const argv of [
    ["--push", "--changed", DOC],
    ["--full", "--changed", DOC],
    ["--tier", "push", "--changed", DOC],
  ]) {
    const r = parseRequest(argv);
    expect("error" in r ? r.error : "parsed", argv.join(" ")).toContain("--changed");
  }
});
