// The write verbs on planted trees: what each writes, the indexes it regenerates, and the refusal that
// writes nothing. A suite because the verbs share one planted shape and each proves a different door.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { UsageError } from "../../../../tooling/src/_shared/run-tool.ts";
import {
  archive,
  newAdr,
  newItem,
  newItemsFrom,
  newPlan,
  nextAdrId,
  regenerateIndexes,
  review,
  setItems,
  setStatus,
} from "../../../../tooling/src/doc/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const TODAY = "2026-09-23";
const ADR_SOURCE = "---\nkind: adr\nstatus: active\nupdated: 2026-01-01\n---\n\n# A decision\n";

function read(root: string, path: string): string {
  return readFileSync(join(root, path), "utf8");
}

test("new adr mints at the next free id past the ADR tree and the reserved range, and refuses a twin slug", async ({ plantedTree }) => {
  const root = await plantedTree({
    "docs/adr/0001-one.md": ADR_SOURCE,
    "docs/adr/0163-last.md": ADR_SOURCE,
    "docs/Mission.md": "---\nkind: law\nstatus: active\nupdated: 2026-01-01\n---\n\n# M\n",
  });
  expect(nextAdrId(root)).toBe(164);
  const first = newAdr({ slug: "docs-system", title: "Docs system" }, root, TODAY);
  expect(first.refusals).toEqual([]);
  expect(first.written).toEqual(["docs/adr/0164-docs-system.md", "docs/adr/README.md", "docs/plans/README.md", "docs/work/README.md", "docs/law/README.md"]);
  expect(read(root, "docs/adr/0164-docs-system.md")).toContain("---\nkind: adr\nstatus: active\nupdated: 2026-09-23\n---\n\n# Docs system\n\n## Context\n");
  expect(read(root, "docs/adr/README.md")).toContain("| D164 | [Docs system](0164-docs-system.md) | active |");
  expect(nextAdrId(root)).toBe(165);
  const twin = newAdr({ slug: "docs-system", title: null }, root, TODAY);
  expect(twin.written).toEqual([]);
  expect(twin.refusals[0]).toContain("an ADR with slug docs-system exists");
  const reservedOnly = await plantedTree({ "docs/adr/0078-y.md": ADR_SOURCE });
  expect(nextAdrId(reservedOnly)).toBe(106);
});

test("new plan mints design.md in its own folder and refuses an existing folder", async ({ plantedTree }) => {
  const root = await plantedTree({});
  const outcome = newPlan({ slug: "doc-migration", title: null }, root, TODAY);
  expect(outcome.written[0]).toBe("docs/plans/doc-migration/design.md");
  expect(read(root, "docs/plans/doc-migration/design.md")).toContain("# Doc migration\n\n## Goal\n");
  expect(read(root, "docs/plans/README.md")).toContain("| [Doc migration](doc-migration/design.md) | active |");
  expect(newPlan({ slug: "doc-migration", title: null }, root, TODAY).refusals[0]).toContain("docs/plans/doc-migration/: exists");
});

test("status writes both halves of a supersession and refuses a status the kind does not take", async ({ plantedTree }) => {
  const root = await plantedTree({});
  newAdr({ slug: "first", title: "First" }, root, TODAY);
  newAdr({ slug: "second", title: "Second" }, root, TODAY);
  const refused = setStatus({ status: "done", paths: ["docs/adr/0001-first.md"], by: null }, root, TODAY);
  expect(refused.written).toEqual([]);
  expect(refused.refusals).toEqual(["docs/adr/0001-first.md: status done is not one of active | superseded for kind adr"]);
  const superseded = setStatus({ status: "superseded", paths: ["docs/adr/0001-first.md"], by: "docs/adr/0002-second.md" }, root, "2026-09-24");
  expect(superseded.refusals).toEqual([]);
  expect(read(root, "docs/adr/0001-first.md")).toContain(
    "---\nkind: adr\nstatus: superseded\nupdated: 2026-09-24\nsuperseded-by: docs/adr/0002-second.md\n---\n",
  );
  expect(read(root, "docs/adr/0002-second.md")).toContain("supersedes: docs/adr/0001-first.md\n");
  expect(read(root, "docs/adr/README.md")).toContain("| D1 | [First](0001-first.md) | superseded by [0002-second.md](0002-second.md) |");
});

