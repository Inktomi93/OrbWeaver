// The loader's identity law (docs/law/gate-runtime-standardization.md §1; lib/loader.ts header): every
// corpus module is classified by EXACT contract identity — a branded `defineGate` result is a POLICY, a
// module exporting no `gate` is recorded as unregistered, and ANY other `gate` export REFUSES — and lands in
// exactly one roster row. Each refusal below is a planted control: the corpus is written to a scratch root,
// the loader is the real one, and the branded fixtures import the REAL `contract/policy.ts` by absolute file
// URL so the brand WeakSet is the production one (a copy of the contract would refuse every fixture as
// unbranded — which is the lookalike arm, proven separately).
//
// THE LEGACY ARM IS A REFUSAL NOW, NOT A SECOND CONTRACT (#2176 Phase F, 2026-09-14). The loader used to
// CLASSIFY a validated `GateDescriptor` object as `legacy` and hand it to a second dispatcher; that
// dispatcher (`lib/pass.ts`) and the descriptor contract are deleted, so there is nothing left to run one
// with. The replacement is deliberately LOUD rather than a silent `unregistered` row: recording it quietly
// would drop a gate from the corpus and shorten the run, which is the exact #410 defect the run manifest
// exists to make impossible — so the module refuses at load, naming its retired contract and its own path.
// The three old legacy views (`loadGates`, the legacy `loadGateCorpus`, and the `assertLegacyRosterIsMeasurable`
// vacuum refusal #1983 minted for them) retired with the subject they shrank over.
//
// The real-module arms (the REAL policies loaded and executed through the CLI door in one invocation) live
// in tests/tooling/verify/ops/structure-corpus.suite.int.test.ts; this file proves the loader.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadGateCorpus } from "../../../../tooling/src/verify/lib/loader.ts";
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

/** A minimal VALID legacy descriptor — the shape the retired contract required, kept as the REFUSAL's
 *  subject. It is the only fixture in this file that is not supposed to load. */
function legacySource(name: string, extra = ""): string {
  return (
    `export const gate = { name: ${JSON.stringify(name)}, docRow: "test-owned", status: "active", scopeSafety: "incremental-safe", ` +
    `message: "legacy fixture", visitFile() {}, mustFlag: [{ files: "export const bad = 1;", why: "fixture" }], ` +
    `mustPass: [{ files: "export const good = 1;", why: "fixture" }]${extra} };\n`
  );
}

/** The contract fields as a literal; the caller decides what surrounds them (the brand, a spread, an alias). */
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

test("one corpus, one contract, one roster — and both views derive from it", async ({ repoRoot, scratch }) => {
  writeModules(scratch, {
    "zeta-final.ts": finalSource(repoRoot, "zeta-final"),
    "alpha-final.ts": finalSource(repoRoot, "alpha-final"),
    "mid-nothing.ts": "export const helper = 1;\n",
  });
  const corpus = await loadGateCorpus(scratch);
  expect(corpus.files).toEqual([`${GATES}/alpha-final.ts`, `${GATES}/mid-nothing.ts`, `${GATES}/zeta-final.ts`]);
  expect(corpus.roster).toEqual([
    { path: `${GATES}/alpha-final.ts`, contract: "final", id: "alpha-final" },
    { path: `${GATES}/mid-nothing.ts`, contract: "unregistered", id: null },
    { path: `${GATES}/zeta-final.ts`, contract: "final", id: "zeta-final" },
  ]);
  expect(corpus.gates.map((g) => g.id)).toEqual(["alpha-final", "zeta-final"]);
  expect(corpus.families).toEqual(["alpha-final", "zeta-final"]);
  expect(corpus.unregistered).toEqual([`${GATES}/mid-nothing.ts`]);
  // THE ACCOUNTING the run manifest reconciles: nothing vanishes from the roster.
  expect(corpus.files.length).toBe(corpus.gates.length + corpus.unregistered.length);

  // The planner's view REFUSES a corpus holding anything that is not a policy, naming the first such path
  // in sorted order — the planner cannot run a module that registers nothing and must not pretend it can.
  await expect(loadPolicyCorpus(scratch)).rejects.toThrow(`gate module ${GATES}/mid-nothing.ts must export exactly one \`gate\` created by defineGate`);
});

