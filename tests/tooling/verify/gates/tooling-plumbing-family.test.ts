// The standing family floor for the ten-policy split of `tooling-shared-plumbing` (#1950 group 4, docs/history/gate-runtime-worked-cases-2026-09.md §"Mixed-hook arity amendments"):
//
//   `tooling-project-home` · `tooling-browser-door` · `tooling-child-process-door` (singletons, reviewed-grant)
//   `tooling-artifact-path-home` (reviewed-grant) + `tooling-artifact-run-slot` (hard) — family `tooling-artifact`
//   `tooling-process-exit-home` (reviewed-grant) — family `process-member`, with the argv pair
//   `tooling-cli-entry` (hard) — family `tooling-program-entry`, with `tooling-ops-direct-invocation`
//   `tooling-port-registry` (reviewed-grant) + `tooling-clock-budget` (ORDINARY) + `tooling-runner-config-literals`
//   (hard, resource) — family `plumbing-literals`
//
// What a declared row structurally cannot express lives here:
//   §4.2 — the one ordinary policy's identity arm, all three assertions, alarms first.
//   §4.3 — grant identity for every reviewed-grant policy with the REAL rows from `lib/reviewed-grants.ts`: the
//          intended row is consumed exactly once; a row keyed on the wrong operation licenses nothing; a row
//          whose subject no longer performs the act (or is gone) is STALE after a complete run — the legacy
//          five-table stale sweep (HOMES · PROJECT_SITES · FULL_PRIORITY_CALLERS · PORT_HOME · CLOCK_SITES)
//          collapsed to central grant liveness plus one ordinary waiver.
//   §4.5 — the located homes REFUSE at the receipt phase when absent or renamed (conformance has no
//          must-refuse arm); the `exact-file` door refuses at the population phase when a root config is
//          missing (the legacy blindness tripwire, now the runtime's); every `entire-population` policy DEFERS a
//          narrowed request. Plus the AMBIENT branch of `tooling-process-exit-home`, pinned against a plant
//          derived from the shared `_proof/node-types.ts` surface (the same augmentation shape plus `exit`).
//   §4.6 — the conversion differential against the frozen legacy descriptor (`2c1a1d37c`): every one of its 36
//          examples replayed through the legacy `runPass` FIRST and then through the UNION of the nine tree
//          policies, differences CLASSIFIED rather than averaged (below), and the legacy-side coverage of every
//          arm asserted so the replay is evidence. The resource policy's differential is the real-tree replay:
//          the legacy read only the vitest + CT configs and reported zero; the final policy over the pre-fix
//          tree reported three literal clocks in `playwright.config.ts` (measured 2026-09-12, recorded in the
//          module header and the conversion commit).
//   The REAL-TREE run: the ten policies over this checkout with the central grant table — zero tool errors,
//   zero effective findings, every one of the nineteen plumbing grants consumed exactly once, the one
//   translated clock waiver bound, and no authority alarm naming a plumbing policy. Before the conversion
//   commit's eleven fixes the same run reported 13 effective findings (measured, see the commit).
//
// CLASSIFIED DIFFERENCES (§4.6), applied to the legacy outcome so each comparison is one `toEqual`:
//   (1) IDENTITY — the two legacy F2 examples declare a LOCAL `spawnFullPriority*` and call it; the final door
//       arm resolves by declaration and a local function is not proc.ts's door, so they report nothing (the
//       un-niced spawn such a function needs is the import arm's finding, pinned in the module).
//   (2) GRANULARITY — the stage-band example carries TWO port literals in one file; the final policy reports
//       ONE `(subject, operation)` finding (a grant licenses one identity).
//   (3) GRANTS — five legacy mustPass rows sat on censused subjects (ports.ts, ts-workspace.ts, comment-spans.ts,
//       browser.ts, the CLOCK_SITES structure.int.test.ts row); the final policies REPORT them (the
//       differential carries no grants and no waiver), and the real rows are proven in §4.3 / §4.2.
//   (4) HOMES — the three located homes (proc.ts, run-tool.ts, artifact-out.ts) are planted beside every
//       legacy example so the union never refuses at the receipt phase; the legacy verdict is asserted
//       IDENTICAL with and without them, so the plant changes nothing on the legacy side.
//   (5) STALE / BLIND — the legacy anchor-only example produced the five tables' stale rows and two
//       "cannot read" root-config tripwires; those are grant liveness and the exact-file refusal now, not
//       findings.
//   (6) POSITION — the legacy anchored E/G at line 0 (E at the cli.ts, G at a cli.ts that need not exist) and
//       composed port/clock tokens (`FIXTURE_PORT = 8123`); the final sink anchors E at the cli's line 1, G at
//       the first filing call IN ITS OWN FILE (the legacy message names that file first), and the literal
//       policies at the literal. Files are compared, not lines.
//   (7) MESSAGE — the legacy `process.exit(2)` example (no import, no `@types/node`) is UNREADABLE to the
//       shared resolver and reported fail-closed under the disjoint text; count identical, message differs.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import { getWorkspace } from "../../../../tooling/src/_shared/ts-workspace.ts";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { NODE_TYPES_HOME, nodeTypesProof } from "../../../../tooling/src/verify/gates/_proof/node-types.ts";
import { gate as artifactPathHome } from "../../../../tooling/src/verify/gates/tooling-artifact-path-home.ts";
import { gate as artifactRunSlot } from "../../../../tooling/src/verify/gates/tooling-artifact-run-slot.ts";
import { gate as browserDoor } from "../../../../tooling/src/verify/gates/tooling-browser-door.ts";
import { gate as childProcessDoor } from "../../../../tooling/src/verify/gates/tooling-child-process-door.ts";
import { gate as cliEntry } from "../../../../tooling/src/verify/gates/tooling-cli-entry.ts";
import { gate as clockBudget } from "../../../../tooling/src/verify/gates/tooling-clock-budget.ts";
import { gate as portRegistry } from "../../../../tooling/src/verify/gates/tooling-port-registry.ts";
import { gate as processExitHome } from "../../../../tooling/src/verify/gates/tooling-process-exit-home.ts";
import { gate as projectHome } from "../../../../tooling/src/verify/gates/tooling-project-home.ts";
import { gate as runnerConfigLiterals } from "../../../../tooling/src/verify/gates/tooling-runner-config-literals.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS, reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = "/tooling-plumbing-family";
/** The nine policies over SOURCE populations — the differential's union. */
const TREE: readonly GatePolicy[] = [
  projectHome,
  browserDoor,
  artifactPathHome,
  artifactRunSlot,
  processExitHome,
  cliEntry,
  childProcessDoor,
  portRegistry,
  clockBudget,
];
const ALL: readonly GatePolicy[] = [...TREE, runnerConfigLiterals];
const GRANT_POLICIES: readonly GatePolicy[] = [projectHome, browserDoor, artifactPathHome, processExitHome, childProcessDoor, portRegistry];
const PLUMBING_GRANT_COUNT = 19;
const LEGACY = { sha: "2c1a1d37c", path: "tooling/src/verify/gates/tooling-shared-plumbing.ts" } as const;
const LEGACY_EXAMPLES = 36;
const DIFFERENTIAL_BUDGET_MS = scaledBudget(180_000);
const REAL_TREE_BUDGET_MS = scaledBudget(300_000);

