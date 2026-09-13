// The PIN for warning-debt `workItem` liveness (#2070). What each arm defends:
//
//   • THE DERIVATION IS THE LOADER, never a roster. The founding defect grew while a hand-maintained list
//     would have looked complete: #2070's body knows only about `over-art-plate-arm`, and a SECOND carrier
//     (`policy-refusal-coverage`, `workItem: 2184`) went closed unnoticed. So the population arm drives the
//     REAL `loadMixedGateCorpus` over a planted fixture corpus — a warning policy naming a closed row is
//     reported because the loader saw it, not because anyone listed it.
//   • THE THREE OUTCOMES, each separately: every citation OPEN is 0, a CLOSED citation is 1 naming its
//     policy and its number, and a reader that cannot answer THROWS out of the judge (the exit-2 class at
//     the caller) instead of contributing a silent OPEN.
//   • THE POSITIVE CONTROL IS ASKED IN THE SAME INVOCATION AS THE GREEN. The call-log arm is the one that
//     matters most: a green run that never asked about the control would be a green run that proved nothing
//     about the reader, which is exactly the "bare zero" shape #2070 was filed against.
//   • THE CONTROL'S OWN FAILURE ARM. A control that comes back OPEN means either the row was reopened or the
//     reader is stuck; both refuse, and the message says which constant to move.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { vi } from "vitest";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { loadMixedGateCorpus } from "../../../../tooling/src/verify/lib/loader.ts";
import { boardIssueState } from "../../../../tooling/src/verify/lib/workitem-board-reader.ts";
import type { BoardIssueState } from "../../../../tooling/src/verify/lib/workitem-liveness.ts";
import {
  CLOSED_CONTROL_ISSUE,
  judgeWorkItemLiveness,
  warningWorkItems,
  workItemLivenessExit,
  workItemLivenessReport,
} from "../../../../tooling/src/verify/lib/workitem-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** The planted fixture's `workItem`, well outside any real row so a stale reader cannot answer it by luck.
 *  A CONST rather than a literal key: a separator-bearing numeric key reads as a non-camelCase identifier to
 *  biome, and dropping the separator trips `useNumericSeparators` — a computed key satisfies both. */
const PLANTED_WORK_ITEM = 424_242;
/** A citation whose row resolves to nothing — the reader's "not found" arm. */
const ABSENT_WORK_ITEM = 999_999;

/** A reader over a fixed table that RECORDS what it was asked — the call log is what proves the control ran
 *  in the same invocation as the verdict. An unlisted number throws, the way the real door does. */
function tableReader(table: Readonly<Record<number, BoardIssueState>>): { readState: (issue: number) => BoardIssueState; asked: number[] } {
  const asked: number[] = [];
  return {
    asked,
    readState: (issue: number): BoardIssueState => {
      asked.push(issue);
      const state = table[issue];
      if (state === undefined) {
        throw new Error(`#${String(issue)} was not found in Inktomi93/orbweaver`);
      }
      return state;
    },
  };
}

/** A descriptor with only the fields the judge reads; the LOADER arm below uses real modules instead. */
function policy(id: string, workItem?: number): GatePolicy {
  const severity = workItem === undefined ? { severity: "error" as const } : { severity: "warning" as const, workItem };
  return { id, ...severity } as GatePolicy;
}

interface PlantedModule {
  readonly root: string;
  readonly repoRoot: string;
  readonly name: string;
  readonly id: string;
  /** The authority/severity/workItem lines under test — the only part that varies between fixtures. */
  readonly tier: string;
}

function writeModule({ root, repoRoot, name, id, tier }: PlantedModule): void {
  const contract = pathToFileURL(join(repoRoot, "tooling/src/verify/contract/policy.ts")).href;
  const path = join(root, "tooling/src/verify/gates", name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `import { defineGate } from ${JSON.stringify(contract)};\nexport const gate = defineGate({\n` +
      `  id: ${JSON.stringify(id)},\n  family: ${JSON.stringify(id)},\n  ${tier}\n` +
      `  population: "@tooling",\n  analysis: "syntax",\n  execution: "selected-files",\n  facts: [],\n  resources: [],\n` +
      `  message: "fixture policy",\n  create: () => ({ evaluate: () => undefined }),\n` +
      `  mustFlag: [{ mode: "source", files: { "tooling/src/proof.ts": "export const planted = true;\\n" }, why: "founding defect" }],\n` +
      `  mustPass: [{ mode: "source", files: { "tooling/src/proof.ts": "export const clean = true;\\n" }, why: "nearest legal shape" }],\n` +
      "} as never);\n",
  );
}

