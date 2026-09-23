// The active-gates index is a GENERATED law doc (work item 0045). Drift from the loaded gate roster is
// held by `ledgers:fresh`'s `activeGatesIndexDrift` (the committed bytes vs a fresh derivation, every
// `pnpm check:ledgers-fresh`), which is why nothing below spells a row COUNT as a literal — the census
// is a RELATIONSHIP to the roster passed in, never a number that goes stale the day a gate lands or dies.
// This file pins the pure renderer's shape instead: one well-formed row per gate, every gate id
// searchable as a backticked token, and no PURPOSE truncation ever leaving a dangling markdown escape.
import type { GatePolicy } from "@orb/tooling/verify";
import { defineGate, deriveActiveGatesIndexMarkdown } from "@orb/tooling/verify";
import { expect, test } from "../../../../support/tool-fixtures.ts";

function gate(overrides: Partial<Parameters<typeof defineGate>[0]> = {}): GatePolicy {
  return defineGate({
    id: "probe-gate",
    family: "probe-gate",
    authority: "hard",
    severity: "error",
    population: "@server",
    analysis: "syntax",
    execution: "entire-population",
    facts: [],
    resources: [],
    message: "a probe finding",
    create: () => ({}),
    mustFlag: [],
    mustPass: [],
    ...overrides,
    // @orb-waive no-test-fabrication(Parameters<typeof defineGate>[0]): satisfies rejects the full literal spread over Partial<...> overrides; ends if ExactPolicy can assert that without a cast.
  } as Parameters<typeof defineGate>[0]) as GatePolicy;
}

function rowsOf(markdown: string): readonly string[] {
  return markdown.split("\n").filter((line) => line.startsWith("| `"));
}

test("one well-formed row per gate, sorted by id, every id a searchable backticked token", () => {
  const gates = [gate({ id: "zebra-gate", family: "zebra-gate" }), gate({ id: "aardvark-gate", family: "aardvark-gate" })];
  const markdown = deriveActiveGatesIndexMarkdown(gates);
  const rows = rowsOf(markdown);

  expect(rows).toHaveLength(gates.length);
  expect(rows[0]).toContain("`aardvark-gate`");
  expect(rows[1]).toContain("`zebra-gate`");

  // Exactly five cells (the leading/trailing pipes split off an empty string at each end).
  for (const row of rows) {
    const cells = row.split(/(?<!\\)\|/u);
    expect(cells).toHaveLength(7);
  }

  // The count line is derived from the SAME array, never a separate hand count.
  expect(markdown).toContain(`(${gates.length} registered gates)`);
});

test("a truncated purpose never leaves a dangling code span, and markdown-significant characters escape", () => {
  const longMessage = "a message with a `code span` that runs long enough to be cut mid-token, past the truncation limit entirely";
  const markdown = deriveActiveGatesIndexMarkdown([gate({ message: longMessage })]);
  const row = rowsOf(markdown)[0] as string;

  // Backticks are dropped from the truncated cell, never left half-open.
  expect((row.match(/`/gu) ?? []).length).toBe(2); // only the id's own backtick pair

  const starred = deriveActiveGatesIndexMarkdown([gate({ message: "a `*` and a <Tag> and a bare | pipe" })]);
  const starredRow = rowsOf(starred)[0] as string;
  expect(starredRow).toContain("\\*");
  expect(starredRow).toContain("\\<Tag>");
  expect(starredRow).toContain("\\|");
});

test("family collapses to a dash when it equals the gate's own id, and shows the shared name otherwise", () => {
  const markdown = deriveActiveGatesIndexMarkdown([
    gate({ id: "singleton-gate", family: "singleton-gate" }),
    gate({ id: "shared-gate", family: "shared-family" }),
  ]);
  const rows = rowsOf(markdown);
  // Sorted by id: "shared-gate" < "singleton-gate".
  expect(rows[0]).toContain("| shared-family |");
  expect(rows[1]).toContain("| — |");
});