const PROC_HOME = "tooling/src/_shared/proc.ts";
const RUNNER_HOME = "tooling/src/_shared/run-tool.ts";
const ARTIFACT_OUT_HOME = "tooling/src/_shared/artifact-out.ts";
const PROC_STUB =
  "export function spawnFullPrioritySync(cmd: string, args: readonly string[]): void {\n  void cmd;\n  void args;\n}\nexport function spawnFullPriorityChild(cmd: string, args: readonly string[]): void {\n  void cmd;\n  void args;\n}\n";
const RUNNER_STUB = "export async function runTool(main: () => number): Promise<void> {\n  void main;\n}\n";
const ARTIFACT_OUT_STUB =
  "export async function artifactDir(kind: string): Promise<string> {\n  return kind;\n}\nexport async function artifactFile(kind: string, out: string, ext: string): Promise<string> {\n  return kind + out + ext;\n}\nexport async function withInstrumentRun(instrument: string, main: () => Promise<number>): Promise<number> {\n  void instrument;\n  return await main();\n}\n";
/** The three located homes, planted beside every legacy example (difference 4). */
const HOME_STUBS: Readonly<Record<string, string>> = { [PROC_HOME]: PROC_STUB, [RUNNER_HOME]: RUNNER_STUB, [ARTIFACT_OUT_HOME]: ARTIFACT_OUT_STUB };

function grantOf(id: string): ReviewedGateGrant {
  const grant = REVIEWED_GRANTS.find((row) => row.id === id);
  if (grant === undefined) {
    throw new Error(`grant ${id} is not in the central table`);
  }
  return grant;
}

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

interface PassOptions {
  readonly grants?: readonly ReviewedGateGrant[];
  readonly requestedPaths?: readonly string[];
}

function passOf(policies: readonly GatePolicy[], files: Readonly<Record<string, string>>, options: PassOptions = {}): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    knownPolicies: ALL,
    policies,
    root: ROOT,
    project: projectOf(files),
    ...(options.requestedPaths === undefined ? {} : { requestedPaths: options.requestedPaths }),
    reviewedGrants: options.grants ?? [],
    failOnWarnings: false,
  });
}

const sorted = (lines: readonly string[]): readonly string[] => lines.toSorted((left, right) => left.localeCompare(right));

test("all ten plumbing policies preserve their founding fixtures", () => {
  expect(verifyPolicyProofs(ALL)).toEqual([]);
});

