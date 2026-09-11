// The standing conformance + differential net for the fourth SIMPLE-tier wave (#1584/#1943): four pure
// syntax policies converted from free-form `visitFile`/descendant-walk descriptors into kind-indexed
// `defineGate` visitors with all state moved into `create`.
//
//   no-default-props                        — a plain member-name match, unchanged shape.
//   test-no-stubs                           — state moved into per-file test/assertion lists, reconciled
//                                              by node-range containment in `evaluate` (never a private
//                                              descendant walk).
//   no-form-state-in-useeffect              — the legacy `deps.forEachDescendant` walk inverted into a
//                                              direct MEMBER_ACCESS_KINDS subscription plus an ancestor
//                                              climb (#1506 identity-not-spelling preserved).
//   persist-partialize-and-total-migrate    — ARM A (bare `persist(` outside the factories) RETIRED as a
//                                              duplicate of `no-raw-zustand-persist`'s stronger `persistMint`
//                                              reviewed-grant arm; only ARM B (factory options completeness)
//                                              survives under this id, and since #1954 ARM B reports ONE
//                                              finding per call site rather than one per missing key, so its
//                                              ordinary waiver door is addressable at all.
//
// Same recipe as simple-visitors-wave-2.test.ts: `verifyPolicyProofs` runs each final policy's own proofs
// through the production runtime; the differential replays every ORIGINAL mustFlag/mustPass example from
// the frozen pre-conversion source (172485b3a, the commit immediately before this wave) through both the
// legacy dispatcher and the final one; and a successor-proof section replays persist-partialize's retired
// ARM A examples through `no-raw-zustand-persist` instead, so the retirement is a receipt, not a dropped rule.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { zustandProof } from "../../../../tooling/src/verify/gates/_proof/zustand.ts";
import { gate as noDefaultProps } from "../../../../tooling/src/verify/gates/no-default-props.ts";
import { gate as noFormStateInUseeffect } from "../../../../tooling/src/verify/gates/no-form-state-in-useeffect.ts";
import { gate as noRawZustandPersist } from "../../../../tooling/src/verify/gates/no-raw-zustand-persist.ts";
import { gate as persistPartializeAndTotalMigrate } from "../../../../tooling/src/verify/gates/persist-partialize-and-total-migrate.ts";
import { gate as testNoStubs } from "../../../../tooling/src/verify/gates/test-no-stubs.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/simple-visitors-wave-4";
// The commit immediately before this wave's conversion — the last commit where all four gates still
// carried the legacy GateDescriptor shape.
const BASE = "172485b3adbd25d4d797991391371f08d078ee34";
const PATHS = [
  "tooling/src/verify/gates/no-default-props.ts",
  "tooling/src/verify/gates/test-no-stubs.ts",
  "tooling/src/verify/gates/no-form-state-in-useeffect.ts",
  "tooling/src/verify/gates/persist-partialize-and-total-migrate.ts",
] as const;

const FAMILY: readonly GatePolicy[] = [noDefaultProps, testNoStubs, noFormStateInUseeffect, persistPartializeAndTotalMigrate];

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(policy: GatePolicy, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project: projectOf(files), reviewedGrants: [], failOnWarnings: false });
}

