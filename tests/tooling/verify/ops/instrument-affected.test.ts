// THE AFFECTED-INSTRUMENT SELECTION, pinned (#1967) — driven as a PURE function of a changed set, so
// every arm is asserted against the real checkout without a synthetic git repository.
//
// WHAT EACH ARM DEFENDS, because a selection that quietly selects nothing is the exact defect this stage
// was minted from:
//   · THE GATE-ID REACH is the arm that closes the measured failures. `registry-family.test.ts` sat red
//     for five days from a commit that changed a gate module and never touched a family test; the mirror
//     alone cannot find that file, because a family test lives under its WAVE's name.
//   · THE MIRROR is the other half, for an instrument that is not a gate at all.
//   · AN UNCOMPUTABLE branch answer must NOT read as "nothing changed" — the caller runs the whole
//     battery, and this pin asserts the flag that makes it do so.
//   · A PRODUCT-ONLY change selects nothing, which is what keeps the stage cheap enough to sit below
//     `--full` at all.
import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { selectAffectedInstrumentTests } from "../../../../tooling/src/verify/ops/instrument-affected.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname.replace(/\/$/u, "");
const REAL_CORPUS_LIVENESS_SPEC = "tests/tooling/verify/gates/real-corpus-liveness-family.suite.repo.int.test.ts";
const TOOLING_TSCONFIG = JSON.stringify({
  compilerOptions: {
    allowImportingTsExtensions: true,
    module: "NodeNext",
    moduleResolution: "NodeNext",
    noEmit: true,
    resolvePackageJsonExports: true,
    resolvePackageJsonImports: true,
  },
  include: ["src", "../tests"],
});
const TOOLING_PACKAGE_JSON = JSON.stringify({
  name: "@orb/tooling",
  type: "module",
  exports: { "./*": "./src/*/index.ts", "./_shared/*": "./src/_shared/*.ts" },
  imports: { "#*": "./src/*/index.ts" },
});

test("a changed GATE MODULE reaches the family test that names it, wherever that file lives", () => {
  // `integer-line-boxes`'s proofs live in `integer-line-boxes.int.test.ts` — a name the mirror CAN reach —
  // so this row also proves the two reaches agree rather than fighting.
  const selection = selectAffectedInstrumentTests(ROOT, ["tooling/src/verify/gates/integer-line-boxes.ts"]);
  expect(selection.unknown).toBe(false);
  expect(selection.sources).toEqual(["tooling/src/verify/gates/integer-line-boxes.ts"]);
  expect(selection.specs).toContain("tests/tooling/verify/gates/integer-line-boxes.int.test.ts");
  expect(selection.livenessScope).toEqual({ kind: "policies", policyIds: ["integer-line-boxes"] });
});

test("policy reach narrows to the importing gate and excludes an unrelated gate", async ({ plantedTree }) => {
  const root = await plantedTree({
    "tooling/tsconfig.json": TOOLING_TSCONFIG,
    "tooling/src/verify/lib/shared.ts": "export const shared = true;\n",
    "tooling/src/verify/gates/affected.ts":
      'import { shared } from "../lib/shared.ts";\ndeclare function defineGate(input: { readonly id: string }): unknown;\nexport const gate = defineGate({ id: "affected" });\nvoid shared;\n',
    "tooling/src/verify/gates/unrelated.ts":
      'declare function defineGate(input: { readonly id: string }): unknown;\nexport const gate = defineGate({ id: "unrelated" });\n',
    "tests/tooling/verify/lib/shared.test.ts": 'import "../../../../tooling/src/verify/lib/shared.ts";\n',
    [REAL_CORPUS_LIVENESS_SPEC]: 'import "../../../../tooling/src/verify/gates/affected.ts";\n',
  });

  const selection = selectAffectedInstrumentTests(root, ["tooling/src/verify/lib/shared.ts"]);
  expect(selection.livenessScope).toEqual({ kind: "policies", policyIds: ["affected"] });
});