// ─── §4.2 ORDINARY IDENTITY — the one ordinary policy of the split ──────────────────────────────────────
test("an ordinary waiver binds to tooling-clock-budget at the NUMERIC LITERAL it reports — the translated CLOCK_SITES shape", () => {
  const waived = passOf([clockBudget], {
    "tooling/src/ui-audit/ops/walk.ts":
      "// @orb-waive tooling-clock-budget(30_000): the proof's stand-in reason and its end condition.\nexport const opts = { timeout: 30_000 };\n",
  });
  expect(waived.authority.authorityAlarms).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
});

// ─── §4.3 GRANT IDENTITY — the real rows ────────────────────────────────────────────────────────────────
interface GrantCase {
  readonly policy: GatePolicy;
  readonly grantId: string;
  readonly files: Readonly<Record<string, string>>;
  /** The same subject, no longer performing the licensed act — mode (A) staleness. */
  readonly stopped: Readonly<Record<string, string>>;
  /** A different operation on the same row — must license nothing. */
  readonly wrongOperation: string;
}

const GRANT_CASES: readonly GrantCase[] = [
  {
    policy: projectHome,
    grantId: "tooling-project-home:ts-workspace",
    files: {
      "tooling/src/_shared/ts-workspace.ts":
        'import { Project } from "ts-morph";\nexport const p = new Project({});\nexport const q = new Project({ useInMemoryFileSystem: true });\n',
    },
    stopped: { "tooling/src/_shared/ts-workspace.ts": "export const p = 1;\n" },
    wrongOperation: "ts-morph-project-import",
  },
  {
    policy: browserDoor,
    grantId: "tooling-browser-door:browser-launch",
    files: { "tooling/src/_shared/browser.ts": 'import { chromium } from "@playwright/test";\nexport const b = chromium.launch({ headless: true });\n' },
    stopped: { "tooling/src/_shared/browser.ts": "export const b = 1;\n" },
    wrongOperation: "browser-attach",
  },
  {
    policy: artifactPathHome,
    grantId: "tooling-artifact-path-home:artifacts",
    files: {
      "tooling/src/_shared/artifacts.ts":
        'import { join } from "node:path";\nexport function reportsPath(root: string, ...s: readonly string[]): string {\n  return join(root, "reports", ...s);\n}\n',
    },
    stopped: { "tooling/src/_shared/artifacts.ts": "export const reports = 1;\n" },
    wrongOperation: "reports-path-write",
  },
  {
    policy: processExitHome,
    grantId: "tooling-process-exit-home:run-tool",
    files: { [RUNNER_HOME]: 'import process from "node:process";\nexport function crash(): never {\n  process.exit(2);\n}\n' },
    stopped: { [RUNNER_HOME]: RUNNER_STUB },
    wrongOperation: "process-argv-read",
  },
  {
    policy: childProcessDoor,
    grantId: "tooling-child-process-door:snap-stage",
    files: {
      [PROC_HOME]: PROC_STUB,
      "tooling/src/snap/ops/stage.ts":
        'import { spawnFullPrioritySync } from "../../_shared/proc.ts";\nexport const boot = (): void => spawnFullPrioritySync("bash", []);\n',
    },
    stopped: { [PROC_HOME]: PROC_STUB, "tooling/src/snap/ops/stage.ts": "export const boot = 1;\n" },
    wrongOperation: "child-process-import",
  },
  {
    policy: portRegistry,
    grantId: "tooling-port-registry:ports",
    files: { "tooling/src/_shared/ports.ts": "export const DEV_PORTS = { server: 8788, vite: 5173 };\n" },
    stopped: { "tooling/src/_shared/ports.ts": "export const DEV_PORTS = { server: 0, vite: 0 };\n" },
    wrongOperation: "port-name",
  },
];

interface GrantOutcome {
  readonly toolErrors: number;
  readonly effective: number;
  readonly granted: number;
  readonly consumption: readonly { readonly id: string; readonly count: number }[];
  readonly alarmKinds: readonly string[];
}

function grantOutcome(policy: GatePolicy, files: Readonly<Record<string, string>>, grants: readonly ReviewedGateGrant[]): GrantOutcome {
  const result = passOf([policy], files, { grants });
  return {
    toolErrors: result.toolErrors.length,
    effective: result.authority.effectiveFindings.length,
    granted: result.authority.grantedFindings.length,
    consumption: [...result.authority.reviewedGrantConsumption],
    alarmKinds: result.authority.authorityAlarms.map((alarm) => alarm.kind),
  };
}

test("every reviewed-grant policy's real row is consumed exactly once by its subject and operation", () => {
  for (const { policy, grantId, files } of GRANT_CASES) {
    expect(grantOutcome(policy, files, [grantOf(grantId)]), grantId).toEqual({
      toolErrors: 0,
      effective: 0,
      granted: 1,
      consumption: [{ id: grantId, count: 1 }],
      alarmKinds: [],
    });
  }
});

