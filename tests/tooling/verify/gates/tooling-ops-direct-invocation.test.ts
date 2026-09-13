// The standing family floor for `tooling-ops-direct-invocation` (#1950, docs/history/gate-runtime-worked-cases-2026-09.md §"Mixed-hook arity amendments" "one hard policy"):
// what its declared rows structurally cannot express.
//
//   §4.5 — the two program-entry HOMES are located and receipted one receipt each, so an absent home or a
//          renamed export is a RECEIPT REFUSAL (a tool error, the policy withheld), never a finding and
//          never a silent zero. Conformance has no must-refuse arm (§4.5b), so the legacy blindness
//          example lives here as a `runPolicyPass` pin: guard home absent · runner home absent · guard
//          export renamed · the complete run's receipt pair. And the `entire-population` deferral: a
//          narrowed request must DEFER rather than refuse on a missing home it was never handed.
//   §4.6 — the conversion differential against the frozen legacy descriptor at `36bf5fa74`: every legacy
//          example replayed through the legacy `runPass` and the final policy, with the two classified
//          differences asserted rather than averaged: (1) POSITION — legacy file-level findings sat at
//          `0:0`, the final sink refuses a zero coordinate and anchors at `1:1`; (2) the BLINDNESS arm —
//          legacy reported one finding on the gate module's own path when a home's sole export could not
//          be derived; the final policy REFUSES at the receipt phase instead. Legacy-side coverage, read
//          first: 5 of 6 legacy examples exercise the per-file arm (3 flag, 2 pass shapes plus the
//          out-of-population row) and 1 exercises the blindness arm — nonzero on both, so the replay is
//          evidence and nothing here is constructed in place of it.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/tooling-ops-direct-invocation.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/tooling-ops-direct-invocation";
const GUARD_HOME = "tooling/src/_shared/entrypoint.ts";
const RUNNER_HOME = "tooling/src/_shared/run-tool.ts";
const GUARD_SOURCE = "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n";
const RUNNER_SOURCE = "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n";
const GUARDED_OPS =
  'import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";\n\nrefuseDirectInvocation(import.meta.url, "pnpm aa");\n\nexport const x = 1;\n';
