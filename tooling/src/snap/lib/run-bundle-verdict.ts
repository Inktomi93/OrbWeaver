// Typed arm-state projection for the immutable run index. RESULT pairs are retained only as transcript
// bytes; this module never parses them. Arm enablement and provenance come from the one live registry.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import type { Arm } from "../contract/arm-vocabulary.ts";
import { ARMS } from "../contract/arm-vocabulary.ts";
import type { SnapArmFact, SnapArmState, SnapRunResults } from "../contract/run-facts.ts";
import type { SnapRunArmVerdict, SnapRunArtifact } from "../contract/run-index.ts";
import type { Args } from "../contract/types.ts";
import { ARM_DEFS } from "../ops/arms/registry.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

export function snapRunStateFromExit(exit: number): "passed" | "failed" | "refused" {
  if (exit === EXIT.clean) {
    return "passed";
  }
  return exit === EXIT.violations ? "failed" : "refused";
}

function resultLabel(exit: number): "PASS" | "FAIL" | "REFUSED" {
  if (exit === EXIT.clean) {
    return "PASS";
  }
  return exit === EXIT.violations ? "FAIL" : "REFUSED";
}

export function terminalSnapResultPairs(
  captured: readonly (readonly [string, string])[],
  exit: number,
  error: unknown,
): readonly (readonly [string, string])[] {
  if (captured.length > 0) {
    return captured;
  }
  return [
    ["snap", resultLabel(exit)],
    ["exit", String(exit)],
    ["reason", error === null ? "run completed before structured RESULT evidence" : "run threw before returning an exit code"],
  ];
}

/** WORST-FIRST. `load-suspect` sits between `withheld` and `absent` (#1616): a measured-but-unpromotable
 *  number is MORE informative than "no number at all" and LESS of a verdict than an ordinary pass, so an
 *  arm that was load-suspect on any page reports that rather than the `passed` it must never claim. */
const STATE_RANK: Readonly<Record<SnapArmState, number>> = {
  refused: 0,
  failed: 1,
  withheld: 2,
  "load-suspect": 3,
  absent: 4,
  passed: 5,
  off: 6,
};

function armFacts(results: SnapRunResults, arm: Arm): readonly SnapArmFact[] {
  return results.batches.flatMap((batch) => batch.arms).filter((fact) => fact.arm === arm);
}

function stateOf(facts: readonly SnapArmFact[]): SnapArmState {
  return facts.reduce<SnapArmState>((state, fact) => (STATE_RANK[fact.data.state] < STATE_RANK[state] ? fact.data.state : state), "off");
}

function artifactPaths(facts: readonly SnapArmFact[], inventory: readonly SnapRunArtifact[]): readonly string[] {
  const refs = new Set(facts.flatMap((fact) => fact.artifacts));
  return inventory.filter((artifact) => refs.has(artifact.relativePath)).map((artifact) => artifact.path);
}

function armVerdict(arm: Arm, facts: readonly SnapArmFact[], artifacts: readonly SnapRunArtifact[]): SnapRunArmVerdict {
  const metadata = ARM_DEFS[arm].result;
  const drift = facts.find((fact) => fact.source !== metadata.source || fact.lifetime !== metadata.lifetime || fact.schema !== metadata.schema);
  if (drift !== undefined) {
    throw new Error(`INSTRUMENT ERROR: ${arm} fact provenance/schema disagrees with its ArmDef`);
  }
  if (facts.length === 0) {
    return {
      arm,
      source: metadata.source,
      lifetime: metadata.lifetime,
      state: "refused",
      artifacts: [],
      detail: "enabled arm emitted no typed fact",
    };
  }
  const detail = facts.map((fact) => fact.data.detail).find((value) => value !== null) ?? null;
  return { arm, source: metadata.source, lifetime: metadata.lifetime, state: stateOf(facts), artifacts: artifactPaths(facts, artifacts), detail };
}

export function snapArmVerdicts(opts: Args, results: SnapRunResults, artifacts: readonly SnapRunArtifact[]): readonly SnapRunArmVerdict[] {
  return ARMS.flatMap((arm) => {
    const facts = armFacts(results, arm);
    const enabledByFacts = facts.some((fact) => fact.data.state !== "off");
    return ARM_DEFS[arm].result.enabled(opts) || enabledByFacts ? [armVerdict(arm, facts, artifacts)] : [];
  });
}