test("a row keyed on the WRONG operation licenses nothing — the operation is part of the identity", () => {
  for (const { policy, grantId, files, wrongOperation } of GRANT_CASES) {
    expect(grantOutcome(policy, files, [{ ...grantOf(grantId), operation: wrongOperation }]), grantId).toEqual({
      toolErrors: 0,
      effective: 1,
      granted: 0,
      consumption: [{ id: grantId, count: 0 }],
      alarmKinds: ["stale-reviewed-grant"],
    });
  }
});

test("a row whose subject STOPPED performing the act is STALE after a complete run — the legacy five-table stale sweep, mode (A)", () => {
  for (const { policy, grantId, stopped } of GRANT_CASES) {
    expect(grantOutcome(policy, stopped, [grantOf(grantId)]), grantId).toEqual({
      toolErrors: 0,
      effective: 0,
      granted: 0,
      consumption: [{ id: grantId, count: 0 }],
      alarmKinds: ["stale-reviewed-grant"],
    });
  }
});

test("a row whose subject is GONE from the tree is STALE — mode (B), the path-keyed row whose file vanished", () => {
  const anchor = { "tooling/src/snap/lib/clean.ts": "export const clean = true;\n", ...HOME_STUBS };
  for (const { policy, grantId } of GRANT_CASES) {
    expect(grantOutcome(policy, anchor, [grantOf(grantId)]), grantId).toEqual({
      toolErrors: 0,
      effective: 0,
      granted: 0,
      consumption: [{ id: grantId, count: 0 }],
      alarmKinds: ["stale-reviewed-grant"],
    });
  }
});

test("the browser home carries TWO grants because it performs two licensed acts, and each is consumed once", () => {
  const both = passOf(
    [browserDoor],
    {
      "tooling/src/_shared/browser.ts":
        'import { chromium } from "@playwright/test";\nexport const b = chromium.launch({ headless: true });\nexport const a = chromium.connectOverCDP("http://127.0.0.1:9222");\n',
    },
    { grants: [grantOf("tooling-browser-door:browser-attach"), grantOf("tooling-browser-door:browser-launch")] },
  );
  expect(both.authority.effectiveFindings).toEqual([]);
  expect(both.authority.grantedFindings).toHaveLength(2);
  expect([...both.authority.reviewedGrantConsumption].toSorted((left, right) => left.id.localeCompare(right.id))).toEqual([
    { id: "tooling-browser-door:browser-attach", count: 1 },
    { id: "tooling-browser-door:browser-launch", count: 1 },
  ]);
  expect(both.authority.authorityAlarms).toEqual([]);
});

test("the central table carries exactly the nineteen plumbing rows, every subject on the tree", () => {
  const rows = reviewedGrantsFor(GRANT_POLICIES);
  expect(rows).toHaveLength(PLUMBING_GRANT_COUNT);
  expect(rows.map((row) => row.policyId)).toEqual(sorted(rows.map((row) => row.policyId)));
  const missing = rows.map((row) => row.subject).filter((subject) => !existsOnTree(subject));
  expect(missing).toEqual([]);
});

