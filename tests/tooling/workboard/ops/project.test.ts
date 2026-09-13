// The PIN for `fetchIssueStates` — the workboard's BULK issue-state door (#2156).
//
// WHY IT NEEDED ITS OWN READER, and therefore its own pin. The board-citation census asks about hundreds
// of numbers per run (the refutation ledger alone cites 362), and the targeted `fetchIssueContext` walk
// pulls a body, 100 comments and every project item per call. This door selects five thin fields and
// PAGES, so its failure modes are exactly the ones a single-page fake would never show.
//
// EVERY ARM BELOW IS A FAIL-CLOSED PIN AT THE PRODUCTION DOOR, against a fake `gh` speaking the real wire
// protocol. Four of them landed 2026-09-13 on codex's independent review, which measured that the payload
// was CAST rather than checked:
//
//   • A page announcing `hasNextPage: true` with a null/empty `endCursor` used to TERMINATE the walk and
//     return the prefix as if it were the whole board. The old pin supplied three well-formed pages and
//     asserted they merge, which proves the happy path and nothing about truncation.
//   • A repeated cursor could loop forever.
//   • A wire `state` of `"STALE"` landed in the map, and the citation judge rejects an openness claim only
//     on the exact string `"CLOSED"` — so an unrecognised state SATISFIED the claim.
//   • A malformed issue number, a duplicated number across pages, and a snapshot with no Project-1 member
//     are all reads to distrust rather than verdicts.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";
import { fetchIssueStates } from "../../../../tooling/src/workboard/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const PROJECT_ONE = { nodes: [{ project: { number: 1 } }] };

/** One well-formed node; `extra` overrides exactly the field an arm is malforming. */
function node(number: number, state: string, extra: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> {
  return { number, state, title: `row #${String(number)}`, body: "", projectItems: PROJECT_ONE, ...extra };
}

/** A page as the wire spells it: the `issues` object itself, so an arm can malform `pageInfo` verbatim. */
function page(nodes: readonly unknown[], next: string | null): Readonly<Record<string, unknown>> {
  return { pageInfo: { hasNextPage: next !== null, endCursor: next }, nodes };
}

/** A fake `gh` that answers `WorkItemIssueStates` from a page table indexed by cursor. `nice` is spawned by
 *  the shared proc door, so the system bin stays on PATH behind the fake. */
function installFakeGh(scratch: string, pages: readonly unknown[]): void {
  const bin = join(scratch, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "pages.json"), JSON.stringify(pages));
  writeFileSync(
    join(bin, "gh"),
    [
      "#!/usr/bin/env node",
      'const { readFileSync } = require("node:fs");',
      `const pages = JSON.parse(readFileSync(${JSON.stringify(join(bin, "pages.json"))}, "utf8"));`,
      "const args = process.argv.slice(2);",
      "const cursorArg = args.find((arg) => arg.startsWith('cursor='));",
      "const index = cursorArg === undefined ? 0 : Number(cursorArg.slice('cursor='.length));",
      "process.stdout.write(JSON.stringify({ data: { repository: { issues: pages[index] } } }));",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  vi.stubEnv("PATH", `${bin}:/usr/bin:/bin`);
}

test("every PAGE is merged, and each row carries the state, subject text and board membership", ({ scratch }) => {
  installFakeGh(scratch, [
    page([node(1, "CLOSED", { title: "the first row", body: "**Where:** cb-v-x L1" })], "1"),
    page([node(2, "OPEN")], "2"),
    page([node(3, "CLOSED", { body: null, projectItems: { nodes: [] } })], null),
  ]);

  const states = fetchIssueStates();

  expect([...states.keys()]).toEqual([1, 2, 3]);
  expect(states.get(1)).toEqual({ number: 1, state: "CLOSED", title: "the first row", body: "**Where:** cb-v-x L1", onBoard: true });
  // A null body is ABSENT, not a missing measurement; an issue on no project is not a board row.
  expect(states.get(3)).toEqual({ number: 3, state: "CLOSED", title: "row #3", body: "", onBoard: false });
});

test("an EMPTY repository response REFUSES — a map with nothing in it answers `unknown` to every citation", ({ scratch }) => {
  installFakeGh(scratch, [page([], null)]);

  expect(() => fetchIssueStates()).toThrow(/reported ZERO issues[\s\S]*not a verdict/);
});

test("a page that says hasNextPage and carries NO cursor REFUSES — a truncated snapshot is not a board", ({ scratch }) => {
  // The exact shape codex reproduced: one valid node, `hasNextPage: true`, `endCursor: null`. It used to
  // return [[1,"CLOSED"]] and read as a complete board.
  installFakeGh(scratch, [{ pageInfo: { hasNextPage: true, endCursor: null }, nodes: [node(1, "CLOSED")] }]);

  expect(() => fetchIssueStates()).toThrow(/TRUNCATED/);
});

test("an EMPTY-STRING cursor is the same truncation, not a usable cursor", ({ scratch }) => {
  installFakeGh(scratch, [{ pageInfo: { hasNextPage: true, endCursor: "" }, nodes: [node(1, "CLOSED")] }]);

  expect(() => fetchIssueStates()).toThrow(/TRUNCATED/);
});

test("a non-boolean hasNextPage REFUSES — the walk cannot know whether it is complete", ({ scratch }) => {
  installFakeGh(scratch, [{ pageInfo: { hasNextPage: "yes", endCursor: "1" }, nodes: [node(1, "CLOSED")] }]);

  expect(() => fetchIssueStates()).toThrow(/hasNextPage is not a boolean/);
});

test("a REPEATED cursor REFUSES rather than looping forever", ({ scratch }) => {
  installFakeGh(scratch, [page([node(1, "CLOSED")], "1"), page([node(2, "OPEN")], "1")]);

  expect(() => fetchIssueStates()).toThrow(/cursor it already followed/);
});

test("an unrecognised wire STATE REFUSES — it would satisfy an openness claim by accident", ({ scratch }) => {
  installFakeGh(scratch, [page([node(2326, "STALE")], null)]);

  expect(() => fetchIssueStates()).toThrow(/reported state "STALE", which is neither OPEN nor CLOSED/);
});

test("a malformed issue NUMBER REFUSES", ({ scratch }) => {
  installFakeGh(scratch, [page([node(0, "OPEN")], null)]);
  expect(() => fetchIssueStates()).toThrow(/no positive integer issue number/);

  installFakeGh(scratch, [page([{ number: "12", state: "OPEN", title: "t", body: "", projectItems: PROJECT_ONE }], null)]);
  expect(() => fetchIssueStates()).toThrow(/no positive integer issue number/);
});

test("a missing title REFUSES — the subject join would have nothing to read", ({ scratch }) => {
  installFakeGh(scratch, [page([{ number: 7, state: "OPEN", body: "", projectItems: PROJECT_ONE }], null)]);

  expect(() => fetchIssueStates()).toThrow(/#7 has no string title/);
});

test("the SAME number on two pages REFUSES — the pages do not describe one snapshot", ({ scratch }) => {
  installFakeGh(scratch, [page([node(5, "OPEN")], "1"), page([node(5, "CLOSED")], null)]);

  expect(() => fetchIssueStates()).toThrow(/returned #5 TWICE/);
});

test("a snapshot with NO Project-1 member at all REFUSES — membership is unmeasured, not absent", ({ scratch }) => {
  installFakeGh(scratch, [page([node(1, "OPEN", { projectItems: { nodes: [] } }), node(2, "CLOSED", { projectItems: { nodes: [] } })], null)]);

  expect(() => fetchIssueStates()).toThrow(/NOT ONE is an item of Project 1/);
});
