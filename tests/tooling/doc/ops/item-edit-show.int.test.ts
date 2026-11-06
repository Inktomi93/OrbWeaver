// `edit` and `show` on planted trees: edit replaces named section bodies through the judged write path and
// leaves everything else byte-identical, and every write that touches a doc leaves it formatted.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { editItem, newItem, sectionsOf, setItems, showItems, splitDocument } from "../../../../tooling/src/doc/index.ts";
import { written } from "../_written-item.ts";

const TODAY = "2026-09-23";
const LATER = "2026-10-01";
const ITEM = "docs/work/0001-a.md";
const PADDED_TABLE = ["| name   | value |", "| ------ | ----- |", "| first  | 1     |"].join("\n");
const COMPACT_TABLE = ["| name | value |", "| - | - |", "| first | 1 |"].join("\n");
const MINT = { kind: "work", priority: null, area: null, plan: null, lane: null } as const;

function read(root: string, path: string): string {
  return readFileSync(join(root, path), "utf8");
}

async function rootWithItem(plantedTree: (files: Readonly<Record<string, string>>) => Promise<string>): Promise<string> {
  const root = await plantedTree({});
  newItem(written({ ...MINT, title: "A", content: { what: "Old what.", why: "Old why.", done: "Old done." } }), root, TODAY);
  return root;
}

test("edit replaces the named section bodies and bumps updated; the other sections and fields keep their text", async ({ plantedTree }) => {
  const root = await rootWithItem(plantedTree);
  const before = read(root, ITEM);
  const outcome = editItem(1, { why: "New why, one clean sentence.", done: "New bar." }, root, LATER);
  expect(outcome.refusals).toEqual([]);
  expect(outcome.written).toContain(ITEM);
  expect(read(root, ITEM)).toBe(
    before.replace("Old why.", "New why, one clean sentence.").replace("Old done.", "New bar.").replace(`updated: ${TODAY}`, `updated: ${LATER}`),
  );
});

test("edit replaces the Evidence section through the same judged write", async ({ plantedTree }) => {
  const root = await rootWithItem(plantedTree);
  const before = read(root, ITEM);
  const outcome = editItem(1, { evidence: "Ran the suite; output is in the lane report." }, root, LATER);
  expect(outcome.refusals).toEqual([]);
  expect(read(root, ITEM)).toBe(
    before
      .replace("Filled at landing: what ran and where its output is.", "Ran the suite; output is in the lane report.")
      .replace(`updated: ${TODAY}`, `updated: ${LATER}`),
  );
  const belt = editItem(1, { evidence: "A load-bearing belt." }, root, LATER);
  expect(belt.written).toEqual([]);
  expect(belt.refusals.join("\n")).toContain("load-bearing");
});

test("edit judges the write like set: a writing-rule finding refuses and changes nothing", async ({ plantedTree }) => {
  const root = await rootWithItem(plantedTree);
  const before = read(root, ITEM);
  const outcome = editItem(1, { why: "A load-bearing belt." }, root, LATER);
  expect(outcome.written).toEqual([]);
  expect(outcome.refusals.join("\n")).toContain("load-bearing");
  expect(read(root, ITEM)).toBe(before);
});

test("edit refuses an unknown id and an item missing the section, writing nothing", async ({ plantedTree }) => {
  const root = await plantedTree({
    "docs/work/0001-a.md":
      "---\nkind: work\nstatus: open\nupdated: 2026-09-23\n---\n\n# A\n\n## What\n\nWhat.\n\n## Done when\n\nDone.\n\n## Evidence\n\nNone.\n",
  });
  const before = read(root, ITEM);
  expect(editItem(7, { what: "x" }, root, LATER)).toEqual({ written: [], refusals: ["7: no such item under docs/work/ — pnpm doc overview lists them"] });
  const missing = editItem(1, { what: "Fine.", why: "No such section here." }, root, LATER);
  expect(missing.written).toEqual([]);
  expect(missing.refusals).toHaveLength(1);
  expect(missing.refusals[0]).toContain("## Why");
  expect(read(root, ITEM)).toBe(before);
});

test("show returns the files in the order given, drops a repeated id, and refuses an unknown id by name while the rest still come back", async ({
  plantedTree,
}) => {
  const root = await rootWithItem(plantedTree);
  newItem(written({ ...MINT, title: "B" }), root, TODAY);
  const shown = showItems([2, 9, 1, 2], root);
  expect(shown.shown.map((doc) => doc.path)).toEqual(["docs/work/0002-b.md", ITEM]);
  expect(shown.shown.map((doc) => doc.source)).toEqual([read(root, "docs/work/0002-b.md"), read(root, ITEM)]);
  expect(shown.refusals).toEqual(["9: no such item under docs/work/ — pnpm doc overview lists them"]);
});

