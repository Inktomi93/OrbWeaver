// The planner CLI seam's view of the gate corpus (lib/policy-plan.ts): the policy roster and nothing about
// dispositions. Discovery, import and classification live in ONE place — lib/loader.ts — and this module is
// that loader's narrower view: a corpus holding an UNREGISTERED module refuses here by design (the planner
// cannot run a module that registers nothing and must not pretend it can), naming the first such path in
// sorted order, which is the contract its test pins. The module-level rules themselves are
// lib/policy-module.ts, shared with the loader.
import type { GatePolicyCorpus } from "../contract/gate-corpus.ts";
import type { GatePolicy } from "../contract/policy.ts";
import { loadGateCorpus } from "./loader.ts";

export async function loadPolicyCorpus(root: string): Promise<GatePolicyCorpus> {
  const corpus = await loadGateCorpus(root);
  if (corpus.files.length === 0) {
    throw new Error(`gate policy corpus resolved zero modules under ${root}`);
  }
  const notFinal = corpus.roster.find((row) => row.contract !== "final");
  if (notFinal !== undefined) {
    throw new Error(`gate module ${notFinal.path} must export exactly one \`gate\` created by defineGate`);
  }
  return { gates: corpus.gates, files: corpus.files, families: corpus.families };
}

export async function loadPolicies(root: string): Promise<readonly GatePolicy[]> {
  return (await loadPolicyCorpus(root)).gates;
}