test("the converted fourth-wave policies pass their production proof runtime", () => {
  expect(verifyPolicyProofs(FAMILY)).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// ORDINARY MARKER IDENTITY: no-default-props and no-form-state-in-useeffect are both ordinary. A marker
// naming THIS finding's own policy at its own position suppresses it; a marker naming a DIFFERENT known
// ordinary policy at the same position must not.
// ---------------------------------------------------------------------------------------------------
test("a correctly-addressed ordinary waiver on no-default-props suppresses the finding", () => {
  const waived = passOf(noDefaultProps, {
    "packages/ui/src/MyComponent.tsx":
      "// @orb-waive no-default-props(defaultProps): temporary legacy interop, tracked in #0000.\nMyComponent.defaultProps = { id: 1 };\n",
  });
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("a waiver naming a DIFFERENT known ordinary policy at the same position suppresses nothing", () => {
  const mismatched = runPolicyPass({
    knownPolicies: [noDefaultProps, noFormStateInUseeffect],
    policies: [noDefaultProps, noFormStateInUseeffect],
    root: ROOT,
    project: projectOf({
      "packages/ui/src/MyComponent.tsx":
        "// @orb-waive no-form-state-in-useeffect(defaultProps): wrong policy id entirely.\nMyComponent.defaultProps = { id: 1 };\n",
    }),
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(mismatched.authority.effectiveFindings).toHaveLength(1);
  expect(mismatched.authority.effectiveFindings[0]?.policyId).toBe("no-default-props");
});

// ---------------------------------------------------------------------------------------------------
// FROZEN-LEGACY DIFFERENTIAL: replay every ORIGINAL mustFlag/mustPass example from the pre-conversion
// source through both the legacy dispatcher and the final one, over the three gates whose behavior did
// not narrow (persist-partialize's retired ARM A is proved separately below, against its successor).
// ---------------------------------------------------------------------------------------------------
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
    .replace('from "../lib/symbol-reference.ts"', `from ${toolingHref("../lib/symbol-reference.ts")}`);
  writeFileSync(target, rewritten);
  return ((await import(`${pathToFileURL(target).href}?frozen=${basename(path)}`)) as { readonly gate: GateDescriptor }).gate;
}

// persist-partialize is EXCLUDED from this blanket message-text differential and run separately below: ARM
// A (bare persist outside the factories) is retired (successor proof further down), and ARM B's own
// MESSAGE was deliberately rewritten to describe only the surviving factory-completeness rule instead of
// the old shared-with-ARM-A wording — a legitimate text change, not a narrowed verdict. Its COUNT parity is
// pinned in the dedicated test right after this one.
test("the final policies match the frozen legacy policies on every original proof corpus", async ({ scratch }) => {
  for (const [path, policy] of [
    [PATHS[0], noDefaultProps],
    [PATHS[1], testNoStubs],
    [PATHS[2], noFormStateInUseeffect],
  ] as const) {
    const legacy = await frozenLegacyGate(path, scratch);
    for (const example of [...legacy.mustFlag, ...legacy.mustPass]) {
      const files = legacyFiles(example);
      expect(finalFindings(policy, files), `${policy.id}: ${example.why}`).toEqual(legacyFindings(legacy, files));
    }
  }
});

// persist-partialize ARM B differential. Both legacy ARM A examples (the bare persist mustFlag at
// packages/client/src/features/x/store.ts, and the factory-mint mustPass negative control at
// packages/client/src/features/x/store2.ts — neither is a factory file, both belong to the retired arm)
// are excluded here and covered by the successor proof further down.
//
// THE ONE CLASSIFIED DIFFERENCE (#1954, 2026-09-11): cardinality collapsed from N findings per missing key
// to ONE finding per persist() call site. Until 2026-09-11 this test asserted exact COUNT parity, which the
// collapse necessarily breaks — the ruling survives, its INPUT changed, so the assertion keeps everything
// except the number.
//
// WHY THE COLLAPSE IS FORCED, not a convenience: the legacy descriptor distinguished its per-key findings
// with SYNTHETIC tokens (`persist opts missing <key>`). The final runtime forbids that —
// `lib/ordinary-waiver.ts` `locateFinding` requires a finding's position token to be an EXACT slice of the
// authored source at its reported line/column, and an ABSENT key has no authored text to anchor on. So
// under the final contract the per-key findings could only share the `persist` callee's token, which made
// them byte-identical and the ORDINARY policy permanently unwaivable (every marker resolved `over-broad`
// and suppressed nothing; a second marker made it worse). One finding per call site is the only shape the
// contract permits.
//
// What the differential still catches (guide §4.6 — the point is UNINTENDED drift):
//   1. FILE-SET parity — the set of files carrying at least one finding is identical. This is the property
//      that catches a site silently going quiet, which is the real risk of a cardinality change.
//   2. Final >= 1 wherever legacy >= 1 — no flagged site is downgraded to clean.
//   3. Final <= legacy — the difference is a COLLAPSE only; the conversion may not invent findings.
//   4. SUCCESSOR PROOF for the merged arm: the surviving single finding still NAMES every missing key in
//      its message, so the per-key diagnostic the legacy cardinality carried is preserved in text rather
//      than lost. An author loses nothing but the ability to waive one key while leaving the others live —
//      and that ability never existed under the final runtime, since it had no addressable position.
const FACTORY_FILES = new Set(["packages/client/src/state/create-persisted-store.ts", "packages/client/src/state/create-entity-draft-store.ts"]);
const REQUIRED_PERSIST_KEYS = ["version", "partialize", "migrate"] as const;

function isArmBExample(files: Readonly<Record<string, string>>): boolean {
  return Object.keys(files).every((path) => FACTORY_FILES.has(path));
}

function fileSet(findings: readonly { readonly file: string }[]): readonly string[] {
  return [...new Set(findings.map(({ file }) => file))].toSorted((left, right) => left.localeCompare(right));
}

function countsByFile(findings: readonly { readonly file: string }[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const { file } of findings) {
    counts.set(file, (counts.get(file) ?? 0) + 1);
  }
  return counts;
}

/** The keys an ARM-B fixture's own source does not spell — these fixtures are one persist() call with a
 *  literal options object, so a text read is exact and needs no second parse. */
function missingKeysOf(files: Readonly<Record<string, string>>): readonly string[] {
  const source = Object.values(files).join("\n");
  return REQUIRED_PERSIST_KEYS.filter((key) => !source.includes(key));
}

test("persist-partialize-and-total-migrate's surviving ARM B flags the same FILE SET as the frozen legacy, collapsed to one finding per call site", async ({
  scratch,
}) => {
  const legacy = await frozenLegacyGate(PATHS[3], scratch);
  const armBExamples = [...legacy.mustFlag, ...legacy.mustPass].filter((example) => isArmBExample(legacyFiles(example)));
  expect(armBExamples.length).toBeGreaterThan(0);
  for (const example of armBExamples) {
    const files = legacyFiles(example);
    const label = `${persistPartializeAndTotalMigrate.id}: ${example.why}`;
    const legacyResult = legacyFindings(legacy, files);
    const finalResult = finalFindings(persistPartializeAndTotalMigrate, files);
    // 1 — no site goes quiet and no new site appears.
    expect(fileSet(finalResult), label).toEqual(fileSet(legacyResult));
    const legacyCounts = countsByFile(legacyResult);
    const finalCounts = countsByFile(finalResult);
    for (const [file, legacyCount] of legacyCounts) {
      const finalCount = finalCounts.get(file) ?? 0;
      // 2 — still flagged, and 3 — collapsed, never inflated.
      expect(finalCount, `${label} @ ${file}`).toBeGreaterThanOrEqual(1);
      expect(finalCount, `${label} @ ${file}`).toBeLessThanOrEqual(legacyCount);
    }
    // 4 — successor proof: the collapsed finding still names every key the legacy reported separately.
    const missing = missingKeysOf(files);
    const text = finalResult.map(({ message }) => message).join(" ");
    expect(
      missing.filter((key) => text.includes(key)),
      `${label}: the collapsed finding must still name every missing key`,
    ).toEqual(missing);
  }
});

test("the ordinary waiver door on persist-partialize-and-total-migrate is REACHABLE — the #1954 defect", () => {
  const waived = passOf(persistPartializeAndTotalMigrate, {
    "packages/client/src/state/create-persisted-store.ts":
      "// @orb-waive persist-partialize-and-total-migrate(persist): probe — the ordinary door must be reachable.\nexport const s = persist(() => ({}), {});\n",
  });
  // Before the collapse this same fixture produced three byte-identical findings, so the marker resolved
  // `over-broad` and suppressed NONE of them — an ordinary policy whose only recourse was editing the
  // factory it objected to.
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// SUCCESSOR PROOF for the retired ARM A: every legacy persist-partialize mustFlag/mustPass example that
// exercised the bare-persist-outside-factories rule still holds — now judged by no-raw-zustand-persist's
// `persistMint` operation, which is IDENTITY-based (readPackageExportOrigin) rather than the legacy's bare
// `getText() === "persist"` text match.
// ---------------------------------------------------------------------------------------------------
const REGISTRY_PROOF = {
  "packages/client/src/state/durable-local.ts": [
    "interface RegisteredStore {",
    "  readonly api: { readonly persist?: { readonly setOptions: (options: unknown) => void } };",
    "  readonly reset: () => void;",
    "}",
    "const registry: RegisteredStore[] = [];",
    "export function registerDurableLocalStore(entry: RegisteredStore): void {",
    "  registry.push(entry);",
    "}",
    "function resetWithoutPersisting(entry: RegisteredStore): void {",
    "  entry.api.persist?.setOptions({});",
    "  entry.reset();",
    "}",
    "export function resetAll(): void {",
    "  for (const entry of registry) {",
    "    resetWithoutPersisting(entry);",
    "  }",
    "}",
    "",
  ].join("\n"),
};

function successorPass(files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    knownPolicies: [noRawZustandPersist],
    policies: [noRawZustandPersist],
    root: ROOT,
    project: projectOf({ ...zustandProof(), ...REGISTRY_PROOF, ...files }),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("no-raw-zustand-persist still flags the retired legacy ARM A example — the successor, not a dropped rule", () => {
  const result = successorPass({
    "packages/client/src/features/x/store.ts": "import { persist } from 'zustand/middleware';\nexport const s = persist(() => ({}), {});\n",
  });
  expect(result.authority.effectiveFindings.length).toBeGreaterThan(0);
});

test("no-raw-zustand-persist still passes the retired legacy ARM A mustPass example — the factory mint", () => {
  const result = successorPass({
    "packages/client/src/features/x/store2.ts":
      "import { createPersistedStore } from '../../state/create-persisted-store.ts';\nexport const s = createPersistedStore('x');\n",
    "packages/client/src/state/create-persisted-store.ts": "export declare function createPersistedStore(name: string): unknown;\n",
  });
  expect(result.authority.effectiveFindings).toEqual([]);
});