test("item mints under docs/work with the next id, joins its plan's tasks.md, and refuses an unknown plan", async ({ plantedTree }) => {
  const root = await plantedTree({});
  newPlan({ slug: "p", title: "P" }, root, TODAY);
  const missing = newItem({ title: "Fix it", kind: "bug", priority: "P1", area: "docs", plan: "ghost", lane: null }, root, TODAY);
  expect(missing.written).toEqual([]);
  expect(missing.refusals[0]).toContain("no such plan");
  const first = newItem({ title: "Fix it", kind: "bug", priority: "P1", area: "docs", plan: "p", lane: null }, root, TODAY);
  expect(first.written).toContain("docs/work/0001-fix-it.md");
  expect(first.written).toContain("docs/plans/p/tasks.md");
  const second = newItem({ title: "Then this", kind: "work", priority: null, area: null, plan: null, lane: "cb-x" }, root, TODAY);
  expect(second.written).toContain("docs/work/0002-then-this.md");
  expect(read(root, "docs/work/0002-then-this.md")).toContain(
    "---\nkind: work\nstatus: doing\nupdated: 2026-09-23\nlane: cb-x\n---\n\n# Then this\n\n## What\n",
  );
  expect(read(root, "docs/plans/p/tasks.md")).toContain("- [ ] [0001](../../work/0001-fix-it.md) P1 Fix it `p`\n");
  expect(read(root, "docs/work/README.md")).toContain("## Doing\n\n- [0002](0002-then-this.md) triage Then this (cb-x)\n");
});

test("set transitions N items in one write, judges the final shape, and refuses all-or-nothing", async ({ plantedTree }) => {
  const root = await plantedTree({});
  newItem({ title: "A", kind: "work", priority: null, area: null, plan: null, lane: null }, root, TODAY);
  newItem({ title: "B", kind: "work", priority: null, area: null, plan: null, lane: null }, root, TODAY);
  const half = setItems([1, 2], { state: "doing" }, root, TODAY);
  expect(half.written).toEqual([]);
  expect(half.refusals).toEqual([
    "docs/work/0001-a.md: a doing item names its lane: pnpm doc set <id> doing --lane <lane>",
    "docs/work/0002-b.md: a doing item names its lane: pnpm doc set <id> doing --lane <lane>",
  ]);
  expect(read(root, "docs/work/0001-a.md")).toContain("status: open\n");
  const both = setItems([1, 2], { state: "blocked", blocked: "on 2" }, root, "2026-09-24");
  expect(both.written).toEqual(["docs/work/0001-a.md", "docs/work/0002-b.md", "docs/work/README.md"]);
  expect(read(root, "docs/work/0002-b.md")).toContain("status: blocked\nupdated: 2026-09-24\nblocked: on 2\n");
  expect(setItems([9], { state: "open" }, root, TODAY).refusals[0]).toContain("9: no such item");
});

test("review sets updated on a glob of docs in one write, and index regenerates only stale files", async ({ plantedTree }) => {
  const root = await plantedTree({});
  newAdr({ slug: "one", title: "One" }, root, "2026-01-01");
  newAdr({ slug: "two", title: "Two" }, root, "2026-01-01");
  const reviewed = review(["docs/adr/*.md"], root, TODAY);
  expect(reviewed.written).toEqual(["docs/adr/0001-one.md", "docs/adr/0002-two.md"]);
  expect(read(root, "docs/adr/0002-two.md")).toContain("updated: 2026-09-23\n");
  expect(review(["docs/adr/nope-*.md"], root, TODAY).refusals[0]).toContain("selects no governed document");
  expect(regenerateIndexes(root)).toEqual([]);
});

test("index deletes a plan's tasks.md once its last item leaves the plan (F11)", async ({ plantedTree }) => {
  const root = await plantedTree({});
  newPlan({ slug: "p", title: "P" }, root, TODAY);
  newItem({ title: "Task", kind: "work", priority: null, area: null, plan: "p", lane: null }, root, TODAY);
  expect(existsSync(join(root, "docs/plans/p/tasks.md"))).toBe(true);
  const moved = setItems([1], { state: "open", plan: null }, root, TODAY);
  expect(moved.written).toContain("docs/plans/p/tasks.md");
  expect(existsSync(join(root, "docs/plans/p/tasks.md"))).toBe(false);
});

