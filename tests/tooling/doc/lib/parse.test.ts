// The argv parser: every verb's shape, the list-taking forms, and misuse refused as UsageError so the cli
// exits 3, never 1 or 2.
import { UsageError } from "../../../../tooling/src/_shared/run-tool.ts";
import { parseDocCommand } from "../../../../tooling/src/doc/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the minting verbs", () => {
  expect(parseDocCommand(["new", "adr", "a-slug", "--title", "A title", "--decision", "Do it.", "--alternatives", "None."])).toEqual({
    kind: "new-adr",
    slug: "a-slug",
    title: "A title",
    content: { decision: "Do it.", alternatives: "None." },
  });
  expect(parseDocCommand(["new", "plan", "p", "--test-plan", "One test."])).toEqual({
    kind: "new-plan",
    slug: "p",
    title: null,
    content: { "test-plan": "One test." },
  });
  expect(parseDocCommand(["item", "Fix", "the", "thing", "--kind", "bug", "--priority", "P1", "--lane", "cb-x"])).toEqual({
    kind: "item",
    input: { title: "Fix the thing", kind: "bug", priority: "P1", area: null, plan: null, lane: "cb-x", blocked: null, content: {} },
  });
  expect(
    parseDocCommand(["item", "Wait", "--kind", "work", "--blocked", "on 3", "--what", "The change.", "--why", "The symptom.", "--done", "The bar."]),
  ).toEqual({
    kind: "item",
    input: {
      title: "Wait",
      kind: "work",
      priority: null,
      area: null,
      plan: null,
      lane: null,
      blocked: "on 3",
      content: { what: "The change.", why: "The symptom.", done: "The bar." },
    },
  });
  expect(parseDocCommand(["item", "--from", "items.json"])).toEqual({ kind: "item-batch", from: "items.json" });
});

test("set takes a leading run of ids, the state last, and only the flags it was given", () => {
  expect(parseDocCommand(["set", "12", "14", "blocked", "--blocked", "on 1", "--priority", "-"])).toEqual({
    kind: "set",
    ids: [12, 14],
    patch: { state: "blocked", blocked: "on 1", priority: null },
  });
  expect(parseDocCommand(["land", "3", "--evidence", "abc"])).toEqual({ kind: "land", ids: [3], evidence: "abc" });
  expect(parseDocCommand(["land", "--merged"])).toEqual({ kind: "land-merged", headMerge: false });
  expect(parseDocCommand(["land", "--merged", "--head-merge"])).toEqual({ kind: "land-merged", headMerge: true });
  expect(parseDocCommand(["status", "superseded", "docs/adr/0001-a.md", "--by", "docs/adr/0002-b.md"])).toEqual({
    kind: "status",
    status: "superseded",
    paths: ["docs/adr/0001-a.md"],
    by: "docs/adr/0002-b.md",
    docKind: null,
    blocked: null,
  });
  expect(parseDocCommand(["status", "active", "docs/law/x.md", "--kind", "law"])).toEqual({
    kind: "status",
    status: "active",
    paths: ["docs/law/x.md"],
    by: null,
    docKind: "law",
    blocked: null,
  });
  expect(parseDocCommand(["status", "parked", "docs/plans/p/design.md", "--blocked", "wake path x"])).toEqual({
    kind: "status",
    status: "parked",
    paths: ["docs/plans/p/design.md"],
    by: null,
    docKind: null,
    blocked: "wake path x",
  });
  expect(parseDocCommand(["new", "law", "review-rules", "--title", "Review rules"])).toEqual({ kind: "new-law", slug: "review-rules", title: "Review rules" });
  expect(parseDocCommand(["set", "3", "--kind", "work", "--plan", "none"])).toEqual({ kind: "set", ids: [3], patch: { kind: "work", plan: null } });
  expect(parseDocCommand(["set", "3", "open", "--title", "A new title"])).toEqual({ kind: "set", ids: [3], patch: { state: "open", title: "A new title" } });
  expect(parseDocCommand(["remove", "3", "docs/adr/0001-a.md"])).toEqual({ kind: "remove", targets: ["3", "docs/adr/0001-a.md"] });
  expect(parseDocCommand(["review", "docs/law/*.md"])).toEqual({ kind: "review", patterns: ["docs/law/*.md"] });
  expect(parseDocCommand(["due"])).toEqual({ kind: "due", patterns: [] });
  expect(parseDocCommand([])).toEqual({ kind: "help" });
});

test("misuse is a UsageError: an unknown verb, a bad slug, a missing required flag, an unknown flag, a non-numeric id", () => {
  for (const argv of [
    ["frobnicate"],
    ["new", "adr", "Not A Slug"],
    ["item", "x"],
    ["item", "--from", "items.json", "--kind", "work"],
    ["item", "Title", "--from", "items.json"],
    ["new", "adr", "a", "--goal", "a plan flag"],
    ["new", "plan", "p", "--decision", "an ADR flag"],
    ["set", "1", "done", "--bogus", "y"],
    ["set", "one", "done"],
    ["set", "1", "sideways"],
    ["set", "1"],
    ["set", "1", "2", "--title", "One title for two items"],
    ["set", "1", "--kind", "adr"],
    ["remove"],
    ["remove", "3", "--force"],
    ["land", "--merged", "--bogus"],
    ["land", "--merged", "--head-merge", "extra"],
    ["archive", "p"],
    ["new", "law", "Not A Slug"],
    ["new", "law", "x", "--context", "an ADR flag"],
  ]) {
    expect(() => parseDocCommand(argv)).toThrow(UsageError);
  }
});