test("an unrelated changed source cannot widen the roster selected by a policy-affecting source", async ({ plantedTree }) => {
  const root = await plantedTree({
    "tooling/tsconfig.json": TOOLING_TSCONFIG,
    "tooling/src/verify/lib/shared.ts": "export const shared = true;\n",
    "tooling/src/verify/lib/independent.ts": "export const independent = true;\n",
    "tooling/src/verify/gates/affected.ts":
      'import { shared } from "../lib/shared.ts";\ndeclare function defineGate(input: { readonly id: string }): unknown;\nexport const gate = defineGate({ id: "affected" });\nvoid shared;\n',
    "tests/tooling/verify/lib/independent.test.ts": 'import "../../../../tooling/src/verify/lib/independent.ts";\n',
    [REAL_CORPUS_LIVENESS_SPEC]: 'import "../../../../tooling/src/verify/gates/affected.ts";\n',
  });

  const selection = selectAffectedInstrumentTests(root, ["tooling/src/verify/lib/shared.ts", "tooling/src/verify/lib/independent.ts"]);
  expect(selection.specs).toContain("tests/tooling/verify/lib/independent.test.ts");
  expect(selection.livenessScope).toEqual({ kind: "policies", policyIds: ["affected"] });
});

test("shared contract infrastructure keeps the full liveness roster", async ({ plantedTree }) => {
  const root = await plantedTree({
    "tooling/tsconfig.json": TOOLING_TSCONFIG,
    "tooling/src/verify/contract/policy.ts": "export interface Policy { readonly id: string }\n",
    "tooling/src/verify/gates/affected.ts":
      'import type { Policy } from "../contract/policy.ts";\ndeclare function defineGate(input: { readonly id: string }): unknown;\nexport const gate = defineGate({ id: "affected" });\nexport type Seen = Policy;\n',
    "tests/tooling/verify/contract/policy.test.ts": 'import type { Policy } from "../../../../tooling/src/verify/contract/policy.ts";\ntype Seen = Policy;\n',
    [REAL_CORPUS_LIVENESS_SPEC]: 'import "../../../../tooling/src/verify/gates/affected.ts";\n',
  });

  const selection = selectAffectedInstrumentTests(root, ["tooling/src/verify/contract/policy.ts"]);
  expect(selection.livenessScope).toEqual({
    kind: "full",
    reason: "tooling/src/verify/contract/policy.ts is shared liveness harness, registry, or contract infrastructure",
  });
});

test("shared policy-pass runner infrastructure keeps the full liveness roster", async ({ plantedTree }) => {
  const root = await plantedTree({
    "tooling/tsconfig.json": TOOLING_TSCONFIG,
    "tooling/src/verify/lib/policy-pass.ts": "export const pass = true;\n",
    "tooling/src/verify/gates/affected.ts":
      'import { pass } from "../lib/policy-pass.ts";\ndeclare function defineGate(input: { readonly id: string }): unknown;\nexport const gate = defineGate({ id: "affected" });\nvoid pass;\n',
    "tests/tooling/verify/lib/policy-pass.test.ts": 'import "../../../../tooling/src/verify/lib/policy-pass.ts";\n',
    [REAL_CORPUS_LIVENESS_SPEC]: 'import "../../../../tooling/src/verify/gates/affected.ts";\n',
  });

  const selection = selectAffectedInstrumentTests(root, ["tooling/src/verify/lib/policy-pass.ts"]);
  expect(selection.livenessScope).toEqual({
    kind: "full",
    reason: "tooling/src/verify/lib/policy-pass.ts is shared liveness harness, registry, or contract infrastructure",
  });
});

