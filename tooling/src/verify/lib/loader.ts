// THE loader IS the registry, for BOTH descriptor contracts (docs/design/gate-runtime-standardization.md §1/§5):
// one discovery of `tooling/src/verify/gates/*.ts`, one sequential import loop, one classification by EXACT
// contract identity, three views. Deterministic order: sorted repo-relative path.
//
// Classification of one module, in this order — never by filename, never by a property name, never "try the
// legacy loader and catch":
//   1. `mod.gate` is BRANDED (`isDefinedGatePolicy`, the WeakSet `defineGate` mints) → FINAL. The final rules then
//      apply unchanged (lib/policy-module.ts): exactly one branded export and it is `gate`, the descriptor validates,
//      `id === basename`, ids unique, singleton families equal their id.
//   2. `mod.gate` is an unbranded object → it must validate as a LEGACY `GateDescriptor` (fail-closed: the
//      metadata arm, the behavior arm, the self-proof arm). A legacy module genuinely missing `name` still refuses
//      here, loudly, with its path.
//   3. an unbranded object that is NOT a valid legacy descriptor → TOOL ERROR at load. When it carries the final
//      contract's required keys the message says so (a spread/clone lost the brand) — wording only, never dispatch.
//   4. no `gate` but a branded export under another name → TOOL ERROR (the final rule "exactly one … named `gate`").
//   5. no `gate`, nothing branded → UNREGISTERED: recorded on the roster (#410), reconciled by the run manifest.
//   6. an import-time throw stays FATAL and attributes to its file in sorted order.
// A duplicate id/name refuses (uniqueness is judged before `id === basename`, the final loader's pinned order);
// "the same descriptor object reached through two files" is impossible by construction (both ids equal their
// basenames), so no identity set is kept — a re-export shim refuses as a duplicate or a filename mismatch, naming the id.
import { globSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { GateDescriptor } from "../contract/gate.ts";
import type { GateCorpus, GateRosterEntry, MixedGateCorpus } from "../contract/gate-corpus.ts";
import type { GatePolicy } from "../contract/policy.ts";
import { isDefinedGatePolicy } from "../contract/policy.ts";
import type { LoadedPolicy } from "./policy-module.ts";
import {
  assertPolicyFilenameId,
  assertPolicyModuleExport,
  assertUniquePolicyIds,
  brandedExportsOf,
  looksFinalShaped,
  policyFamilyNames,
} from "./policy-module.ts";

const D_TS_RE = /\.d\.ts$/u;
const BASENAME_RE = /([^/]+)\.ts$/u;
// `check-gates` / conformance fixtures must live inside the real gate directory so corpus-scoped gates can
// inspect them. They are source inputs to those gates, never gate modules themselves. Keeping the reserved
// probe names out of descriptor reconciliation preserves both halves: the project still scans the fixture,
// while run-manifest does not mistake a deliberately descriptorless proof file for an unwired real gate.
const PROBE_GATE_FILE_RE = /(^|\/)__(?:g|dc)_/u;

function nonEmptyArray(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}

/** The metadata arm of the legacy shape check (name/docRow/status/scopeSafety). */
function assertMeta(g: Record<string, unknown>, rel: string): void {
  const base = BASENAME_RE.exec(rel)?.[1];
  if (typeof g["name"] !== "string" || g["name"] !== base) {
    throw new Error(`gate ${rel}: descriptor.name (${String(g["name"])}) must equal the filename (${base})`);
  }
  if (typeof g["docRow"] !== "string" || g["docRow"].length === 0) {
    throw new Error(`gate ${rel}: descriptor.docRow (the enforcement-doc citation) is required`);
  }
  if (typeof g["message"] !== "string" || g["message"].length === 0) {
    throw new Error(`gate ${rel}: descriptor.message (the reason, printed once per group) is required`);
  }
  if (g["status"] !== "active" && g["status"] !== "dormant") {
    throw new Error(`gate ${rel}: descriptor.status must be "active" | "dormant"`);
  }
  if (g["scopeSafety"] !== "incremental-safe" && g["scopeSafety"] !== "whole-project") {
    throw new Error(`gate ${rel}: descriptor.scopeSafety must be "incremental-safe" | "whole-project"`);
  }
}

/** The behavior + self-proof arm of the legacy shape check (a visit/visitFile/run family + mustFlag/mustPass). */
function assertBehavior(g: Record<string, unknown>, rel: string): void {
  const hasVisit = typeof g["visit"] === "function";
  if (hasVisit && !nonEmptyArray(g["kinds"])) {
    throw new Error(`gate ${rel}: a \`visit\` gate must declare a non-empty \`kinds\` subscription`);
  }
  if (!hasVisit && typeof g["run"] !== "function" && typeof g["visitFile"] !== "function") {
    throw new Error(`gate ${rel}: a descriptor must have at least one of visit / visitFile / run`);
  }
  if (!nonEmptyArray(g["mustFlag"])) {
    throw new Error(`gate ${rel}: descriptor.mustFlag needs ≥1 self-proof example (§1.6)`);
  }
  if (!nonEmptyArray(g["mustPass"])) {
    throw new Error(`gate ${rel}: descriptor.mustPass needs ≥1 false-positive-guard example (§1.6)`);
  }
}

/** Runtime shape check for a LEGACY descriptor (tsx runs type-stripped, so this is the enforcement that fires). */
function assertDescriptor(gate: unknown, rel: string): asserts gate is GateDescriptor {
  if (gate === undefined || gate === null || typeof gate !== "object") {
    throw new Error(`gate module ${rel} does not export a \`gate\` descriptor object`);
  }
  const g = gate as Record<string, unknown>;
  assertMeta(g, rel);
  assertBehavior(g, rel);
}

/** Rule 2/3: an unbranded `gate` object is a legacy descriptor or a refusal — never a silent skip. */
function assertLegacyOrRefuse(gate: unknown, rel: string, module: Readonly<Record<string, unknown>>): asserts gate is GateDescriptor {
  try {
    assertDescriptor(gate, rel);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const branded = brandedExportsOf(module);
    if (branded.length > 0) {
      throw new Error(
        `gate module ${rel}: \`gate\` is not a valid legacy descriptor (${reason}) and the module exports a branded defineGate descriptor under ${branded.map(([name]) => `\`${name}\``).join(", ")} — the final policy must be exported as \`gate\``,
        { cause: error },
      );
    }
    if (looksFinalShaped(gate)) {
      throw new Error(
        `gate module ${rel}: \`gate\` is neither branded by defineGate nor a valid legacy descriptor (${reason}) — it has the final contract's shape but was not created through defineGate (a spread, clone or copy loses the brand)`,
        { cause: error },
      );
    }
    throw error;
  }
}

