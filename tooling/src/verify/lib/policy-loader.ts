// The FINAL-ONLY view of the gate corpus, for the planner CLI seam (lib/policy-plan.ts) that runs policies and
// nothing else. Discovery, import and classification live in ONE place — lib/loader.ts, the mixed loader — and
// this module is that loader's final view: a corpus holding any legacy descriptor refuses here by design (the
// planner cannot run a descriptor and must not pretend it can), naming the first legacy path in sorted order —
// which is the contract its test pins. The module-level final rules themselves are lib/policy-module.ts, shared
// with the mixed loader.
import type { GatePolicyCorpus } from "../contract/gate-corpus.ts";
import type { GatePolicy } from "../contract/policy.ts";
import { loadMixedGateCorpus } from "./loader.ts";

export async function loadPolicyCorpus(root: string): Promise<GatePolicyCorpus> {
  const corpus = await loadMixedGateCorpus(root);
  if (corpus.files.length === 0) {
    throw new Error(`gate policy corpus resolved zero modules under ${root}`);
  }
  const notFinal = corpus.roster.find((row) => row.contract !== "final");
  if (notFinal !== undefined) {
    throw new Error(`gate module ${notFinal.path} must export exactly one \`gate\` created by defineGate`);
  }
  return { gates: corpus.final, files: corpus.files, families: corpus.families };
}

export async function loadPolicies(root: string): Promise<readonly GatePolicy[]> {
  return (await loadPolicyCorpus(root)).gates;
}
