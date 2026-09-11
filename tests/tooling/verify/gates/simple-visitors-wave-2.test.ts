// The standing conformance + differential net for the second SIMPLE-tier wave (#1923): two pure syntax
// policies with no shared readers, no module state, no resources — `member-card-clamped` (a whole-
// harness-population identifier/declaration policy) and `test-determinism` (a `visitFile` line scan with
// a `population`/`notUnder` exclusion in place of the legacy `scanRoot`). Same recipe as
// `simple-file-hooks.test.ts`: `verifyPolicyProofs` runs the final policy's own proofs through the
// production runtime, and the differential test replays every ORIGINAL mustFlag/mustPass example from the
// frozen pre-conversion source through both the legacy dispatcher and the final one, proving the
// conversion changed no observable verdict.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as memberCardClamped } from "../../../../tooling/src/verify/gates/member-card-clamped.ts";
import { gate as testDeterminism } from "../../../../tooling/src/verify/gates/test-determinism.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/simple-visitors-wave-2";
// The commit immediately before this wave's conversion — the last commit where both gates still carried
// the legacy GateDescriptor shape.
const BASE = "99b7429e2b0377aa5a6ae62341f9a22aa40de94c";
const PATHS = ["tooling/src/verify/gates/member-card-clamped.ts", "tooling/src/verify/gates/test-determinism.ts"] as const;

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function legacyFiles(example: GateExample): Readonly<Record<string, string>> {
  return typeof example.files === "string" ? { [example.at ?? "packages/ui/src/x.ts"]: example.files } : example.files;
}

function legacyFindings(gate: GateDescriptor, files: Readonly<Record<string, string>>): readonly { readonly file: string; readonly message: string }[] {
  const project = projectOf(files);
  const result = runPass([gate], { root: ROOT, project, scope: { kind: "project" }, files: project.getSourceFiles(), checker: () => project.getTypeChecker() });
  expect(result.toolErrors).toEqual([]);
  expect(result.gates).toHaveLength(1);
  return (result.gates[0]?.findings ?? [])
    .map((finding) => ({ file: finding.file, message: finding.message ?? gate.message }))
    .toSorted((left, right) => left.file.localeCompare(right.file) || left.message.localeCompare(right.message));
}

function finalFindings(gate: GatePolicy, files: Readonly<Record<string, string>>): readonly { readonly file: string; readonly message: string }[] {
  const project = projectOf(files);
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.policies[0]?.owner.status).toBe("success");
  return result.authority.effectiveFindings
    .map((finding) => ({ file: finding.file, message: finding.message ?? gate.message }))
    .toSorted((left, right) => left.file.localeCompare(right.file) || left.message.localeCompare(right.message));
}

function toolingHref(relFromGates: string): string {
  return JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/gates", relFromGates)).href);
}

async function frozenLegacyGate(path: (typeof PATHS)[number], scratch: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${BASE}:${path}`], { encoding: "utf8" });
  const target = join(scratch, basename(path));
  const rewritten = source
    .replace('from "../contract/gate.ts"', `from ${toolingHref("../contract/gate.ts")}`)
    .replace('from "../lib/comment-spans.ts"', `from ${toolingHref("../lib/comment-spans.ts")}`);
  writeFileSync(target, rewritten);
  return ((await import(`${pathToFileURL(target).href}?frozen=${basename(path)}`)) as { readonly gate: GateDescriptor }).gate;
}

test("the converted second-wave policies pass their production proof runtime", () => {
  expect(verifyPolicyProofs([memberCardClamped, testDeterminism])).toEqual([]);
});

// The two per-site escape examples in test-determinism's legacy mustPass used the RETIRED
// `@orb-gate-ignore <gate>: <reason>` marker. The final runtime's central ordinary-waiver reconciliation
// speaks only the program-wide `@orb-waive <policy>(<position>): <reason>` grammar (ordinary-waiver.ts) —
// a whole-cutover vocabulary change this conversion did not introduce and cannot make byte-identical.
// test-determinism.ts's own mustPass proves the SAME two suppressions hold under the new marker; excluded
// here so the differential asserts only what a legacy/final comparison can honestly assert.
const MARKER_VOCABULARY_CHANGED = new Set(["tests/server/marked.test.ts", "tests/server/marked-hrtime.test.ts"]);

function isMarkerVocabularyExample(files: Readonly<Record<string, string>>): boolean {
  return Object.keys(files).some((path) => MARKER_VOCABULARY_CHANGED.has(path));
}

// The legacy `tests/support/` and `tests/e2e/` mustPass examples plant exactly ONE file, entirely inside
// the final policy's `notUnder` exclusion — the final population resolver refuses a candidate set that
// resolves to zero admitted paths (a tool error, not a pass) rather than silently green. A companion
// IN-population file is neutral to both engines (no banned call, admitted by the legacy scanRoot too).
const POPULATION_DEGENERATE = new Set(["tests/support/clock.test.ts", "tests/e2e/flow.test.ts"]);
const COMPANION_PATH = "tests/server/differential-companion.test.ts";
const COMPANION_SOURCE = "export const t = clock.now();\n";

function withPopulationCompanion(files: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.keys(files).some((path) => POPULATION_DEGENERATE.has(path)) ? { ...files, [COMPANION_PATH]: COMPANION_SOURCE } : files;
}

test("the final policies match the frozen legacy policies on every original proof corpus", async ({ scratch }) => {
  for (const [path, policy] of [
    [PATHS[0], memberCardClamped],
    [PATHS[1], testDeterminism],
  ] as const) {
    const legacy = await frozenLegacyGate(path, scratch);
    for (const example of [...legacy.mustFlag, ...legacy.mustPass]) {
      const files = legacyFiles(example);
      if (isMarkerVocabularyExample(files)) {
        continue;
      }
      const withCompanion = withPopulationCompanion(files);
      expect(finalFindings(policy, withCompanion), `${policy.id}: ${example.why}`).toEqual(legacyFindings(legacy, withCompanion));
    }
  }
});