function existsOnTree(rel: string): boolean {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", rel], { cwd: process.cwd(), stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ─── §4.5 RECEIPT REFUSALS — the located homes ─────────────────────────────────────────────────────────
interface Refusal {
  readonly toolErrors: readonly (readonly [string, string])[];
  readonly withheld: readonly string[];
  readonly effective: number;
}

function refusalOf(result: ReturnType<typeof runPolicyPass>): Refusal {
  return {
    toolErrors: result.toolErrors.map((error) => [error.policyId, error.phase] as const),
    withheld: result.authority.withheldPolicyIds,
    effective: result.authority.effectiveFindings.length,
  };
}

const SLOTTED_TOOL = {
  "tooling/src/slotted/cli.ts":
    'import { withInstrumentRun } from "../_shared/artifact-out.ts";\nimport { shoot } from "./ops/shoot.ts";\nexport const run = withInstrumentRun("slotted", shoot);\n',
  "tooling/src/slotted/ops/shoot.ts":
    'import { artifactFile } from "../../_shared/artifact-out.ts";\nexport async function shoot(): Promise<number> {\n  await artifactFile("snaps", "root", ".png");\n  return 0;\n}\n',
};

test("a complete run files one receipt PER LOCATED HOME, all resolved", () => {
  const runSlot = passOf([artifactRunSlot], { [ARTIFACT_OUT_HOME]: ARTIFACT_OUT_STUB, ...SLOTTED_TOOL });
  expect(refusalOf(runSlot)).toEqual({ toolErrors: [], withheld: [], effective: 0 });
  expect(runSlot.policies[0]?.receipts).toEqual([
    { kind: "population", source: "artifact home: filers", members: 2, unresolved: 0 },
    { kind: "population", source: "artifact home: run slot", members: 1, unresolved: 0 },
  ]);
  const entry = passOf([cliEntry], {
    [RUNNER_HOME]: RUNNER_STUB,
    "tooling/src/goodcli/cli.ts": 'import { runTool } from "../_shared/run-tool.ts";\nawait runTool(() => 0);\n',
  });
  expect(refusalOf(entry)).toEqual({ toolErrors: [], withheld: [], effective: 0 });
  expect(entry.policies[0]?.receipts).toEqual([{ kind: "population", source: "program-entry home: run-tool", members: 1, unresolved: 0 }]);
  const doors = passOf([childProcessDoor], { [PROC_HOME]: PROC_STUB, "tooling/src/snap/lib/clean.ts": "export const clean = true;\n" });
  expect(refusalOf(doors)).toEqual({ toolErrors: [], withheld: [], effective: 0 });
  expect(doors.policies[0]?.receipts).toEqual([{ kind: "population", source: "child-process home: proc", members: 2, unresolved: 0 }]);
});

test("an ABSENT home REFUSES at the receipt phase — the legacy rename tripwire, now the runtime's own tool error", () => {
  const cases: readonly (readonly [GatePolicy, Readonly<Record<string, string>>, string])[] = [
    [artifactRunSlot, SLOTTED_TOOL, '"artifact home: filers" resolved zero members'],
    [
      cliEntry,
      { "tooling/src/goodcli/cli.ts": 'import { runTool } from "../_shared/run-tool.ts";\nawait runTool(() => 0);\n' },
      '"program-entry home: run-tool" resolved zero members',
    ],
    [childProcessDoor, { "tooling/src/snap/lib/clean.ts": "export const clean = true;\n" }, '"child-process home: proc" resolved zero members'],
  ];
  for (const [policy, files, message] of cases) {
    const blind = passOf([policy], files);
    expect(refusalOf(blind), policy.id).toEqual({ toolErrors: [[policy.id, "receipt"]], withheld: [policy.id], effective: 0 });
    expect(blind.toolErrors[0]?.message, policy.id).toContain(message);
  }
});

test("a RENAMED door leaves the home's receipt unresolved and refuses — the legacy would have re-keyed silently", () => {
  const renamed = passOf([childProcessDoor], {
    [PROC_HOME]:
      "export function spawnFullPrioritySync(cmd: string, args: readonly string[]): void {\n  void cmd;\n  void args;\n}\nexport function spawnDetached(cmd: string): void {\n  void cmd;\n}\n",
    "tooling/src/snap/lib/clean.ts": "export const clean = true;\n",
  });
  expect(refusalOf(renamed)).toEqual({ toolErrors: [[childProcessDoor.id, "receipt"]], withheld: [childProcessDoor.id], effective: 0 });
  expect(renamed.policies[0]?.receipts).toEqual([{ kind: "population", source: "child-process home: proc", members: 1, unresolved: 1 }]);
});

// ─── §4.5 THE EXACT-FILE DOOR — the root-config policy over a real root ─────────────────────────────────
const CONFIGS: Readonly<Record<string, string>> = {
  "vitest.config.ts": "export default { test: { testTimeout: budget(5000) } };\ndeclare function budget(n: number): number;\n",
  "playwright.config.ts": 'export default { webServer: { command: "x", timeout: budget(180_000) } };\ndeclare function budget(n: number): number;\n',
  "playwright-ct.config.ts": "export default { use: { ctPort: CT_VITE_PORT } };\ndeclare const CT_VITE_PORT: number;\n",
};

function plantConfigs(root: string, files: Readonly<Record<string, string>>): void {
  for (const [rel, text] of Object.entries(files)) {
    const absolute = join(root, rel);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, text);
  }
}

function resourcePass(root: string, overlay?: Readonly<Record<string, string | null>>): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    knownPolicies: ALL,
    policies: [runnerConfigLiterals],
    root,
    project: new Project({ useInMemoryFileSystem: true }),
    ...(overlay === undefined ? {} : { resourceOptions: { overlay } }),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("the three root configs read through their exact-file ids over a real root; a planted literal clock is the finding", ({ scratch }) => {
  const root = join(scratch, "runner-configs");
  plantConfigs(root, { ...CONFIGS, "vitest.config.ts": "export default { test: { testTimeout: 5000 } };\n" });
  const result = resourcePass(root);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings.map((finding) => `${finding.file}:${String(finding.line)} ${finding.token ?? ""}`)).toEqual([
    "vitest.config.ts:1 5000",
  ]);
});

