// The rule-frontmatter reader: only the YAML list form counts as `paths:`.
import { parseRulePaths } from "../../../../tooling/src/agent-sync/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the list form yields its globs, quoted or bare", () => {
  expect(parseRulePaths('---\npaths:\n  - "docs/**"\n  - packages/db/**\n---\n\n# Rule\n')).toEqual({ kind: "list", globs: ["docs/**", "packages/db/**"] });
});

test("an inline value is reported as inline, not as a list", () => {
  expect(parseRulePaths('---\npaths: ["docs/**"]\n---\n')).toEqual({ kind: "inline" });
});

test("no frontmatter, no paths key, and an empty list are all missing", () => {
  expect(parseRulePaths("# Rule\n")).toEqual({ kind: "missing" });
  expect(parseRulePaths("---\ndescription: x\n---\n")).toEqual({ kind: "missing" });
  expect(parseRulePaths("---\npaths:\n---\n")).toEqual({ kind: "missing" });
});