test("the warning population is DERIVED from a real corpus load — a planted warning policy naming a closed row is reported", async ({ repoRoot, scratch }) => {
  writeModule({
    root: scratch,
    repoRoot,
    name: "planted-warning.ts",
    id: "planted-warning",
    tier: `authority: "ordinary",\n  severity: "warning",\n  workItem: ${String(PLANTED_WORK_ITEM)},`,
  });
  writeModule({ root: scratch, repoRoot, name: "planted-error.ts", id: "planted-error", tier: 'authority: "hard",\n  severity: "error",' });
  const corpus = await loadMixedGateCorpus(scratch);
  expect(corpus.final).toHaveLength(2);

  const { readState } = tableReader({ [CLOSED_CONTROL_ISSUE]: "CLOSED", [PLANTED_WORK_ITEM]: "CLOSED" });
  const outcome = judgeWorkItemLiveness({ policies: corpus.final, readState });

  // The error policy contributes no citation — `workItem` exists only on the warning arm of the union.
  expect(outcome.citations).toEqual([{ policy: "planted-warning", workItem: PLANTED_WORK_ITEM }]);
  expect(outcome.corpus).toBe(2);
  expect(workItemLivenessExit(outcome)).toBe(1);
  expect(workItemLivenessReport(outcome).join("\n")).toContain("planted-warning carries `workItem: 424242` and #424242 is CLOSED");
});

test("every citation OPEN is exit 0, and the control was asked in the SAME invocation", () => {
  const { readState, asked } = tableReader({ [CLOSED_CONTROL_ISSUE]: "CLOSED", 2187: "OPEN", 2188: "OPEN" });
  const outcome = judgeWorkItemLiveness({ policies: [policy("a", 2187), policy("b", 2188), policy("c")], readState });

  expect(outcome.closed).toEqual([]);
  expect(workItemLivenessExit(outcome)).toBe(0);
  // THE ANTI-BARE-ZERO ARM: the green above is only worth something because this run also proved the reader
  // can SAY closed. Drop the control from the judge and this expectation fails while every other arm passes.
  expect(asked).toContain(CLOSED_CONTROL_ISSUE);
  expect(outcome.control).toEqual({ issue: CLOSED_CONTROL_ISSUE, state: "CLOSED" });
  expect(workItemLivenessReport(outcome)[0]).toContain(`control #${String(CLOSED_CONTROL_ISSUE)} reported CLOSED in this run`);
});

test("a CLOSED citation is exit 1 and the report names the policy, the number and both settlements", () => {
  const { readState } = tableReader({ [CLOSED_CONTROL_ISSUE]: "CLOSED", 2024: "CLOSED", 2187: "OPEN" });
  const outcome = judgeWorkItemLiveness({ policies: [policy("over-art-plate-arm", 2024), policy("policy-family-readers", 2187)], readState });

  expect(outcome.closed).toEqual([{ policy: "over-art-plate-arm", workItem: 2024 }]);
  expect(workItemLivenessExit(outcome)).toBe(1);
  const report = workItemLivenessReport(outcome).join("\n");
  expect(report).toContain("over-art-plate-arm: workItem #2024 — CLOSED");
  expect(report).toContain("policy-family-readers: workItem #2187 — OPEN");
  expect(report).toContain("Repoint it at the row that owns the remaining work");
  expect(report).toContain("`hard`/`error`");
});

test("a reader that cannot answer THROWS out of the judge — an unreachable board is never a clean bar", () => {
  const offline = (): BoardIssueState => {
    throw new Error("gh: could not resolve host: api.github.com");
  };
  expect(() => judgeWorkItemLiveness({ policies: [policy("a", 2187)], readState: offline })).toThrow(/could not resolve host/);

  // A citation whose row does not resolve is the same class: the board answered nothing about it.
  const { readState } = tableReader({ [CLOSED_CONTROL_ISSUE]: "CLOSED" });
  expect(() => judgeWorkItemLiveness({ policies: [policy("a", ABSENT_WORK_ITEM)], readState })).toThrow(/#999999 was not found/);
});

test("the control's own failure arms refuse: a reopened control, and an empty corpus", () => {
  const { readState } = tableReader({ 7: "OPEN", 2187: "OPEN" });
  expect(() => judgeWorkItemLiveness({ policies: [policy("a", 2187)], readState, controlIssue: 7 })).toThrow(
    /positive control #7 came back OPEN, not CLOSED[\s\S]*CLOSED_CONTROL_ISSUE/,
  );

  const live = tableReader({ [CLOSED_CONTROL_ISSUE]: "CLOSED" });
  expect(() => judgeWorkItemLiveness({ policies: [], readState: live.readState })).toThrow(/corpus came back EMPTY/);
  // The empty-corpus refusal precedes the board entirely: nothing was asked, so nothing was claimed.
  expect(live.asked).toEqual([]);
});

test("warningWorkItems keeps corpus order and reads the number off the warning arm only", () => {
  expect(warningWorkItems([policy("z", 3), policy("m"), policy("a", 1)])).toEqual([
    { policy: "z", workItem: 3 },
    { policy: "a", workItem: 1 },
  ]);
});

test("the PRODUCTION door refuses rather than guessing — with no `gh` reachable it throws, it does not return OPEN", () => {
  // The one property of `lib/workitem-board-reader.ts` that a unit can prove offline, and it is the property
  // the whole design rests on: a reader that answered a default on failure would make every run green. Driven
  // by emptying the child's PATH rather than by a mock, so the assertion is about the real door.
  vi.stubEnv("PATH", "");
  expect(() => boardIssueState(CLOSED_CONTROL_ISSUE)).toThrow(/ENOENT/);
});