test("a MISSING root config refuses the WHOLE fact at the population phase — the legacy blindness tripwire, now the door's own refusal", ({ scratch }) => {
  const root = join(scratch, "runner-configs-missing");
  plantConfigs(root, CONFIGS);
  const missing = resourcePass(root, { "playwright.config.ts": null });
  expect(missing.toolErrors.map((error) => [error.policyId, error.phase])).toEqual([[runnerConfigLiterals.id, "population"]]);
  expect(missing.authority.withheldPolicyIds).toEqual([runnerConfigLiterals.id]);
  expect(missing.authority.effectiveFindings).toEqual([]);
});

// ─── §4.5 DEFERRAL ──────────────────────────────────────────────────────────────────────────────────────
test("a narrowed request DEFERS every entire-population policy instead of adjudicating a home or a row its scope cannot see", () => {
  const files = {
    ...HOME_STUBS,
    "tooling/src/snap/lib/clean.ts": "export const clean = true;\n",
    "tooling/src/snap/ops/x.ts": 'import { chromium } from "@playwright/test";\nexport const b = chromium.launch();\n',
  };
  for (const policy of TREE.filter(({ execution }) => execution === "entire-population")) {
    const narrowed = passOf([policy], files, { requestedPaths: ["tooling/src/snap/lib/clean.ts"] });
    expect(narrowed.toolErrors, policy.id).toEqual([]);
    expect(narrowed.policies.find(({ id }) => id === policy.id)?.owner, policy.id).toMatchObject({ status: "not-applicable", population: "complete" });
    expect(narrowed.authority.effectiveFindings, policy.id).toEqual([]);
  }
  // The one selected-files policy judges exactly the file it was handed.
  const selected = passOf(
    [clockBudget],
    { "tooling/src/a.ts": "export const a = { timeout: 30_000 };\n", "tooling/src/b.ts": "export const b = { timeout: 30_000 };\n" },
    { requestedPaths: ["tooling/src/a.ts"] },
  );
  expect(selected.authority.effectiveFindings.map((finding) => finding.file)).toEqual(["tooling/src/a.ts"]);
});

// ─── §4.5 THE AMBIENT BRANCH of tooling-process-exit-home ───────────────────────────────────────────────
test("a bare `process.exit(` resolves through the AUGMENTED @types/node global once the plant declares `exit` — precise, not fail-closed", () => {
  const surface = nodeTypesProof()[NODE_TYPES_HOME];
  expect(surface).toBeDefined();
  const pidLine = /^(\s*)(?:readonly )?pid: number;$/mu;
  expect(surface).toMatch(pidLine);
  // Derived from the shared plant rather than re-spelled: the same shape the three sibling policies resolve
  // against, with the one member this policy reads added at the same indentation.
  const withExit = (surface ?? "").replace(pidLine, (line, indent: string) => `${line}\n${indent}exit(code?: number): never;`);
  const resolved = passOf([processExitHome], {
    [NODE_TYPES_HOME]: withExit,
    "tooling/src/ast/ops/bail.ts": "export function bail(): never {\n  process.exit(2);\n}\n",
  });
  expect(resolved.toolErrors).toEqual([]);
  expect(resolved.authority.effectiveFindings.map((finding) => `${finding.file} ${finding.token ?? ""}`)).toEqual(["tooling/src/ast/ops/bail.ts process.exit"]);
  expect(resolved.authority.effectiveFindings[0]?.message).toContain("a bare process.exit");
  expect(resolved.authority.effectiveFindings[0]?.message).not.toContain("CANNOT be established");
});

// ─── THE REAL TREE ──────────────────────────────────────────────────────────────────────────────────────
test(
  "the ten policies over this checkout: no findings, every plumbing grant consumed once, the translated clock waiver bound",
  () => {
    const root = process.cwd();
    const project = getWorkspace({ root });
    const result = runPolicyPass({ knownPolicies: ALL, policies: ALL, root, project, reviewedGrants: reviewedGrantsFor(ALL), failOnWarnings: false });
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.effectiveFindings).toEqual([]);
    // Pin the migrated occurrence, not a closed roster of every future ordinary waiver. The complete
    // run's effective findings and authority alarms below still judge every current occurrence.
    expect(
      result.authority.waivedFindings
        .filter(({ finding }) => finding.file === "tests/tooling/tool-guard.int.test.ts")
        .map(({ finding }) => `${finding.file} ${finding.token ?? ""}`),
    ).toEqual(["tests/tooling/tool-guard.int.test.ts 120_000"]);
    expect(result.authority.reviewedGrantConsumption.filter((row) => row.count !== 1)).toEqual([]);
    expect(result.authority.reviewedGrantConsumption).toHaveLength(PLUMBING_GRANT_COUNT);
    // Only this run's ten policies are KNOWN to it, so every other policy's live `@orb-waive` marker reads as
    // an unknown-policy alarm — a narrowed-roster artefact, not a verdict about the tree. An alarm naming a
    // plumbing policy, or of any other kind, is the real thing.
    const mine = new Set(ALL.map(({ id }) => id));
    expect(result.authority.authorityAlarms.filter((alarm) => alarm.kind !== "ordinary-waiver" || mine.has(alarm.policyId))).toEqual([]);
    for (const policy of result.policies) {
      expect(policy.owner.status, policy.id).toBe("success");
    }
  },
  REAL_TREE_BUDGET_MS,
);

