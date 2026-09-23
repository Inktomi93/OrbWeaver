// THE loader IS the registry (docs/law/gate-runtime-standardization.md §1/§5): one discovery of
// `tooling/src/verify/gates/*.ts`, one sequential import loop, one classification by EXACT contract
// identity. Deterministic order: sorted repo-relative path.
//
// ONE CONTRACT SINCE #2176 PHASE F (2026-09-14). The mixed era is over — the legacy `GateDescriptor`
// dispatcher (`lib/pass.ts`) and its descriptor shape check were deleted, so a module that exports an
// unbranded `gate` object is no longer a second contract to run. It is a TOOL ERROR at load, named as such
// and attributed to its file. That is deliberate and it is the LOUD arm: silently skipping a legacy-shaped
// module would drop a gate from the corpus and shorten the run, which is the exact #410 defect the run
// manifest exists to make impossible.
//
// Classification of one module, in this order — never by filename, never by a property name:
//   1. `mod.gate` is BRANDED (`isDefinedGatePolicy`, the WeakSet `defineGate` mints) → a POLICY. The module
//      rules then apply unchanged (lib/policy-module.ts): exactly one branded export and it is `gate`, the
//      descriptor validates, `id === basename`, ids unique, singleton families equal their id.
//   2. `mod.gate` exists but is NOT branded → TOOL ERROR. When it carries the final contract's required keys
//      the message says so (a spread/clone lost the brand); when it carries the retired legacy descriptor's
//      keys the message says THAT — wording only, never dispatch.
//   3. no `gate` but a branded export under another name → TOOL ERROR (the rule "exactly one … named `gate`").
//   4. no `gate`, nothing branded → UNREGISTERED: recorded on the roster (#410), reconciled by the run manifest.
//   5. an import-time throw stays FATAL and attributes to its file in sorted order.
// A duplicate id refuses (uniqueness is judged before `id === basename`, the pinned order); "the same
// descriptor object reached through two files" is impossible by construction (both ids equal their
// basenames), so no identity set is kept — a re-export shim refuses as a duplicate or a filename mismatch.
import { globSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { GateCorpus, GateRosterEntry } from "../contract/gate-corpus.ts";
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
// Conformance fixtures must live inside the real gate directory so corpus-scoped policies can inspect them.
// They are source inputs to those policies, never gate modules themselves. Keeping the reserved probe names
// out of reconciliation preserves both halves: the project still scans the fixture, while run-manifest does
// not mistake a deliberately descriptorless proof file for an unwired real gate.
const PROBE_GATE_FILE_RE = /(^|\/)__(?:g|dc)_/u;

/** The retired legacy descriptor's OWN required keys — the three the loader's deleted `assertMeta` demanded
 *  and that no other shape in this tree carries together. Kept as a RECOGNIZER so a module still holding one
 *  gets the sentence naming its contract as retired instead of the generic "not branded" line. It never
 *  admits anything: every arm below throws. */
const LEGACY_DESCRIPTOR_KEYS = ["docRow", "status", "scopeSafety"] as const;

function looksLegacyShaped(gate: unknown): boolean {
  if (gate === null || typeof gate !== "object") {
    return false;
  }
  const g = gate as Record<string, unknown>;
  return LEGACY_DESCRIPTOR_KEYS.every((key) => g[key] !== undefined);
}

/** Rule 2/3: an `gate` export that is not branded is a refusal, never a silent skip and never a second
 *  contract. The three messages differ only in WHY the brand is missing. */
function refuseUnbranded(gate: unknown, rel: string, module: Readonly<Record<string, unknown>>): never {
  const branded = brandedExportsOf(module);
  if (branded.length > 0) {
    throw new Error(
      `gate module ${rel}: \`gate\` is not a defineGate policy and the module exports a branded defineGate descriptor under ${branded
        .map(([name]) => `\`${name}\``)
        .join(", ")} — the policy must be exported as \`gate\``,
    );
  }
  if (looksLegacyShaped(gate)) {
    throw new Error(
      `gate module ${rel}: \`gate\` is a LEGACY \`GateDescriptor\` object. That contract and its dispatcher were deleted at #2176 Phase F — ` +
        "there is no runtime left to run it, so this module would be invisible rather than skipped. Convert it with `defineGate` " +
        "(tooling/src/verify/gates/GATE-AUTHORING.md).",
    );
  }
  if (looksFinalShaped(gate)) {
    throw new Error(
      `gate module ${rel}: \`gate\` has the policy contract's shape but was not created through defineGate (a spread, clone or copy loses the brand)`,
    );
  }
  throw new Error(`gate module ${rel}: \`gate\` is neither a defineGate policy nor any recognised descriptor shape`);
}

type Classified = { readonly kind: "final"; readonly gate: GatePolicy } | { readonly kind: "unregistered" };

/** ONE module, ONE verdict. The order of the checks is the identity law in the header. */
function classify(module: Readonly<Record<string, unknown>>, rel: string): Classified {
  const gate = module["gate"];
  if (isDefinedGatePolicy(gate)) {
    // `id === basename` is asserted AFTER the loop, behind id uniqueness (the pinned order): two modules
    // sharing one id refuse as a duplicate first, naming both paths.
    return { kind: "final", gate: assertPolicyModuleExport(module, rel) };
  }
  if (gate !== undefined) {
    refuseUnbranded(gate, rel, module);
  }
  if (brandedExportsOf(module).length > 0) {
    // Rule 3 — the loader's own wording: a branded descriptor exists but is not the `gate` export.
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
export async function loadGateCorpus(root: string): Promise<GateCorpus> {
  const files = corpusFiles(root);
  const loaded: LoadedPolicy[] = [];
  const unregistered: string[] = [];
  const roster: GateRosterEntry[] = [];
  for (const rel of files) {
    // Sequential-deterministic: a load/parse failure must attribute to its file, in sorted order — never
    // a Promise.all race that loses which module threw.
    const module = (await import(pathToFileURL(`${root}/${rel}`).href)) as Record<string, unknown>;
    const verdict = classify(module, rel);
    if (verdict.kind === "unregistered") {
      unregistered.push(rel); // not ported to the contract — RECORDED, not swallowed (#410)
      roster.push({ path: rel, contract: "unregistered", id: null });
      continue;
    }
    loaded.push({ gate: verdict.gate, rel });
    roster.push({ path: rel, contract: "final", id: verdict.gate.id });
  }
  assertUniquePolicyIds(loaded);
  for (const { gate, rel } of loaded) {
    assertPolicyFilenameId(gate, rel);
  }
  const gates = loaded.map(({ gate }) => gate);
  return { files, gates, families: policyFamilyNames(gates), unregistered, roster };
}
