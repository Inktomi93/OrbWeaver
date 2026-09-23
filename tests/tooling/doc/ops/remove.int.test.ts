// `pnpm doc remove` on planted trees: a mistaken item goes and the indexes follow; an item another item
// is blocked on, one another doc refers to, a done item and an unknown id all refuse, all-or-nothing.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { newAdr, newItem, removeItems, setItems } from "../../../../tooling/src/doc/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const TODAY = "2026-09-23";
const OPEN = { priority: null, area: null, plan: null, lane: null } as const;

test("remove deletes items nothing depends on and regenerates the indexes; a blocker on a removed sibling rides along", async ({ plantedTree }) => {
  const root = await plantedTree({});
  newItem({ title: "Mistake", kind: "work", ...OPEN }, root, TODAY);
  newItem({ title: "Also a mistake", kind: "work", ...OPEN, blocked: "on 1" }, root, TODAY);
  newItem({ title: "Keeper", kind: "work", ...OPEN }, root, TODAY);
  const outcome = removeItems([1, 2], root);
  expect(outcome.refusals).toEqual([]);
  expect(outcome.written).toEqual(["docs/work/0001-mistake.md", "docs/work/0002-also-a-mistake.md", "docs/work/README.md"]);
  expect(existsSync(join(root, "docs/work/0001-mistake.md"))).toBe(false);
  const index = readFileSync(join(root, "docs/work/README.md"), "utf8");
  expect(index).not.toContain("Mistake");
  expect(index).toContain("Keeper");
});

test("remove refuses an item another item is blocked on or another doc refers to, a done item and an unknown id, writing nothing", async ({ plantedTree }) => {
  const root = await plantedTree({});
  newItem({ title: "Needed", kind: "work", ...OPEN }, root, TODAY);
  newItem({ title: "Waiting", kind: "work", ...OPEN, blocked: "on 1" }, root, TODAY);
  newItem({ title: "Cited", kind: "work", ...OPEN }, root, TODAY);
  newAdr({ slug: "cites", title: "Cites", content: { context: "See `docs/work/0003-cited.md`." } }, root, TODAY);
  newItem({ title: "Linked", kind: "work", ...OPEN }, root, TODAY);
  newItem({ title: "Linker", kind: "work", ...OPEN, content: { what: "Follows [it](0004-linked.md)." } }, root, TODAY);
  expect(removeItems([1], root).refusals).toEqual(["docs/work/0002-waiting.md: blocked on 1 — change its blocker first: pnpm doc set 2 open"]);
  expect(removeItems([3], root).refusals).toEqual(["docs/adr/0001-cites.md: refers to docs/work/0003-cited.md — remove the reference first"]);
  expect(removeItems([4], root).refusals).toEqual(["docs/work/0005-linker.md: refers to docs/work/0004-linked.md — remove the reference first"]);
  expect(removeItems([9], root).refusals).toEqual(["9: no such item under docs/work/ — pnpm doc overview lists them"]);
  const { execFixtureGit } = await import("../../../../tooling/src/_shared/git-fixture.ts");
  execFixtureGit(root, ["init", "-q", "-b", "main"]);
  execFixtureGit(root, ["add", "-A"]);
  execFixtureGit(root, ["-c", "user.name=Doc Test", "-c", "user.email=doc@example.invalid", "commit", "-qm", "chore: base"]);
  const head = execFixtureGit(root, ["rev-parse", "HEAD"]).trim();
  expect(setItems([5], { state: "done", evidence: head }, root, TODAY).refusals).toEqual([]);
  expect(removeItems([5, 4], root).refusals).toEqual(["docs/work/0005-linker.md: done, and a landing is a record — pnpm doc archive 5 retires it"]);
  for (const path of ["docs/work/0001-needed.md", "docs/work/0003-cited.md", "docs/work/0004-linked.md", "docs/work/0005-linker.md"]) {
    expect(existsSync(join(root, path))).toBe(true);
  }
});