const OPS = "tooling/src/aa/ops/x.ts";
/** The legacy descriptor's own path — where its blindness arm anchored, outside any fixture. */
const LEGACY_PATH = "tooling/src/verify/gates/tooling-ops-direct-invocation.ts";
/** The commit the brief names as the legacy source; verified byte-identical to the pre-conversion module. */
const LEGACY_SHA = "36bf5fa74";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(files: Readonly<Record<string, string>>, requestedPaths?: readonly string[]): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: ROOT,
    project: projectOf(files),
    ...(requestedPaths === undefined ? {} : { requestedPaths }),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("tooling-ops-direct-invocation preserves its founding fixtures", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

// ─── §4.5 RECEIPT REFUSALS ──────────────────────────────────────────────────────────────────────────────

test("a complete run files ONE receipt per program-entry home, both resolved", () => {
  const complete = passOf({ [GUARD_HOME]: GUARD_SOURCE, [RUNNER_HOME]: RUNNER_SOURCE, [OPS]: GUARDED_OPS });
  expect(complete.toolErrors).toEqual([]);
  expect(complete.authority.effectiveFindings).toEqual([]);
  expect(complete.policies[0]?.receipts).toEqual([
    { kind: "population", source: "program-entry home: entrypoint", members: 1, unresolved: 0 },
    { kind: "population", source: "program-entry home: run-tool", members: 1, unresolved: 0 },
  ]);
});

test("the GUARD home absent REFUSES at the receipt phase — the legacy blindness finding, now a tool error", () => {
  const blind = passOf({ [RUNNER_HOME]: RUNNER_SOURCE, [OPS]: GUARDED_OPS });
  expect(blind.toolErrors).toMatchObject([{ policyId: gate.id, phase: "receipt" }]);
  expect(blind.toolErrors[0]?.message).toContain('"program-entry home: entrypoint" resolved zero members');
  expect(blind.authority.withheldPolicyIds).toEqual([gate.id]);
  expect(blind.authority.effectiveFindings).toEqual([]);
});

test("the RUNNER home absent refuses on ITS OWN receipt — a summed pair would have read as members: 1", () => {
  const blind = passOf({ [GUARD_HOME]: GUARD_SOURCE, [OPS]: GUARDED_OPS });
  expect(blind.toolErrors).toMatchObject([{ policyId: gate.id, phase: "receipt" }]);
  expect(blind.toolErrors[0]?.message).toContain('"program-entry home: run-tool" resolved zero members');
  expect(blind.authority.withheldPolicyIds).toEqual([gate.id]);
});

test("a RENAMED guard export leaves the home's receipt unresolved and refuses — the legacy re-derived the new name silently", () => {
  const renamed = passOf({
    [GUARD_HOME]: "export function refuseEntry(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
    [RUNNER_HOME]: RUNNER_SOURCE,
    [OPS]: 'import { refuseEntry } from "../../_shared/entrypoint.ts";\n\nrefuseEntry(import.meta.url, "pnpm aa");\n',
  });
  expect(renamed.toolErrors).toMatchObject([{ policyId: gate.id, phase: "receipt" }]);
  expect(renamed.toolErrors[0]?.message).toContain('"program-entry home: entrypoint" left 1 unresolved');
  expect(renamed.policies[0]?.receipts).toEqual([
    { kind: "population", source: "program-entry home: entrypoint", members: 0, unresolved: 1 },
    { kind: "population", source: "program-entry home: run-tool", members: 1, unresolved: 0 },
  ]);
});

test("a narrowed request DEFERS the entire-population policy instead of refusing on a home it was never handed", () => {
  const narrowed = passOf({ [GUARD_HOME]: GUARD_SOURCE, [RUNNER_HOME]: RUNNER_SOURCE, [OPS]: "export const x = 1;\n" }, [OPS]);
  expect(narrowed.toolErrors).toEqual([]);
  expect(narrowed.policies[0]?.owner).toMatchObject({ status: "not-applicable", population: "complete" });
  expect(narrowed.authority.effectiveFindings).toEqual([]);
});

// ─── §4.6 CONVERSION DIFFERENTIAL ────────────────────────────────────────────────────────────────────────

function toolingHref(relFromGates: string): string {
  return JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/gates", relFromGates)).href);
}

async function frozenLegacyGate(scratch: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${LEGACY_SHA}:${LEGACY_PATH}`], { encoding: "utf8" });
  const target = join(scratch, basename(LEGACY_PATH));
  // The copy lives outside the checkout, so its RELATIVE imports are rewritten to file URLs. Every named
  // module is still on the tree; `_shared/ts-workspace.ts` changed only ADDITIVELY since the SHA
  // (`moduleScopeCalls` was extracted and `moduleScopeCallees` now derives its names from it — the same
  // statement filter and the same identifier-callee names), so the frozen descriptor runs the code it ran.
  const rewritten = source
    .replace('from "../../_shared/ts-workspace.ts"', `from ${toolingHref("../../_shared/ts-workspace.ts")}`)
    .replace('from "../contract/gate.ts"', `from ${toolingHref("../contract/gate.ts")}`)
    .replace('from "../lib/pass.ts"', `from ${toolingHref("../lib/pass.ts")}`);
  expect(rewritten).not.toBe(source);
  writeFileSync(target, rewritten);
  return ((await import(`${pathToFileURL(target).href}?frozen=${basename(LEGACY_PATH)}`)) as { readonly gate: GateDescriptor }).gate;
}

function legacyFiles(example: GateExample): Readonly<Record<string, string>> {
  return typeof example.files === "string" ? { [example.at ?? OPS]: example.files } : example.files;
}

/** One comparable outcome per side. Legacy has two shapes — per-file findings, or the BLINDNESS finding on
 *  the gate module's own path; the final policy has two — per-file findings, or a receipt REFUSAL. Every
 *  field is filled on both sides so the comparison is one unconditional `toEqual`. */
interface Outcome {
  readonly kind: "findings" | "blind" | "refused";
  readonly lines: readonly string[];
  readonly toolErrors: readonly (readonly [string, string])[];
  readonly withheld: readonly string[];
}

const line = (finding: { readonly file: string; readonly line: number; readonly column: number }): string =>
  `${finding.file} ${finding.line}:${finding.column}`;
const sorted = (lines: readonly string[]): readonly string[] => lines.toSorted((left, right) => left.localeCompare(right));

function legacyOutcome(gateDescriptor: GateDescriptor, files: Readonly<Record<string, string>>): Outcome {
  const project = projectOf(files);
  const result = runPass([gateDescriptor], {
    root: ROOT,
    project,
    scope: { kind: "project" },
    files: project.getSourceFiles(),
    checker: () => project.getTypeChecker(),
  });
  const findings = result.gates[0]?.findings ?? [];
  return {
    kind: findings.some((finding) => finding.file === LEGACY_PATH) ? "blind" : "findings",
    lines: sorted(findings.map(line)),
    toolErrors: result.toolErrors.map((error) => [error.gate, error.phase] as const),
    withheld: [],
  };
}

function finalOutcome(result: ReturnType<typeof runPolicyPass>): Outcome {
  return {
    kind: result.toolErrors.length > 0 ? "refused" : "findings",
    lines: sorted(result.authority.effectiveFindings.map(line)),
    toolErrors: result.toolErrors.map((error) => [error.policyId, error.phase] as const),
    withheld: result.authority.withheldPolicyIds,
  };
}

/** The two CLASSIFIED differences, applied to the legacy outcome so the comparison is one `toEqual`. */
function expectedFinal(before: Outcome): Outcome {
  if (before.kind === "blind") {
    // DIFFERENCE 2: the legacy blindness FINDING (one, on the gate module's own path at 0:0) is the final
    // policy's receipt REFUSAL — a tool error at the receipt phase and the policy withheld.
    return { kind: "refused", lines: [], toolErrors: [[gate.id, "receipt"]], withheld: [gate.id] };
  }
  // DIFFERENCE 1: the same files are reported, at `1:1` where legacy wrote `0:0`.
  return { ...before, lines: before.lines.map((entry) => entry.replace(/ 0:0$/u, " 1:1")) };
}

test("the final policy reproduces the frozen legacy gate on every original example, with its two classified differences", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch);
  const examples = [...legacy.mustFlag, ...legacy.mustPass];
  expect(examples).toHaveLength(6);
  const kinds: string[] = [];
  for (const example of examples) {
    const files = legacyFiles(example);
    const before = legacyOutcome(legacy, files);
    kinds.push(before.kind);
    expect(before.toolErrors, example.why).toEqual([]);
    expect(finalOutcome(passOf(files)), example.why).toEqual(expectedFinal(before));
  }
  // The legacy corpus exercised BOTH arms, or this differential would be a vacuous replay: five per-file
  // examples (three flag shapes, two pass shapes, the out-of-population row reads as zero findings) and
  // the one blindness example.
  expect(kinds.filter((kind) => kind === "findings")).toHaveLength(5);
  expect(kinds.filter((kind) => kind === "blind")).toHaveLength(1);
});