test("an unformatted section reaches disk formatted through edit", async ({ plantedTree }) => {
  const root = await rootWithItem(plantedTree);
  expect(editItem(1, { what: `Lookup:\n\n${PADDED_TABLE}` }, root, LATER).refusals).toEqual([]);
  expect(read(root, ITEM)).toContain(COMPACT_TABLE);
  expect(read(root, ITEM)).not.toContain(PADDED_TABLE);
});

test("a retitling set rewrites the references in other docs and leaves each changed doc formatted", async ({ plantedTree }) => {
  const root = await plantedTree({
    "docs/law/x.md": `---\nkind: law\nstatus: active\nupdated: 2026-09-23\n---\n\n# X\n\nSee [A](../work/0001-a.md).\n\n${PADDED_TABLE}\n`,
  });
  newItem(written({ ...MINT, title: "A" }), root, TODAY);
  const outcome = setItems([1], { title: "Renamed" }, root, LATER);
  expect(outcome.refusals).toEqual([]);
  expect(outcome.written).toContain("docs/law/x.md");
  const law = read(root, "docs/law/x.md");
  expect(law).toContain("(../work/0001-renamed.md)");
  expect(law).toContain(COMPACT_TABLE);
  expect(law).not.toContain(PADDED_TABLE);
  writeFileSync(join(root, "docs/law/untouched.md"), `---\nkind: law\nstatus: active\nupdated: 2026-09-23\n---\n\n# U\n\n${PADDED_TABLE}\n`);
  expect(setItems([1], { priority: "P1" }, root, LATER).written).not.toContain("docs/law/untouched.md");
  expect(read(root, "docs/law/untouched.md")).toContain(PADDED_TABLE);
});

test("edit refuses text carrying a # or ## heading line and changes nothing", async ({ plantedTree }) => {
  const root = await rootWithItem(plantedTree);
  const before = read(root, ITEM);
  for (const text of ["New.\n\n## Why\n\nInjected.", "# A second title\n\nBody."]) {
    const outcome = editItem(1, { what: text }, root, LATER);
    expect(outcome.written).toEqual([]);
    expect(outcome.refusals).toHaveLength(1);
    expect(read(root, ITEM)).toBe(before);
  }
});

test("edit keeps a section list intact: an unclosed fence is refused, even on an item that is already red", async ({ plantedTree }) => {
  const root = await rootWithItem(plantedTree);
  const red = read(root, ITEM).replace("Old done.", "A load-bearing belt.");
  writeFileSync(join(root, ITEM), red);
  const outcome = editItem(1, { what: "Starts a fence.\n\n```ts\nconst x = 1;" }, root, LATER);
  expect(outcome.written).toEqual([]);
  expect(outcome.refusals.join("\n")).toContain("Why");
  expect(read(root, ITEM)).toBe(red);
});

test("a four-backtick block holding a fence and a ## line is text, in the new body and in a sibling", async ({ plantedTree }) => {
  const fenced = ["````md", "```", "## Fake", "```", "````"].join("\n");
  const root = await rootWithItem(plantedTree);
  const edited = editItem(1, { what: `Example:\n\n${fenced}` }, root, LATER);
  expect(edited.refusals).toEqual([]);
  expect(read(root, ITEM)).toContain(fenced);
  expect(sectionsOf(splitDocument(read(root, ITEM)).body)).toEqual(["What", "Why", "Done when", "Evidence"]);
  const sibling = editItem(1, { done: "New bar." }, root, LATER);
  expect(sibling.refusals).toEqual([]);
  expect(read(root, ITEM)).toContain(fenced);
  expect(sectionsOf(splitDocument(read(root, ITEM)).body)).toEqual(["What", "Why", "Done when", "Evidence"]);
});

test("edit refuses an item whose unclosed fence hides its other sections, rather than deleting them", async ({ plantedTree }) => {
  const root = await rootWithItem(plantedTree);
  writeFileSync(join(root, ITEM), read(root, ITEM).replace("Old what.", "```foo``` is inline."));
  const before = read(root, ITEM);
  const outcome = editItem(1, { what: "New." }, root, LATER);
  expect(outcome.written).toEqual([]);
  expect(outcome.refusals.join("\n")).toContain("## Why");
  expect(read(root, ITEM)).toBe(before);
});

test.for(["New.\n\n  # Other title\n\nI.", "New.\n\nOther title\n===\n\nI.", "New.\n\n#\tOther title\n\nI."])(
  "edit refuses a title heading in any spelling: %j",
  async (what, { plantedTree }) => {
    const root = await rootWithItem(plantedTree);
    const before = read(root, ITEM);
    expect(editItem(1, { what }, root, LATER).written).toEqual([]);
    expect(read(root, ITEM)).toBe(before);
  },
);