test("a gate whose authored ID disagrees with its basename keeps the full liveness roster", async ({ plantedTree }) => {
  const root = await plantedTree({
    "tooling/tsconfig.json": TOOLING_TSCONFIG,
    "tooling/src/verify/lib/shared.ts": "export const shared = true;\n",
    "tooling/src/verify/gates/wrong-basename.ts":
      'import { shared } from "../lib/shared.ts";\ndeclare function defineGate(input: { readonly id: string }): unknown;\nexport const gate = defineGate({ id: "actual-policy-id" });\nvoid shared;\n',
    "tests/tooling/verify/lib/shared.test.ts": 'import "../../../../tooling/src/verify/lib/shared.ts";\n',
    [REAL_CORPUS_LIVENESS_SPEC]: 'import "../../../../tooling/src/verify/gates/wrong-basename.ts";\n',
  });

  const selection = selectAffectedInstrumentTests(root, ["tooling/src/verify/lib/shared.ts"]);
  expect(selection.livenessScope).toEqual({
    kind: "full",
    reason:
      "tooling/src/verify/lib/shared.ts reaches gate module(s) whose authored ID cannot be proven from their basename: tooling/src/verify/gates/wrong-basename.ts",
  });
});

test("a source with no proven policy reach keeps the full liveness roster", async ({ plantedTree }) => {
  const root = await plantedTree({
    "tooling/tsconfig.json": TOOLING_TSCONFIG,
    "tooling/src/verify/lib/standalone.ts": "export const standalone = true;\n",
    "tests/tooling/verify/lib/standalone.test.ts": 'import "../../../../tooling/src/verify/lib/standalone.ts";\n',
    [REAL_CORPUS_LIVENESS_SPEC]: 'import "../../../../tooling/src/verify/lib/standalone.ts";\n',
  });

  const selection = selectAffectedInstrumentTests(root, ["tooling/src/verify/lib/standalone.ts"]);
  expect(selection.livenessScope).toEqual({ kind: "full", reason: "tooling/src/verify/lib/standalone.ts has no proven policy reach" });
});

// THE ARM THE MIRROR CANNOT DO, and the reason the ID search exists. `freeze-provenance-write-pairing`'s
// proofs live in `freeze-provenance-conversion.suite.test.ts`: prefix-swapping the gate's own path yields
// `tests/tooling/verify/gates/freeze-provenance-write-pairing*.ts`, which does not exist.
test("a gate whose family test is named after its WAVE is still reached — the mirror alone misses it", () => {
  const selection = selectAffectedInstrumentTests(ROOT, ["tooling/src/verify/gates/freeze-provenance-write-pairing.ts"]);
  expect(selection.specs).toContain("tests/tooling/verify/gates/freeze-provenance-conversion.suite.test.ts");
  expect(
    selection.specs.some((spec) => spec.includes("freeze-provenance-write-pairing")),
    "the mirror really does find no file of its own name",
  ).toBe(false);
});

test("a non-gate instrument keeps its shared test mirror when import reach adds consumers", () => {
  const selection = selectAffectedInstrumentTests(ROOT, ["tooling/src/verify/lib/symbol-reference.ts"]);
  expect(selection.specs).toContain("tests/tooling/verify/lib/symbol-reference.test.ts");
  expect(selection.unreachedSources).toEqual([]);
});

test("an importer-only data module reaches the spec that executes it", () => {
  const selection = selectAffectedInstrumentTests(ROOT, ["tooling/src/verify/lib/reviewed-grants-no-to-factory.ts"]);
  expect(selection.specs).toContain("tests/tooling/verify/lib/reviewed-grants.test.ts");
  expect(selection.specs).not.toContain("tests/tooling/verify/ops/instrument-affected.test.ts");
  expect(selection.unreachedSources).toEqual([]);
});

