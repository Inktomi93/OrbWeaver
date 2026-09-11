// `pnpm check:policy-conformance` → `cli.ts policy-conformance` — THE WHOLE-CORPUS CONFORMANCE STAGE (#1941;
// docs/design/gate-runtime-standardization.md §5 item 3). It loads every gate module through the ONE mixed loader
// and runs every FINAL policy's own `mustFlag`/`mustPass` rows through the production dispatcher
// (`verifyPolicyProofs`), so a converted policy's bite is proven on every `pnpm check` whether or not a committed
// family test imports it — the 21 modules no test imported at the fold are covered by construction. Family tests
// keep the `runPolicyPass`-shaped proofs (identity arms, grant reconciliation, refusal pins) the proof rows cannot
// express; this stage is the bite receipt.
//
// A failure is a TOOL ERROR (exit 2), never a violation: the policy's claim about ITSELF is what broke, so every
// structure verdict that policy took part in is untrustworthy (the house classification, contract/scoped.ts). Zero
// final policies is exit 2 too — a bare zero is "I could not measure", never "every proof holds". Legacy descriptors
// are not this stage's subject; their rows run under `verifyGateProofs` in tests/tooling/gate-conformance.repo.int.test.ts.
import { performance } from "node:perf_hooks";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { loadMixedGateCorpus } from "../lib/loader.ts";
import { verifyPolicyProofs } from "./policy-conformance.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:policy-conformance");

export async function runPolicyConformance(root: string): Promise<number> {
  const corpus = await loadMixedGateCorpus(root);
  if (corpus.final.length === 0) {
    process.stdout.write(`policy-conformance: 0 final policies · 0 proof rows (corpus: ${corpus.files.length} module(s), ${corpus.legacy.length} legacy)\n`);
    process.stderr.write(
      "policy-conformance: TOOL ERROR — the mixed loader resolved ZERO final policies, so this run proved nothing (a bare zero is not a conformance verdict)\n",
    );
    return EXIT.toolError;
  }
  const started = performance.now();
  const failures = verifyPolicyProofs(corpus.final);
  const elapsedMs = Math.round(performance.now() - started);
  const proofs = corpus.final.reduce((n, policy) => n + policy.mustFlag.length + policy.mustPass.length, 0);
  process.stdout.write(
    `policy-conformance: ${corpus.final.length} final policies · ${proofs} proof rows · ${failures.length} failure(s) · ${elapsedMs}ms (corpus: ${corpus.files.length} module(s), ${corpus.legacy.length} legacy proven by gate-conformance)\n`,
  );
  for (const failure of failures) {
    process.stdout.write(`  ✗ ${failure.policyId} · ${failure.arm}[${failure.exampleIndex}] · ${failure.why}\n      ${failure.detail}\n`);
  }
  if (failures.length > 0) {
    process.stdout.write("policy-conformance: a policy's own proof failed — the checker is broken, not the tree (exit 2)\n");
    return EXIT.toolError;
  }
  return EXIT.clean;
}