test("archive moves a finished plan and its done items into the dated archive folder and rewrites the old path everywhere tracked", async ({ plantedTree }) => {
  const root = await plantedTree({ "packages/kit/src/x.ts": "// See docs/plans/p/design.md for the shape.\nexport const x = 1;\n" });
  const { execFixtureGit } = await import("../../../../tooling/src/_shared/git-fixture.ts");
  execFixtureGit(root, ["init", "-q", "-b", "main"]);
  execFixtureGit(root, ["add", "-A"]);
  newPlan({ slug: "p", title: "P" }, root, TODAY);
  newItem({ title: "Task", kind: "work", priority: null, area: null, plan: "p", lane: null }, root, TODAY);
  execFixtureGit(root, ["add", "-A"]);
  execFixtureGit(root, ["-c", "user.name=Doc Test", "-c", "user.email=doc@example.invalid", "commit", "-qm", "chore: base"]);
  const head = execFixtureGit(root, ["rev-parse", "HEAD"]).trim();
  const open = archive(["p"], root, TODAY);
  expect(open.written).toEqual([]);
  expect(open.refusals).toEqual(["docs/work/0001-task.md: open, and a plan archives only when every item is done"]);
  // The evidence is judged like a written item's: a commit that is not on main refuses.
  expect(setItems([1], { state: "done", evidence: "abc1234" }, root, TODAY).refusals).toEqual([
    "docs/work/0001-task.md: evidence abc1234 is not a commit on main — pnpm doc land <id> --evidence <sha> names one",
  ]);
  expect(setItems([1], { state: "done", evidence: head }, root, TODAY).refusals).toEqual([]);
  const done = archive(["p"], root, TODAY);
  expect(done.refusals).toEqual([]);
  expect(existsSync(join(root, "docs/plans/p"))).toBe(false);
  expect(read(root, "docs/plans/archive/2026-09-23-p/design.md")).toContain("status: archived\n");
  expect(existsSync(join(root, "docs/plans/archive/2026-09-23-p/0001-task.md"))).toBe(true);
  expect(read(root, "docs/plans/archive/2026-09-23-p/tasks.md")).toContain(`- [x] [0001](0001-task.md) triage Task \`p\` (${head.slice(0, 12)})\n`);
  expect(read(root, "packages/kit/src/x.ts")).toBe("// See docs/plans/archive/2026-09-23-p/design.md for the shape.\nexport const x = 1;\n");
  expect(read(root, "docs/plans/README.md")).toContain("| [P](archive/2026-09-23-p/design.md) | archived |");
  expect(archive(["ghost"], root, TODAY).refusals).toEqual(["docs/plans/ghost/: no such plan"]);
});

const OPEN = { priority: null, area: null, plan: null, lane: null } as const;
const TEXT = { what: "Mint items in one call.", why: "Filing took several calls.", done: "One call files a batch." };

test("item --from mints complete items at consecutive ids with one index regeneration, and a blocker may name a batch sibling", async ({ plantedTree }) => {
  const root = await plantedTree({
    "items.json": JSON.stringify([
      { title: "First", kind: "work", priority: "P2", area: "docs", ...TEXT },
      { title: "Second", kind: "bug", blocked: "on 2", ...TEXT },
      { title: "Third", kind: "decision", blocked: "owner", ...TEXT },
    ]),
  });
  newItem({ title: "Existing", kind: "work", ...OPEN }, root, TODAY);
  const outcome = newItemsFrom("items.json", root, TODAY);
  expect(outcome.refusals).toEqual([]);
  expect(outcome.written).toEqual(["docs/work/0002-first.md", "docs/work/0003-second.md", "docs/work/0004-third.md", "docs/work/README.md"]);
  expect(read(root, "docs/work/0003-second.md")).toBe(
    "---\nkind: bug\nstatus: blocked\nupdated: 2026-09-23\nblocked: on 2\n---\n\n# Second\n\n## What\n\nMint items in one call.\n\n## Why\n\nFiling took several calls.\n\n## Done when\n\nOne call files a batch.\n\n## Evidence\n\nFilled at landing: what ran and where its output is.\n",
  );
  expect(read(root, "docs/work/README.md")).toContain("## Blocked\n");
});

