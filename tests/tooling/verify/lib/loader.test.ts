// The MIXED loader's identity law (docs/design/gate-runtime-standardization.md §1/§5 item 1; lib/loader.ts
// header): every corpus module is classified by EXACT contract identity — a branded `defineGate` result is final,
// a validated `GateDescriptor` is legacy, an unbranded or malformed lookalike REFUSES, a module exporting no
// `gate` is recorded as unregistered — and lands in exactly one roster row. The three views derive from that one
// roster. Each refusal below is a planted control: the corpus is written to a scratch root, the loader is the
// real one, and the branded fixtures import the REAL `contract/policy.ts` by absolute file URL so the brand
// WeakSet is the production one (a copy of the contract would refuse every fixture as unbranded — which is the
// lookalike arm, proven separately).
//
// The real-module arms (one REAL legacy descriptor + REAL final policies loaded and executed through the CLI door
// in one invocation) live in tests/tooling/verify/ops/structure-mixed.int.test.ts; this file proves the loader.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadGateCorpus, loadGates, loadMixedGateCorpus } from "../../../../tooling/src/verify/lib/loader.ts";
import { loadPolicyCorpus } from "../../../../tooling/src/verify/lib/policy-loader.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const GATES = "tooling/src/verify/gates";

function writeModules(root: string, modules: Readonly<Record<string, string>>): void {
  for (const [name, source] of Object.entries(modules)) {
    const path = join(root, GATES, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
  }
}

/** A minimal VALID legacy descriptor: every arm the legacy loader asserts, nothing else. */
function legacySource(name: string, extra = ""): string {
  return (
    `export const gate = { name: ${JSON.stringify(name)}, docRow: "test-owned", status: "active", scopeSafety: "incremental-safe", ` +
    `message: "legacy fixture", visitFile() {}, mustFlag: [{ files: "export const bad = 1;", why: "fixture" }], ` +
    `mustPass: [{ files: "export const good = 1;", why: "fixture" }]${extra} };\n`
  );
}

/** The final-contract fields as a literal; the caller decides what surrounds them (the brand, a spread, an alias). */
function finalFields(id: string): string {
  return `{
    id: ${JSON.stringify(id)},
    family: ${JSON.stringify(id)},
    authority: "hard",
    severity: "error",
    population: "@tooling",
    analysis: "syntax",
    execution: "selected-files",
    facts: [],
    resources: [],
    message: "final fixture",
    create: () => ({ evaluate: () => undefined }),
    mustFlag: [{ mode: "source", files: { "tooling/src/proof.ts": "export const planted = true;\\n" }, why: "founding defect" }],
    mustPass: [{ mode: "source", files: { "tooling/src/proof.ts": "export const clean = true;\\n" }, why: "nearest legal shape" }],
  }`;
}

function contractImport(repoRoot: string): string {
  return `import { defineGate } from ${JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/verify/contract/policy.ts")).href)};\n`;
}

function finalSource(repoRoot: string, id: string, exportName = "gate"): string {
  return `${contractImport(repoRoot)}export const ${exportName} = defineGate(${finalFields(id)} as never);\n`;
}

test("one corpus, two contracts, one roster — and every view derives from it", async ({ repoRoot, scratch }) => {
  writeModules(scratch, {
    "zeta-final.ts": finalSource(repoRoot, "zeta-final"),
    "alpha-legacy.ts": legacySource("alpha-legacy"),
    "mid-nothing.ts": "export const helper = 1;\n",
  });
  const corpus = await loadMixedGateCorpus(scratch);
  expect(corpus.files).toEqual([`${GATES}/alpha-legacy.ts`, `${GATES}/mid-nothing.ts`, `${GATES}/zeta-final.ts`]);
  expect(corpus.roster).toEqual([
    { path: `${GATES}/alpha-legacy.ts`, contract: "legacy", id: "alpha-legacy" },
    { path: `${GATES}/mid-nothing.ts`, contract: "unregistered", id: null },
    { path: `${GATES}/zeta-final.ts`, contract: "final", id: "zeta-final" },
  ]);
  expect(corpus.legacy.map((g) => g.name)).toEqual(["alpha-legacy"]);
  expect(corpus.final.map((g) => g.id)).toEqual(["zeta-final"]);
  expect(corpus.families).toEqual(["zeta-final"]);
  expect(corpus.unregistered).toEqual([`${GATES}/mid-nothing.ts`]);
  // THE ACCOUNTING the run manifest reconciles: nothing vanishes from the roster.
  expect(corpus.files.length).toBe(corpus.legacy.length + corpus.final.length + corpus.unregistered.length);

  // The legacy view keeps its shape and no longer throws on the final module beside it.
  const legacyView = await loadGateCorpus(scratch);
  expect(legacyView.gates.map((g) => g.name)).toEqual(["alpha-legacy"]);
  expect(legacyView.files).toEqual(corpus.files);
  expect(legacyView.unregistered).toEqual(corpus.unregistered);
  expect((await loadGates(scratch)).map((g) => g.name)).toEqual(["alpha-legacy"]);
  // The final-only view REFUSES a mixed corpus by design, naming the first non-final path in sorted order.
  await expect(loadPolicyCorpus(scratch)).rejects.toThrow(`gate module ${GATES}/alpha-legacy.ts must export exactly one \`gate\` created by defineGate`);
});

test("an UNBRANDED lookalike — the final shape copied through a spread — refuses loudly with the path and the reason", async ({ repoRoot, scratch }) => {
  // The brand is a WeakSet membership on the object `defineGate` returned; `{ ...x }` is a new object. This is the
  // exact hole "classify by property name" would fall through: the object has `id`/`family`/`authority`/`create`.
  writeModules(scratch, { "spread-copy.ts": `${contractImport(repoRoot)}export const gate = { ...defineGate(${finalFields("spread-copy")} as never) };\n` });
  const refusal = loadMixedGateCorpus(scratch);
  await expect(refusal).rejects.toThrow(
    /gate module tooling\/src\/verify\/gates\/spread-copy\.ts: `gate` is neither branded by defineGate nor a valid legacy descriptor/u,
  );
  await expect(refusal).rejects.toThrow(/has the final contract's shape but was not created through defineGate/u);
  // The legacy reason rides inside the refusal — the reader learns WHICH contract it also failed.
  await expect(refusal).rejects.toThrow(/descriptor\.name \(undefined\) must equal the filename \(spread-copy\)/u);
});

test("a branded descriptor exported under another name is a refusal, never an unregistered module", async ({ repoRoot, scratch }) => {
  writeModules(scratch, { "misnamed.ts": finalSource(repoRoot, "misnamed", "policy") });
  await expect(loadMixedGateCorpus(scratch)).rejects.toThrow(
    /gate module tooling\/src\/verify\/gates\/misnamed\.ts must export exactly one `gate` created by defineGate/u,
  );
});

test("an invalid legacy `gate` beside a branded sibling export names the sibling in its refusal", async ({ repoRoot, scratch }) => {
  writeModules(scratch, {
    "two-doors.ts": `${contractImport(repoRoot)}export const policy = defineGate(${finalFields("two-doors")} as never);\nexport const gate = { name: "two-doors" };\n`,
  });
  const refusal = loadMixedGateCorpus(scratch);
  await expect(refusal).rejects.toThrow(/`gate` is not a valid legacy descriptor/u);
  await expect(refusal).rejects.toThrow(/exports a branded defineGate descriptor under `policy` — the final policy must be exported as `gate`/u);
});

test("a re-export shim under another filename refuses at the filename law, naming the id it re-exported", async ({ repoRoot, scratch }) => {
  // "The same descriptor object reached through two files" — impossible by construction: the shim's basename is
  // not the id. This is the ONLY way two paths could carry one branded object, and it cannot load.
  writeModules(scratch, {
    "real-thing.ts": finalSource(repoRoot, "real-thing"),
    "shim.ts": 'export { gate } from "./real-thing.ts";\n',
  });
  // Uniqueness is judged first (the pinned order), so two paths carrying one id refuse as a DUPLICATE naming both.
  await expect(loadMixedGateCorpus(scratch)).rejects.toThrow(
    /duplicate gate policy id real-thing: tooling\/src\/verify\/gates\/real-thing\.ts, tooling\/src\/verify\/gates\/shim\.ts/u,
  );
});

test("a lone re-export shim whose target is not in the corpus dir refuses at the filename law", async ({ repoRoot, scratch }) => {
  // The target lives OUTSIDE the corpus dir, so there is no duplicate — only the mismatch is left to catch it.
  const target = join(scratch, "elsewhere/real-thing.ts");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, finalSource(repoRoot, "real-thing"));
  writeModules(scratch, { "shim.ts": `export { gate } from ${JSON.stringify(pathToFileURL(target).href)};\n` });
  await expect(loadMixedGateCorpus(scratch)).rejects.toThrow(
    /gate module tooling\/src\/verify\/gates\/shim\.ts: descriptor\.id \(real-thing\) must equal the filename \(shim\)/u,
  );
});

test("a duplicate final id across two modules refuses naming both paths, before the filename law", async ({ repoRoot, scratch }) => {
  writeModules(scratch, { "first.ts": finalSource(repoRoot, "same-id"), "second.ts": finalSource(repoRoot, "same-id") });
  await expect(loadMixedGateCorpus(scratch)).rejects.toThrow(
    /duplicate gate policy id same-id: tooling\/src\/verify\/gates\/first\.ts, tooling\/src\/verify\/gates\/second\.ts/u,
  );
});

test("a legacy module genuinely missing `name` still refuses with the legacy loader's own words", async ({ scratch }) => {
  writeModules(scratch, {
    "nameless.ts":
      'export const gate = { docRow: "x", status: "active", scopeSafety: "incremental-safe", message: "m", visitFile() {}, mustFlag: [1], mustPass: [1] };\n',
  });
  const refusal = loadMixedGateCorpus(scratch);
  await expect(refusal).rejects.toThrow(/gate tooling\/src\/verify\/gates\/nameless\.ts: descriptor\.name \(undefined\) must equal the filename \(nameless\)/u);
  // …and NOT the lookalike wording: this object carries none of the final contract's keys.
  await expect(refusal).rejects.not.toThrow(/final contract's shape/u);
});

test("a module that throws at import is FATAL and attributes to its path in sorted order", async ({ repoRoot, scratch }) => {
  writeModules(scratch, {
    "a-fine.ts": finalSource(repoRoot, "a-fine"),
    "b-boom.ts": 'throw new Error("planted load failure");\n',
    "c-fine.ts": legacySource("c-fine"),
  });
  await expect(loadMixedGateCorpus(scratch)).rejects.toThrow(/planted load failure/u);
});

test("probe fixtures in the corpus dir are project inputs, never roster rows", async ({ repoRoot, scratch }) => {
  writeModules(scratch, {
    "only.ts": finalSource(repoRoot, "only"),
    "__g_probe.ts": "export const gate = { name: 1 };\n",
    "__dc_probe.ts": 'throw new Error("never imported");\n',
    "types.d.ts": "export declare const gate: unknown;\n",
  });
  const corpus = await loadMixedGateCorpus(scratch);
  expect(corpus.files).toEqual([`${GATES}/only.ts`]);
  expect(corpus.roster).toHaveLength(1);
});