test("transitive imports cross re-export, cycle, tooling-alias and conservative type-only boundaries", async ({ plantedTree }) => {
  const root = await plantedTree({
    "tooling/tsconfig.json": TOOLING_TSCONFIG,
    "tooling/package.json": TOOLING_PACKAGE_JSON,
    "tooling/src/verify/lib/data.ts": "export const data = true;\n",
    "tooling/src/verify/lib/barrel/index.ts": 'export { data } from "../data.ts";\n',
    "tooling/src/verify/lib/cycle-a.ts": 'import "./cycle-b.ts";\n',
    "tooling/src/verify/lib/cycle-b.ts": 'import "./cycle-a.ts";\nexport { data } from "./barrel/index.ts";\n',
    "tooling/src/verify/lib/hash-door.ts": 'export { probe } from "#probe";\n',
    "tooling/src/_shared/alias-data.ts": "export const aliasData = true;\n",
    "tooling/src/_shared/type-data.ts": "export interface TypeData { readonly value: string }\n",
    "tooling/src/probe/index.ts": 'export { probe } from "./probe-data.ts";\n',
    "tooling/src/probe/probe-data.ts": "export const probe = true;\n",
    "tests/tooling/verify/ops/import-reach.test.ts":
      'import "../../../../tooling/src/verify/lib/cycle-a.ts";\nimport "../../../../tooling/src/verify/lib/hash-door.ts";\nimport { aliasData } from "@orb/tooling/_shared/alias-data";\nimport type { TypeData } from "@orb/tooling/_shared/type-data";\ntype Seen = TypeData;\nvoid aliasData;\n',
    "tests/tooling/verify/ops/downstream.test.ts": 'import "./import-reach.test.ts";\n',
  });
  mkdirSync(join(root, "node_modules/@orb"), { recursive: true });
  symlinkSync(join(root, "tooling"), join(root, "node_modules/@orb/tooling"), "junction");

  const selection = selectAffectedInstrumentTests(root, [
    "tooling/src/verify/lib/data.ts",
    "tooling/src/_shared/alias-data.ts",
    "tooling/src/_shared/type-data.ts",
    "tooling/src/probe/probe-data.ts",
  ]);
  expect(selection.specs).toEqual(["tests/tooling/verify/ops/downstream.test.ts", "tests/tooling/verify/ops/import-reach.test.ts"]);
  expect(selection.unreachedSources).toEqual([]);
});

test("a genuinely unreached source stays visible even beside a covered source", async ({ plantedTree }) => {
  const root = await plantedTree({
    "tooling/tsconfig.json": TOOLING_TSCONFIG,
    "tooling/src/verify/lib/covered.ts": "export const covered = true;\n",
    "tooling/src/verify/lib/unreached.ts": "export const unreached = true;\n",
    "tests/tooling/verify/ops/covered.test.ts": 'import "../../../../tooling/src/verify/lib/covered.ts";\n',
  });

  const selection = selectAffectedInstrumentTests(root, ["tooling/src/verify/lib/covered.ts", "tooling/src/verify/lib/unreached.ts"]);
  expect(selection.specs).toEqual(["tests/tooling/verify/ops/covered.test.ts"]);
  expect(selection.unreachedSources).toEqual(["tooling/src/verify/lib/unreached.ts"]);
});

test("a PRODUCT-ONLY change selects nothing without constructing the tooling graph", ({ scratch }) => {
  const selection = selectAffectedInstrumentTests(scratch, ["packages/client/src/lib/message-bubble-class.ts", "docs/law/integer-line-boxes.md"]);
  expect({ sources: selection.sources, specs: selection.specs, unknown: selection.unknown }).toEqual({ sources: [], specs: [], unknown: false });
});

// THE BARE-ZERO ARM. `publishChangedPaths` answers `null` when there is no usable merge base or git failed,
// and `null` must never collapse into the empty set: an uncomputable precondition that reads as "nothing
// changed" is a silent false clean, which is the same class of defect as the gap this stage closes.
test("an UNCOMPUTABLE branch answer is flagged, never read as an empty changed set", () => {
  const selection = selectAffectedInstrumentTests(ROOT, null);
  expect(selection.unknown).toBe(true);
  expect(selection.specs).toEqual([]);
});

test("a DELETED instrument source is dropped — a path that is not there is not a runnable claim", () => {
  const selection = selectAffectedInstrumentTests(ROOT, ["tooling/src/verify/gates/this-policy-was-deleted.ts"]);
  expect(selection.sources).toEqual([]);
});

test("a gates/_proof helper is not a policy, so it takes the mirror reach and not the ID reach", () => {
  const selection = selectAffectedInstrumentTests(ROOT, ["tooling/src/verify/gates/_proof/client-vendors.ts"]);
  // Whatever it reaches, it must not have been read as a policy whose ID is `_proof/client-vendors`.
  expect(selection.specs.every((spec) => !spec.includes("_proof/client-vendors.test"))).toBe(true);
});