test("a batch with one item that breaks a writing rule writes nothing and names the finding", async ({ plantedTree }) => {
  const root = await plantedTree({
    "items.json": JSON.stringify([
      { title: "Clean", kind: "work", ...TEXT },
      { title: "Dirty", kind: "work", ...TEXT, why: "Tighten the belt before 2026-09-01." },
    ]),
  });
  newItem({ title: "Existing", kind: "work", ...OPEN }, root, TODAY);
  const index = read(root, "docs/work/README.md");
  const outcome = newItemsFrom("items.json", root, TODAY);
  expect(outcome.written).toEqual([]);
  expect(outcome.refusals).toEqual(['docs/work/0003-dirty.md:15: a date ("2026-09-01")', 'docs/work/0003-dirty.md:15: banned word "belt" ("belt")']);
  expect(existsSync(join(root, "docs/work/0002-clean.md"))).toBe(false);
  expect(existsSync(join(root, "docs/work/0003-dirty.md"))).toBe(false);
  expect(read(root, "docs/work/README.md")).toBe(index);
});

test("a single item is judged by the docs check before it is written: a banned word in its title refuses", async ({ plantedTree }) => {
  const root = await plantedTree({});
  const outcome = newItem({ title: "Tighten the belt", kind: "work", ...OPEN }, root, TODAY);
  expect(outcome.written).toEqual([]);
  expect(outcome.refusals).toEqual(['docs/work/0001-tighten-the-belt.md:7: banned word "belt" ("belt")']);
  expect(existsSync(join(root, "docs/work/0001-tighten-the-belt.md"))).toBe(false);
});

test("item refuses an item naming two states, a blocker on no item, and a dead path in its text", async ({ plantedTree }) => {
  const root = await plantedTree({});
  expect(newItem({ title: "Both", kind: "work", ...OPEN, lane: "cb-x", blocked: "owner" }, root, TODAY).refusals).toEqual([
    '"Both": a lane makes an item doing and a blocker makes it blocked — name one',
  ]);
  expect(newItem({ title: "Waits", kind: "work", ...OPEN, blocked: "on 99" }, root, TODAY).refusals).toEqual([
    "docs/work/0001-waits.md: blocked on 99, which is not an item under docs/work/",
  ]);
  expect(newItem({ title: "Cites", kind: "work", ...OPEN, content: { what: "Edit `tooling/src/gone.ts`." } }, root, TODAY).refusals).toEqual([
    "docs/work/0001-cites.md:11: path does not exist: tooling/src/gone.ts",
  ]);
  expect(existsSync(join(root, "docs/work"))).toBe(false);
});

test("item --from refuses a missing, malformed or misspelled batch file as misuse, before any write", async ({ plantedTree }) => {
  const root = await plantedTree({
    "broken.json": "[{",
    "empty.json": "[]",
    "typo.json": '[{ "title": "T", "kind": "work", "done_when": "x" }]',
  });
  for (const file of ["missing.json", "broken.json", "empty.json", "typo.json"]) {
    expect(() => newItemsFrom(file, root, TODAY)).toThrow(UsageError);
  }
  expect(() => newItemsFrom("typo.json", root, TODAY)).toThrow(/done_when/u);
  expect(existsSync(join(root, "docs/work"))).toBe(false);
});

test("new adr and new plan write the section text they are given, and refuse text the docs check would red", async ({ plantedTree }) => {
  const root = await plantedTree({});
  const adr = newAdr(
    { slug: "one", title: "One", content: { context: "Why.", decision: "The rule.", consequences: "What follows.", alternatives: "None." } },
    root,
    TODAY,
  );
  expect(adr.refusals).toEqual([]);
  expect(read(root, "docs/adr/0001-one.md")).toContain(
    "## Context\n\nWhy.\n\n## Decision\n\nThe rule.\n\n## Consequences\n\nWhat follows.\n\n## Alternatives rejected\n\nNone.\n",
  );
  const plan = newPlan({ slug: "p", title: "P", content: { goal: "The outcome.", "test-plan": "One test." } }, root, TODAY);
  expect(plan.refusals).toEqual([]);
  expect(read(root, "docs/plans/p/design.md")).toContain("## Goal\n\nThe outcome.\n\n## Shape\n\nThe chosen shape, with the homes it touches.\n");
  expect(read(root, "docs/plans/p/design.md")).toContain("## Test plan\n\nOne test.\n");
  const dirty = newAdr({ slug: "two", title: "Two", content: { decision: "Ruled in #12." } }, root, TODAY);
  expect(dirty.written).toEqual([]);
  expect(dirty.refusals).toEqual(['docs/adr/0002-two.md:15: an issue or PR number ("#12")']);
  expect(existsSync(join(root, "docs/adr/0002-two.md"))).toBe(false);
});