// The #2176 Phase F arm, in BOTH directions. A legacy-shaped module is not a second contract and it is not
// an unregistered module either: it is a load-time TOOL ERROR whose message names the contract it belongs to
// and the path that carries it. The `unregistered` control beside it is what makes that a real distinction
// rather than a loader that refuses everything it does not brand.
test("a LEGACY descriptor is a refusal naming its retired contract, through every view", async ({ repoRoot, scratch }) => {
  writeModules(scratch, { "alpha-legacy.ts": legacySource("alpha-legacy"), "zeta-final.ts": finalSource(repoRoot, "zeta-final") });
  const refusal = loadGateCorpus(scratch);
  await expect(refusal).rejects.toThrow(/gate module tooling\/src\/verify\/gates\/alpha-legacy\.ts: `gate` is a LEGACY `GateDescriptor` object/u);
  await expect(refusal).rejects.toThrow(/That contract and its dispatcher were deleted at #2176 Phase F/u);
  // …and the SAME refusal reaches the planner's view: there is one loader, so there is one verdict.
  await expect(loadPolicyCorpus(scratch)).rejects.toThrow(/is a LEGACY `GateDescriptor` object/u);
});

// THE CONTROL for the arm above, in its OWN scratch root (a module re-written at the same path would be
// served from node's ESM cache, so a second read would judge the first source). A module with no `gate` at
// all is RECORDED, never refused — the two dispositions are different facts, and a loader that collapsed
// them would make the roster's `unregistered` count a lie.
test("a module exporting no `gate` stays UNREGISTERED rather than joining the legacy refusal", async ({ repoRoot, scratch }) => {
  writeModules(scratch, { "alpha-plain.ts": "export const helper = 1;\n", "zeta-final.ts": finalSource(repoRoot, "zeta-final") });
  const corpus = await loadGateCorpus(scratch);
  expect(corpus.unregistered).toEqual([`${GATES}/alpha-plain.ts`]);
  expect(corpus.gates.map((g) => g.id)).toEqual(["zeta-final"]);
});

test("an UNBRANDED lookalike — the contract shape copied through a spread — refuses loudly with the path and the reason", async ({ repoRoot, scratch }) => {
  // The brand is a WeakSet membership on the object `defineGate` returned; `{ ...x }` is a new object. This is the
  // exact hole "classify by property name" would fall through: the object has `id`/`family`/`authority`/`create`.
  writeModules(scratch, { "spread-copy.ts": `${contractImport(repoRoot)}export const gate = { ...defineGate(${finalFields("spread-copy")} as never) };\n` });
  const refusal = loadGateCorpus(scratch);
  await expect(refusal).rejects.toThrow(
    /gate module tooling\/src\/verify\/gates\/spread-copy\.ts: `gate` has the policy contract's shape but was not created through defineGate/u,
  );
  await expect(refusal).rejects.toThrow(/a spread, clone or copy loses the brand/u);
  // …and NOT the legacy wording: this object carries none of the retired descriptor's own keys.
  await expect(refusal).rejects.not.toThrow(/LEGACY `GateDescriptor`/u);
});

test("a branded descriptor exported under another name is a refusal, never an unregistered module", async ({ repoRoot, scratch }) => {
  writeModules(scratch, { "misnamed.ts": finalSource(repoRoot, "misnamed", "policy") });
  await expect(loadGateCorpus(scratch)).rejects.toThrow(
    /gate module tooling\/src\/verify\/gates\/misnamed\.ts must export exactly one `gate` created by defineGate/u,
  );
});

test("an unbranded `gate` beside a branded sibling export names the sibling in its refusal", async ({ repoRoot, scratch }) => {
  writeModules(scratch, {
    "two-doors.ts": `${contractImport(repoRoot)}export const policy = defineGate(${finalFields("two-doors")} as never);\nexport const gate = { name: "two-doors" };\n`,
  });
  const refusal = loadGateCorpus(scratch);
  await expect(refusal).rejects.toThrow(/`gate` is not a defineGate policy/u);
  await expect(refusal).rejects.toThrow(/exports a branded defineGate descriptor under `policy` — the policy must be exported as `gate`/u);
});

test("a re-export shim under another filename refuses at the filename law, naming the id it re-exported", async ({ repoRoot, scratch }) => {
  // "The same descriptor object reached through two files" — impossible by construction: the shim's basename is
  // not the id. This is the ONLY way two paths could carry one branded object, and it cannot load.
  writeModules(scratch, {
    "real-thing.ts": finalSource(repoRoot, "real-thing"),
    "shim.ts": 'export { gate } from "./real-thing.ts";\n',
  });
  // Uniqueness is judged first (the pinned order), so two paths carrying one id refuse as a DUPLICATE naming both.
  await expect(loadGateCorpus(scratch)).rejects.toThrow(
    /duplicate gate policy id real-thing: tooling\/src\/verify\/gates\/real-thing\.ts, tooling\/src\/verify\/gates\/shim\.ts/u,
  );
});

test("a lone re-export shim whose target is not in the corpus dir refuses at the filename law", async ({ repoRoot, scratch }) => {
  // The target lives OUTSIDE the corpus dir, so there is no duplicate — only the mismatch is left to catch it.
  const target = join(scratch, "elsewhere/real-thing.ts");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, finalSource(repoRoot, "real-thing"));
  writeModules(scratch, { "shim.ts": `export { gate } from ${JSON.stringify(pathToFileURL(target).href)};\n` });
  await expect(loadGateCorpus(scratch)).rejects.toThrow(
    /gate module tooling\/src\/verify\/gates\/shim\.ts: descriptor\.id \(real-thing\) must equal the filename \(shim\)/u,
  );
});

