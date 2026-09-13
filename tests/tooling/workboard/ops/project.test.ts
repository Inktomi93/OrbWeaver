// The PIN for `fetchIssueStates` — the workboard's BULK issue-state door (#2156).
//
// WHY IT NEEDED ITS OWN READER, and therefore its own pin. The board-citation census asks about hundreds
// of numbers per run (the refutation ledger alone cites 326), and the targeted `fetchIssueContext` walk
// pulls a body, 100 comments and every project item per call. This door selects two scalar fields and
// PAGES, so its two failure modes are exactly the ones a single-page fake would never show: a second page
// silently dropped (the census then reports every id on it as DANGLING — a flood of false findings), and
// an empty first page returned as an empty map (which answers "unknown" to every citation and reads as a
// clean board). Both are asserted below against a fake `gh` speaking the real wire protocol.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";
import { fetchIssueStates } from "../../../../tooling/src/workboard/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** A fake `gh` that answers `WorkItemIssueStates` from a JSON page table keyed by cursor. `nice` is spawned
 *  by the shared proc door, so the system bin stays on PATH behind the fake. */
function installFakeGh(
  scratch: string,
  pages: readonly { readonly nodes: readonly { readonly number: number; readonly state: string }[]; readonly next: string | null }[],
): void {
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
      "const page = pages[index];",
      "process.stdout.write(JSON.stringify({ data: { repository: { issues: {",
      "  pageInfo: { hasNextPage: page.next !== null, endCursor: page.next },",
      "  nodes: page.nodes,",
      "} } } }));",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  vi.stubEnv("PATH", `${bin}:/usr/bin:/bin`);
}

test("every PAGE is merged — a dropped second page would report its ids as dangling citations", ({ scratch }) => {
  installFakeGh(scratch, [
    { nodes: [{ number: 1, state: "CLOSED" }], next: "1" },
    { nodes: [{ number: 2, state: "OPEN" }], next: "2" },
    { nodes: [{ number: 3, state: "CLOSED" }], next: null },
  ]);

  const states = fetchIssueStates();

  expect([...states.entries()]).toEqual([
    [1, "CLOSED"],
    [2, "OPEN"],
    [3, "CLOSED"],
  ]);
});

test("an EMPTY repository response REFUSES — a map with nothing in it answers `unknown` to every citation", ({ scratch }) => {
  installFakeGh(scratch, [{ nodes: [], next: null }]);

  expect(() => fetchIssueStates()).toThrow(/reported ZERO issues[\s\S]*not a verdict/);
});
