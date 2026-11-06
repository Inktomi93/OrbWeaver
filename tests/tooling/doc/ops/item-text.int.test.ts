// An item carries real What, Why and Done when text: a mint and an edit refuse a blank or a prompt, and an
// item still holding template text cannot go to a lane. The drift line for the same item is in board.int.test.ts.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { editItem, newItem, newItemsFrom, parseDocCommand, runDocCommand, setItems } from "../../../../tooling/src/doc/index.ts";
import { EXIT } from "../../../../tooling/src/floor/cli/exit-contract.ts";
import { UsageError } from "../../../../tooling/src/floor/cli/run-tool.ts";
import { bareItemSource, templatePrompt, WRITTEN_CONTENT, written } from "../_written-item.ts";

const TODAY = "2026-09-23";
const ITEM = "docs/work/0001-a.md";
const OPEN = { kind: "work", priority: null, area: null, plan: null, lane: null } as const;

function read(root: string, path: string): string {
  return readFileSync(join(root, path), "utf8");
}

test("a mint refuses a blank section and a section left at its prompt, names each flag, and writes nothing", async ({ plantedTree }) => {
  const root = await plantedTree({});
  const outcome = newItem(
    { title: "A", ...OPEN, content: { what: templatePrompt("What"), why: "   ", done: `  ${templatePrompt("Done when")}\n` } },
    root,
    TODAY,
  );
  expect(outcome.written).toEqual([]);
  expect(outcome.refusals).toHaveLength(3);
  for (const flag of ["--what", "--why", "--done"]) {
    expect(outcome.refusals.filter((line) => line.includes(flag))).toHaveLength(1);
  }
  expect(existsSync(join(root, "docs/work"))).toBe(false);
});

test("a prompt quoted inside longer prose is written text and mints", async ({ plantedTree }) => {
  const root = await plantedTree({});
  const quoting = `Replace the line "${templatePrompt("What")}" in the template.`;
  const outcome = newItem(written({ title: "A", ...OPEN, content: { what: quoting } }), root, TODAY);
  expect(outcome.refusals).toEqual([]);
  expect(read(root, ITEM)).toContain(quoting);
});

test("item flags: a missing What, Why or Done when is misuse that names it, and a prompt value reaches the mint's refusal", async ({ plantedTree }) => {
  const root = await plantedTree({});
  const base = ["item", "Fix it", "--kind", "bug"];
  expect(() => parseDocCommand([...base, "--what", "The change."])).toThrow(UsageError);
  expect(() => parseDocCommand([...base, "--what", "The change."])).toThrow(/missing --why --done/u);
  expect(() => parseDocCommand(base)).toThrow(/missing --what --why --done/u);
  const command = parseDocCommand([...base, "--what", templatePrompt("What"), "--why", "A reason.", "--done", "A bar."]);
  if (command.kind !== "item") {
    throw new Error(`parsed as ${command.kind}`);
  }
  expect(runDocCommand(command, root)).toBe(EXIT.violations);
  expect(existsSync(join(root, "docs/work"))).toBe(false);
});

test("item --from: a missing key is misuse that names it; a blank or prompt value refuses the whole batch", async ({ plantedTree }) => {
  const clean = { title: "Clean", kind: "work", ...WRITTEN_CONTENT };
  const root = await plantedTree({
    "no-why.json": JSON.stringify([{ title: "T", kind: "work", what: "A.", done: "B." }]),
    "prompt.json": JSON.stringify([clean, { ...clean, title: "Prompt", done: templatePrompt("Done when") }]),
  });
  expect(() => newItemsFrom("no-why.json", root, TODAY)).toThrow(UsageError);
  expect(() => newItemsFrom("no-why.json", root, TODAY)).toThrow(/why/u);
  const outcome = newItemsFrom("prompt.json", root, TODAY);
  expect(outcome.written).toEqual([]);
  expect(outcome.refusals).toHaveLength(1);
  expect(outcome.refusals[0]).toContain("--done");
  expect(outcome.refusals[0]).toContain('"Prompt"');
  expect(existsSync(join(root, "docs/work"))).toBe(false);
});

test("edit refuses to write a prompt back into What, Why or Done when, and changes nothing", async ({ plantedTree }) => {
  const root = await plantedTree({});
  newItem(written({ title: "A", ...OPEN }), root, TODAY);
  const before = read(root, ITEM);
  const outcome = editItem(1, { what: templatePrompt("What"), why: templatePrompt("Why"), done: templatePrompt("Done when") }, root, "2026-10-01");
  expect(outcome.written).toEqual([]);
  expect(outcome.refusals).toHaveLength(3);
  for (const flag of ["--what", "--why", "--done"]) {
    expect(outcome.refusals.filter((line) => line.includes(flag))).toHaveLength(1);
  }
  expect(read(root, ITEM)).toBe(before);
  expect(editItem(1, { what: "A real sentence." }, root, "2026-10-01").refusals).toEqual([]);
});

test("set doing and set --lane refuse an item holding template text, name the id and the edit command; open and blocked still work", async ({
  plantedTree,
}) => {
  const root = await plantedTree({ [ITEM]: bareItemSource("A") });
  const everything = "pnpm doc edit 1 --what <text> --why <text> --done <text>";
  for (const patch of [{ state: "doing", lane: "cb-x" }, { state: "doing" }, { lane: "cb-x" }] as const) {
    const refused = setItems([1], patch, root, TODAY);
    expect(refused.written).toEqual([]);
    expect(refused.refusals).toHaveLength(1);
    expect(refused.refusals[0]).toContain("1:");
    expect(refused.refusals[0]).toContain(everything);
  }
  expect(read(root, ITEM)).toBe(bareItemSource("A"));

  expect(editItem(1, { what: "Written." }, root, TODAY).refusals).toEqual([]);
  expect(setItems([1], { state: "doing", lane: "cb-x" }, root, TODAY).refusals[0]).toContain("pnpm doc edit 1 --why <text> --done <text>");

  expect(setItems([1], { state: "blocked", blocked: "owner" }, root, TODAY).refusals).toEqual([]);
  expect(setItems([1], { state: "open" }, root, TODAY).refusals).toEqual([]);
  expect(setItems([1], { priority: "P1" }, root, TODAY).refusals).toEqual([]);

  expect(editItem(1, { why: "A reason.", done: "A bar." }, root, TODAY).refusals).toEqual([]);
  expect(setItems([1], { state: "doing", lane: "cb-x" }, root, TODAY).refusals).toEqual([]);
  expect(read(root, ITEM)).toContain("status: doing\n");
});

test("set names every template item in a mixed list and writes none of them", async ({ plantedTree }) => {
  const root = await plantedTree({ [ITEM]: bareItemSource("A"), "docs/work/0002-b.md": bareItemSource("B") });
  writeFileSync(
    join(root, "docs/work/0003-c.md"),
    bareItemSource("C").replaceAll(templatePrompt("What"), "Written.").replaceAll(templatePrompt("Why"), "Written."),
  );
  const refused = setItems([1, 2, 3], { state: "doing", lane: "cb-x" }, root, TODAY);
  expect(refused.written).toEqual([]);
  expect(refused.refusals).toHaveLength(3);
  expect(refused.refusals[2]).toContain("pnpm doc edit 3 --done <text>");
});
