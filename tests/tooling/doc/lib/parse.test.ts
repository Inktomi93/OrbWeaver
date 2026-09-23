// The argv parser: every verb's shape, the list-taking forms, and misuse refused as UsageError so the cli
// exits 3, never 1 or 2.
import { UsageError } from "../../../../tooling/src/_shared/run-tool.ts";
import { parseDocCommand } from "../../../../tooling/src/doc/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the minting verbs", () => {
  expect(parseDocCommand(["new", "adr", "a-slug", "--title", "A title"])).toEqual({ kind: "new-adr", slug: "a-slug", title: "A title" });
  expect(parseDocCommand(["new", "plan", "p"])).toEqual({ kind: "new-plan", slug: "p", title: null });
  expect(parseDocCommand(["item", "Fix", "the", "thing", "--kind", "bug", "--priority", "P1", "--lane", "cb-x"])).toEqual({
    kind: "item",
    title: "Fix the thing",
    itemKind: "bug",
    priority: "P1",
    area: null,
    plan: null,
    lane: "cb-x",
  });
});

test("set takes a leading run of ids, the state last, and only the flags it was given", () => {
  expect(parseDocCommand(["set", "12", "14", "blocked", "--blocked", "on 1", "--priority", "-"])).toEqual({
    kind: "set",
    ids: [12, 14],
    patch: { state: "blocked", blocked: "on 1", priority: null },
  });
  expect(parseDocCommand(["land", "3", "--evidence", "abc"])).toEqual({ kind: "land", ids: [3], evidence: "abc" });
  expect(parseDocCommand(["land", "--merged"])).toEqual({ kind: "land-merged" });
  expect(parseDocCommand(["status", "superseded", "docs/adr/0001-a.md", "--by", "docs/adr/0002-b.md"])).toEqual({
    kind: "status",
    status: "superseded",
    paths: ["docs/adr/0001-a.md"],
    by: "docs/adr/0002-b.md",
  });
  expect(parseDocCommand(["review", "docs/law/*.md"])).toEqual({ kind: "review", patterns: ["docs/law/*.md"] });
  expect(parseDocCommand(["due"])).toEqual({ kind: "due", patterns: [] });
  expect(parseDocCommand([])).toEqual({ kind: "help" });
});

test("misuse is a UsageError: an unknown verb, a bad slug, a missing required flag, an unknown flag, a non-numeric id", () => {
  for (const argv of [
    ["frobnicate"],
    ["new", "adr", "Not A Slug"],
    ["item", "x"],
    ["set", "1", "done", "--bogus", "y"],
    ["set", "one", "done"],
    ["set", "1", "sideways"],
  ]) {
    expect(() => parseDocCommand(argv)).toThrow(UsageError);
  }
});