test("set changes an item's kind and clears its plan, which drops the plan's tasks.md", async ({ plantedTree }) => {
  const root = await plantedTree({});
  newPlan({ slug: "p", title: "P" }, root, TODAY);
  newItem({ title: "Parked", kind: "decision", ...OPEN, plan: "p" }, root, TODAY);
  const outcome = setItems([1], { kind: "work", plan: null }, root, "2026-09-24");
  expect(outcome.refusals).toEqual([]);
  expect(read(root, "docs/work/0001-parked.md")).toContain("---\nkind: work\nstatus: open\nupdated: 2026-09-24\n---\n\n# Parked\n");
  expect(existsSync(join(root, "docs/plans/p/tasks.md"))).toBe(false);
});

test("set --title renames the file and rewrites every reference to it, and leaves a same-named file in another folder alone", async ({ plantedTree }) => {
  const root = await plantedTree({});
  newAdr({ slug: "old-name", title: "An unrelated decision" }, root, TODAY);
  newItem({ title: "Old name", kind: "work", ...OPEN }, root, TODAY);
  newItem(
    { title: "Follower", kind: "work", ...OPEN, content: { what: "Follows [the first](0001-old-name.md) and [its twin](./0001-old-name.md)." } },
    root,
    TODAY,
  );
  newItem({ title: "Citer", kind: "work", ...OPEN, content: { what: "Cites `docs/work/0001-old-name.md`, not `docs/adr/0001-old-name.md`." } }, root, TODAY);
  const outcome = setItems([1], { title: "New name" }, root, TODAY);
  expect(outcome.refusals).toEqual([]);
  expect(outcome.written).toEqual(
    expect.arrayContaining(["docs/work/0001-new-name.md", "docs/work/0001-old-name.md", "docs/work/0002-follower.md", "docs/work/0003-citer.md"]),
  );
  expect(existsSync(join(root, "docs/work/0001-old-name.md"))).toBe(false);
  expect(read(root, "docs/work/0001-new-name.md")).toContain("\n# New name\n");
  expect(read(root, "docs/work/0002-follower.md")).toContain("Follows [the first](0001-new-name.md) and [its twin](./0001-new-name.md).");
  expect(read(root, "docs/work/0003-citer.md")).toContain("Cites `docs/work/0001-new-name.md`, not `docs/adr/0001-old-name.md`.");
  expect(read(root, "docs/work/README.md")).toContain("[0001](0001-new-name.md)");
});

test("set refuses an edit that introduces a finding, but not one that keeps a finding the item already had", async ({ plantedTree }) => {
  const root = await plantedTree({});
  newItem({ title: "Old prose", kind: "work", ...OPEN }, root, TODAY);
  const path = "docs/work/0001-old-prose.md";
  writeFileSync(join(root, path), read(root, path).replace("The change, in a sentence.", "This used to work."));
  const renamed = setItems([1], { title: "Tighten the belt" }, root, TODAY);
  expect(renamed.written).toEqual([]);
  expect(renamed.refusals).toEqual(['docs/work/0001-tighten-the-belt.md:7: banned word "belt" ("belt")']);
  expect(existsSync(join(root, path))).toBe(true);
  expect(setItems([1], { title: "   " }, root, TODAY).refusals).toEqual(['"   ": a title needs at least one word']);
  const moved = setItems([1], { state: "doing", lane: "cb-x" }, root, TODAY);
  expect(moved.refusals).toEqual([]);
  expect(read(root, path)).toContain("status: doing\n");
});

test("status --kind sets the kind of a law doc, and refuses a kind its path does not take", async ({ plantedTree }) => {
  const root = await plantedTree({ "docs/law/Rules.md": "---\nkind: reference\nstatus: active\nupdated: 2026-01-01\n---\n\n# Rules\n\nThe rules.\n" });
  const wrong = setStatus({ status: "active", paths: ["docs/law/Rules.md"], by: null, docKind: "adr" }, root, TODAY);
  expect(wrong.written).toEqual([]);
  expect(wrong.refusals).toEqual([
    "docs/law/Rules.md: kind adr is not allowed here; this path takes law",
    ...["Context", "Decision", "Consequences", "Alternatives rejected"].map((section) => `docs/law/Rules.md: missing required section ## ${section}`),
  ]);
  const fixed = setStatus({ status: "active", paths: ["docs/law/Rules.md"], by: null, docKind: "law" }, root, TODAY);
  expect(fixed.refusals).toEqual([]);
  expect(read(root, "docs/law/Rules.md")).toContain("---\nkind: law\nstatus: active\nupdated: 2026-09-23\n---\n");
});