// ─── §4.6 CONVERSION DIFFERENTIAL ────────────────────────────────────────────────────────────────────────
function toolingHref(relFromGates: string): string {
  return JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/gates", relFromGates)).href);
}

async function frozenLegacyGate(scratch: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${LEGACY.sha}:${LEGACY.path}`], { encoding: "utf8" });
  const target = join(scratch, basename(LEGACY.path));
  // The copy lives outside the checkout, so its RELATIVE imports are rewritten to file URLs. Every named module
  // is still on the tree; `config-static-read.ts` gained a text-fed sibling ADDITIVELY (`readStaticSource` is
  // byte-equivalent in behaviour), so the frozen descriptor runs the code it ran.
  let rewritten = source;
  for (const relative of ["../../_shared/ports.ts", "../contract/gate.ts", "../lib/ast-read.ts", "../lib/config-static-read.ts", "../lib/pass.ts"]) {
    const before = rewritten;
    rewritten = rewritten.replace(`from "${relative}"`, `from ${toolingHref(relative)}`);
    expect(rewritten, relative).not.toBe(before);
  }
  writeFileSync(target, rewritten);
  return ((await import(`${pathToFileURL(target).href}?frozen=${basename(LEGACY.path)}`)) as { readonly gate: GateDescriptor }).gate;
}

function legacyFiles(example: GateExample): Readonly<Record<string, string>> {
  return typeof example.files === "string" ? { [example.at ?? "tooling/src/x.ts"]: example.files } : example.files;
}

const LEGACY_ARMS = ["A", "B", "C", "D", "E", "F", "F2", "G", "H", "I", "J", "STALE", "BLIND"] as const;
type LegacyArm = (typeof LEGACY_ARMS)[number];

interface LegacyFinding {
  readonly file: string;
  readonly token?: string;
  readonly message?: string;
}

function legacyArm(finding: LegacyFinding): LegacyArm {
  const token = finding.token ?? "";
  const message = finding.message ?? "";
  if (message.startsWith("stale ")) {
    return "STALE";
  }
  if (message.includes("cannot read")) {
    return "BLIND";
  }
  if (message.includes("must enter through runTool")) {
    return "E";
  }
  if (message.includes("must open its artifact run slot")) {
    return "G";
  }
  if (token === "new Project(") {
    return "A";
  }
  if (token === 'import "node:child_process"') {
    return "F";
  }
  if (token === "process.exit(") {
    return "D";
  }
  if (token.startsWith("spawnFullPriority")) {
    return "F2";
  }
  if (token.endsWith(".launch(")) {
    return "B";
  }
  if (token.includes(".connect")) {
    return "H";
  }
  if (token.includes(" in ") && token.startsWith('"reports')) {
    return "C";
  }
  if (/^(?:timeout|timeoutMs|testTimeout|hookTimeout|actionTimeout|navigationTimeout): |_TIMEOUT_MS = |TimeoutMs = |^setTimeout\(/u.test(token)) {
    return "J";
  }
  return "I";
}

/** The final policy a legacy arm's finding lands in — or null for the two arms that produce no finding now
 *  (difference 1: F2's local declarations; difference 5: STALE/BLIND are grant liveness and the door's refusal). */
const ARM_POLICY: ReadonlyMap<LegacyArm, string | null> = new Map<LegacyArm, string | null>([
  ["A", projectHome.id],
  ["B", browserDoor.id],
  ["H", browserDoor.id],
  ["C", artifactPathHome.id],
  ["D", processExitHome.id],
  ["E", cliEntry.id],
  ["F", childProcessDoor.id],
  ["F2", null],
  ["G", artifactRunSlot.id],
  ["I", portRegistry.id],
  ["J", clockBudget.id],
  ["STALE", null],
  ["BLIND", null],
]);

/** Difference 3: the legacy mustPass rows that sat on a censused subject, reported by the final policies
 *  because the differential carries no grant and no waiver. Keyed on the example's path. */
const CENSUSED_SUBJECTS: Readonly<Record<string, string>> = {
  "tooling/src/_shared/ports.ts": portRegistry.id,
  "tooling/src/_shared/ts-workspace.ts": projectHome.id,
  "tooling/src/verify/lib/comment-spans.ts": projectHome.id,
  "tooling/src/_shared/browser.ts": browserDoor.id,
  "tests/tooling/verify/ops/structure.int.test.ts": clockBudget.id,
};

function legacyVerdict(gateDescriptor: GateDescriptor, files: Readonly<Record<string, string>>): readonly LegacyFinding[] {
  const project = projectOf(files);
  const result = runPass([gateDescriptor], {
    root: ROOT,
    project,
    scope: { kind: "project" },
    files: project.getSourceFiles(),
    checker: () => project.getTypeChecker(),
  });
  expect(result.toolErrors).toEqual([]);
  return (result.gates[0]?.findings ?? []).map((finding) => ({
    file: finding.file,
    ...(finding.token === undefined ? {} : { token: finding.token }),
    ...(finding.message === undefined ? {} : { message: finding.message }),
  }));
}

/** The final `<policy> <file>` line one legacy finding maps to, or null for the arms that produce no finding
 *  now (difference 1: F2's local declarations; difference 5: STALE/BLIND are grant liveness and the door's
 *  refusal). Difference 6: the legacy G finding sat on `<tool>/cli.ts`; the final one sits on the filing
 *  call, whose file the legacy message names first (`<site> files an artifact, …`). */
function finalLineOf(finding: LegacyFinding): { readonly arm: LegacyArm; readonly line: string } | null {
  const arm = legacyArm(finding);
  const policy = ARM_POLICY.get(arm) ?? null;
  if (policy === null) {
    return null;
  }
  const file = arm === "G" ? ((finding.message ?? "").split(" files an artifact")[0] ?? finding.file) : finding.file;
  return { arm, line: `${policy} ${file}` };
}

/** `<policy> <file>` per finding, with multiplicity — the comparable unit (difference 6: lines are not).
 *  Difference 2: the port policy reports one finding per (file, operation). Difference 3: a legacy mustPass
 *  row on a censused subject is a finding now. */
function expectedFinalLines(before: readonly LegacyFinding[], example: GateExample, proofArm: "mustFlag" | "mustPass"): readonly string[] {
  const lines: string[] = [];
  const portLines = new Set<string>();
  for (const finding of before) {
    const mapped = finalLineOf(finding);
    if (mapped === null || (mapped.arm === "I" && portLines.has(mapped.line))) {
      continue;
    }
    if (mapped.arm === "I") {
      portLines.add(mapped.line);
    }
    lines.push(mapped.line);
  }
  const censused = proofArm === "mustPass" && typeof example.files === "string" && example.at !== undefined ? CENSUSED_SUBJECTS[example.at] : undefined;
  if (censused !== undefined) {
    lines.push(`${censused} ${example.at ?? ""}`);
  }
  return sorted(lines);
}

/** Replay ONE legacy example through both sides and assert the classified outcome; returns the legacy arms
 *  it exercised. Difference 4 is asserted here: the planted homes change NOTHING on the legacy side. */
function replayExample(legacy: GateDescriptor, example: GateExample, proofArm: "mustFlag" | "mustPass"): readonly LegacyArm[] {
  const bare = legacyFiles(example);
  const files = { ...HOME_STUBS, ...bare };
  const before = legacyVerdict(legacy, bare);
  expect(legacyVerdict(legacy, files), example.why).toEqual(before);
  const after = passOf(TREE, files);
  expect(after.toolErrors, example.why).toEqual([]);
  const lines = sorted(after.authority.effectiveFindings.map((finding) => `${finding.policyId} ${finding.file}`));
  expect(lines, example.why).toEqual(expectedFinalLines(before, example, proofArm));
  return before.map(legacyArm);
}

test(
  "the nine tree policies reproduce the frozen legacy gate on every original example, with the seven classified differences",
  async ({ scratch }) => {
    const legacy = await frozenLegacyGate(scratch);
    const examples = [...legacy.mustFlag.map((example) => [example, "mustFlag"] as const), ...legacy.mustPass.map((example) => [example, "mustPass"] as const)];
    expect(examples).toHaveLength(LEGACY_EXAMPLES);
    const arms: LegacyArm[] = [];
    for (const [example, proofArm] of examples) {
      arms.push(...replayExample(legacy, example, proofArm));
    }
    // Legacy-side coverage, read first: every arm the descriptor carried is exercised by its own rows, so the
    // replay is evidence and nothing here is constructed in place of it.
    const count = (arm: LegacyArm): number => arms.filter((entry) => entry === arm).length;
    const exercised: readonly (readonly [LegacyArm, number])[] = (["A", "B", "C", "D", "E", "F", "F2", "G", "H", "I", "J"] as const).map(
      (arm) => [arm, count(arm)] as const,
    );
    expect(exercised).toEqual([
      ["A", 1],
      ["B", 1],
      ["C", 1],
      ["D", 1],
      ["E", 1],
      ["F", 2],
      ["F2", 2],
      ["G", 1],
      ["H", 2],
      ["I", 6],
      ["J", 3],
    ]);
    expect(count("STALE")).toBeGreaterThan(0);
    expect(count("BLIND")).toBeGreaterThan(0);
  },
  DIFFERENTIAL_BUDGET_MS,
);