type Classified =
  | { readonly kind: "final"; readonly gate: GatePolicy }
  | { readonly kind: "legacy"; readonly gate: GateDescriptor }
  | { readonly kind: "unregistered" };

/** ONE module, ONE verdict. The order of the checks is the identity law in the header. */
function classify(module: Readonly<Record<string, unknown>>, rel: string): Classified {
  const gate = module["gate"];
  if (isDefinedGatePolicy(gate)) {
    // `id === basename` is asserted AFTER the loop, behind id uniqueness (the final loader's pinned order): two
    // modules sharing one id refuse as a duplicate first, naming both paths.
    return { kind: "final", gate: assertPolicyModuleExport(module, rel) };
  }
  if (gate !== undefined) {
    assertLegacyOrRefuse(gate, rel, module);
    return { kind: "legacy", gate };
  }
  if (brandedExportsOf(module).length > 0) {
    // Rule 4 — the final loader's own wording: a branded descriptor exists but is not the `gate` export.
    assertPolicyModuleExport(module, rel);
  }
  return { kind: "unregistered" };
}

function corpusFiles(root: string): readonly string[] {
  return globSync("tooling/src/verify/gates/*.ts", { cwd: root })
    .filter((f) => !(D_TS_RE.test(f) || PROBE_GATE_FILE_RE.test(f)))
    .sort();
}

/** Discover and classify every corpus module, fail-closed, with the roster every view derives from. */
export async function loadMixedGateCorpus(root: string): Promise<MixedGateCorpus> {
  const files = corpusFiles(root);
  const legacy: GateDescriptor[] = [];
  const loaded: LoadedPolicy[] = [];
  const unregistered: string[] = [];
  const roster: GateRosterEntry[] = [];
  for (const rel of files) {
    // Sequential-deterministic: a load/parse failure must attribute to its file, in sorted order — never
    // a Promise.all race that loses which module threw.
    const module = (await import(pathToFileURL(`${root}/${rel}`).href)) as Record<string, unknown>;
    const verdict = classify(module, rel);
    if (verdict.kind === "unregistered") {
      unregistered.push(rel); // not yet ported to either contract — RECORDED, not swallowed (#410)
      roster.push({ path: rel, contract: "unregistered", id: null });
      continue;
    }
    if (verdict.kind === "legacy") {
      // No duplicate-name set on this side either: `assertMeta` requires `name === basename`, and two modules in
      // one directory cannot share a basename, so a duplicate legacy name is unreachable by construction.
      legacy.push(verdict.gate);
    } else {
      loaded.push({ gate: verdict.gate, rel });
    }
    roster.push({ path: rel, contract: verdict.kind, id: verdict.kind === "legacy" ? verdict.gate.name : verdict.gate.id });
  }
  assertUniquePolicyIds(loaded);
  for (const { gate, rel } of loaded) {
    assertPolicyFilenameId(gate, rel);
  }
  const final = loaded.map(({ gate }) => gate);
  return { files, legacy, final, families: policyFamilyNames(final), unregistered, roster };
}

/** The LEGACY view: every caller that consumes descriptors keeps this shape and no longer throws on a final module. */
export async function loadGateCorpus(root: string): Promise<GateCorpus> {
  const corpus = await loadMixedGateCorpus(root);
  return { gates: corpus.legacy, files: corpus.files, unregistered: corpus.unregistered };
}

/** The legacy descriptor list alone — conformance, the scoped run, the suites. */
export async function loadGates(root: string): Promise<readonly GateDescriptor[]> {
  return (await loadMixedGateCorpus(root)).legacy;
}