test("a duplicate id across two modules refuses naming both paths, before the filename law", async ({ repoRoot, scratch }) => {
  writeModules(scratch, { "first.ts": finalSource(repoRoot, "same-id"), "second.ts": finalSource(repoRoot, "same-id") });
  await expect(loadGateCorpus(scratch)).rejects.toThrow(
    /duplicate gate policy id same-id: tooling\/src\/verify\/gates\/first\.ts, tooling\/src\/verify\/gates\/second\.ts/u,
  );
});

test("an object that is neither branded nor legacy-shaped refuses with the generic reason and no false attribution", async ({ scratch }) => {
  writeModules(scratch, { "nameless.ts": 'export const gate = { message: "m" };\n' });
  const refusal = loadGateCorpus(scratch);
  await expect(refusal).rejects.toThrow(
    /gate module tooling\/src\/verify\/gates\/nameless\.ts: `gate` is neither a defineGate policy nor any recognised descriptor shape/u,
  );
  // Neither of the two SPECIFIC reasons may be attributed to it — a refusal that guesses is worse than one
  // that says it cannot tell.
  await expect(refusal).rejects.not.toThrow(/LEGACY `GateDescriptor`/u);
  await expect(refusal).rejects.not.toThrow(/policy contract's shape/u);
});

test("a module that throws at import is FATAL and attributes to its path in sorted order", async ({ repoRoot, scratch }) => {
  writeModules(scratch, {
    "a-fine.ts": finalSource(repoRoot, "a-fine"),
    "b-boom.ts": 'throw new Error("planted load failure");\n',
    "c-fine.ts": finalSource(repoRoot, "c-fine"),
  });
  await expect(loadGateCorpus(scratch)).rejects.toThrow(/planted load failure/u);
});

test("probe fixtures in the corpus dir are project inputs, never roster rows", async ({ repoRoot, scratch }) => {
  writeModules(scratch, {
    "only.ts": finalSource(repoRoot, "only"),
    "__g_probe.ts": "export const gate = { name: 1 };\n",
    "__dc_probe.ts": 'throw new Error("never imported");\n',
    "types.d.ts": "export declare const gate: unknown;\n",
  });
  const corpus = await loadGateCorpus(scratch);
  expect(corpus.files).toEqual([`${GATES}/only.ts`]);
  expect(corpus.roster).toHaveLength(1);
});
