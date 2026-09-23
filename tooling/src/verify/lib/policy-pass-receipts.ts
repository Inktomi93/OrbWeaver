// Receipt reconciliation, finish/evaluate dispatch, and result shaping: the receipt-emptiness law for both
// facts and policies, the finish/evaluate hook drivers, the PolicyOwnerResult/GateFactOwnerResult mappers,
// and the ordinary-waiver carrier acquisition central authority reconciliation reads.
import type { SourceFile } from "ts-morph";
import type { OrdinaryWaiverCarrierRefusal, OrdinaryWaiverCarriers, OrdinaryWaiverSource } from "../contract/ordinary-waiver-source.ts";
import type { GatePolicy } from "../contract/policy.ts";
import type { GateFactOwnerResult, PolicyFactValueRegistry, PolicyOwnerResult, PolicySemanticReceipt, PolicyToolError } from "../contract/policy-pass.ts";
import { POLICY_PASS_REFUSALS } from "../contract/policy-pass.ts";
import { canonicalFindings } from "./policy-pass-resolve.ts";
import type { FactControl, FactRun, PolicyRun } from "./policy-pass-types.ts";
import { finishFactTiming, finishTiming, guard, guardFact, markIncomplete } from "./policy-pass-types.ts";

function receiptFailures(receipt: PolicySemanticReceipt): readonly string[] {
  const count = receipt.kind === "population" ? receipt.members : receipt.resources;
  const label = receipt.kind === "population" ? "members" : "resources";
  const failures: string[] = [];
  if (count === 0) {
    failures.push(`${receipt.kind} ${JSON.stringify(receipt.source)} ${POLICY_PASS_REFUSALS.receiptResolvedZero} ${label}`);
  }
  if (receipt.unresolved > 0) {
    failures.push(
      `${receipt.kind} ${JSON.stringify(receipt.source)} ${POLICY_PASS_REFUSALS.receiptLeftUnresolvedHead} ${receipt.unresolved} ${POLICY_PASS_REFUSALS.receiptLeftUnresolvedTail}`,
    );
  }
  return failures;
}

function factReceiptFailures(run: FactRun): string[] {
  const failures = run.receipts.flatMap(receiptFailures);
  if (run.receipts.length === 0) {
    failures.push(POLICY_PASS_REFUSALS.factNoReceipt);
  }
  if (run.population.effectiveResourcePaths.length > 0 && !run.receipts.some((receipt) => receipt.kind === "resource")) {
    failures.push(POLICY_PASS_REFUSALS.factNoResourceReceipt);
  }
  const unconsumed = run.unconsumedResources?.() ?? [];
  if (unconsumed.length > 0) {
    failures.push(`${POLICY_PASS_REFUSALS.factUnconsumedPaths}: ${unconsumed.join(", ")}`);
  }
  const unconsumedRequests = run.unconsumedResourceRequests?.() ?? [];
  if (unconsumedRequests.length > 0) {
    failures.push(`${POLICY_PASS_REFUSALS.factUnconsumedRequests}: ${unconsumedRequests.join(", ")}`);
  }
  return failures;
}

export function finishFactRuns(runs: readonly FactRun[], control: FactControl): void {
  for (const run of runs) {
    guardFact(run, "finish", control, () => {
      const finish = run.hooks?.finish;
      if (finish === undefined) {
        throw new Error("fact collector has no finish hook");
      }
      control.values.set(run.fact, { status: "ready", value: finish() });
    });
    run.receipts = run.finishReceipts?.() ?? [];
    guardFact(run, "receipt", control, () => {
      const failures = factReceiptFailures(run);
      if (failures.length > 0) {
        throw new Error(`${POLICY_PASS_REFUSALS.factReceiptRefused}: ${failures.join("; ")}`);
      }
    });
  }
}

export function withholdFactDependents(runs: readonly PolicyRun[], errors: PolicyToolError[], values: PolicyFactValueRegistry): void {
  for (const run of runs) {
    if (run.owner.status !== "success") {
      continue;
    }
    const failed = run.policy.facts.find((fact) => values.get(fact)?.status === "failed");
    if (failed !== undefined) {
      const value = values.get(failed);
      const message = value?.status === "failed" ? value.message : POLICY_PASS_REFUSALS.factFailedUnknown;
      markIncomplete(run, "evaluate", new Error(`${POLICY_PASS_REFUSALS.factFailed}: ${failed.id}: ${message}`), errors);
    }
  }
}

/** The CONSUMER half of the receipt law — the twin of `factReceiptFailures`, and the one arm it lacked (#1966).
 *
 *  A fact's emptiness verdict lives with its CONSUMERS, never with the provider (§12.3: a provider that receipts
 *  its census preempts its own designated accuser). That move is only sound while every consumer actually files a
 *  receipt, and until now nothing made it: `policyReceiptFailures` judged the receipts a policy DID file, so a
 *  policy that declared `facts`, consumed one, and receipted nothing rendered a clean verdict over an empty or
 *  holed census. The guarantee held by per-family CONVENTION alone — the shared helpers (`recordReadySchemaFact`,
 *  the registry/tuple receipt writers) — which every NEW consumer is one forgotten `ctx.receipt` from leaving.
 *
 *  PHASE: this runs in the CONSUMER phase (`evaluateRuns` → evaluate, then collect, then judge), so it does not
 *  recreate the provider-side inversion — nothing here is judged before a dependent runs, and the fact's own
 *  `status`/`unresolved` fields still reach the policy that reports them.
 *
 *  WHY THIS IS NOT A LOAD-TIME CONTRACT REQUIREMENT (the arm a reader will reach for next): a receipt is a
 *  RUNTIME call, and its `source` is free text with ZERO fact-id correspondence — a two-fact policy may file
 *  one, two or three receipts under names of its own choosing (`chrome-registry-completeness` declares two facts
 *  and receipts `CHROME_ZONES`/`ChromeEntry`). So "a receipt per DECLARED fact" is not derivable at validation
 *  time OR at run time, and the arm demands at least ONE semantic receipt — the same cardinality
 *  `factReceiptFailures` demands of a provider. Closing that correspondence is a receipt-CONTRACT change, not a
 *  stronger predicate here.
 *
 *  Blast radius when it landed (measured by running the dispatcher over the whole corpus, not by grep):
 *  167 final policies, 35 declaring `facts:`, 35 receipting, 0 newly refused. */
function policyReceiptFailures(run: PolicyRun): string[] {
  const failures = run.receipts.flatMap(receiptFailures);
  const unconsumedFacts = run.unconsumedFacts?.() ?? [];
  if (unconsumedFacts.length > 0) {
    failures.push(`${POLICY_PASS_REFUSALS.factsNotConsumed}: ${unconsumedFacts.join(", ")}`);
  }
  if (run.policy.facts.length > 0 && run.receipts.length === 0) {
    failures.push(POLICY_PASS_REFUSALS.factsNoReceipt);
  }
  if (run.population.effectiveResourcePaths.length > 0 && !run.receipts.some((receipt) => receipt.kind === "resource")) {
    failures.push(POLICY_PASS_REFUSALS.resourcesNoReceipt);
  }
  const unconsumed = run.unconsumedResources?.() ?? [];
  if (unconsumed.length > 0) {
    failures.push(`${POLICY_PASS_REFUSALS.resourcesUnconsumedPaths}: ${unconsumed.join(", ")}`);
  }
  const unconsumedRequests = run.unconsumedResourceRequests?.() ?? [];
  if (unconsumedRequests.length > 0) {
    failures.push(`${POLICY_PASS_REFUSALS.resourcesUnconsumedRequests}: ${unconsumedRequests.join(", ")}`);
  }
  return failures;
}

export function evaluateRuns(runs: readonly PolicyRun[], errors: PolicyToolError[]): void {
  for (const run of runs) {
    if (run.hooks?.evaluate !== undefined) {
      guard(run, "evaluate", errors, () => run.hooks?.evaluate?.());
    }
    run.receipts = run.finishReceipts?.() ?? [];
    guard(run, "receipt", errors, () => {
      const failures = policyReceiptFailures(run);
      if (failures.length > 0) {
        throw new Error(`${POLICY_PASS_REFUSALS.policyReceiptRefused}: ${failures.join("; ")}`);
      }
    });
  }
}

export function ownerResult(run: PolicyRun): PolicyOwnerResult {
  return {
    id: run.policy.id,
    owner: run.owner,
    population: run.population,
    findings: canonicalFindings(run.findings),
    receipts: run.receipts,
    timing: finishTiming(run.timing),
  };
}

export function factResult(run: FactRun): GateFactOwnerResult {
  return {
    id: run.fact.id,
    status: run.status,
    population: run.population,
    receipts: run.receipts,
    timing: finishFactTiming(run.timing),
    error: run.error,
  };
}

interface OrdinaryWaiverAcquisition {
  readonly sources: readonly OrdinaryWaiverSource[];
  readonly refusals: readonly OrdinaryWaiverCarrierRefusal[];
}

/** Acquire the waiver carriers central reconciliation may read, plus the receipt for every refused one.
 *
 *  WHY THE AUTHORITY FILTER: only an `ordinary` policy has a waiver door, so only an ordinary owner's
 *  population can demand a text carrier. Demanding one from every completed owner killed both HARD
 *  `native-config` grant-liveness policies at repository scope (#1947, measured 2026-09-11): that kind's
 *  population is deliberately the whole authored transaction, which can hold a tracked Markdown symlink
 *  that `ops/resource-reader.ts` refuses BY DESIGN — so the pass threw after
 *  ~4s while both policies' isolated proofs read green, and every later policy on the kind inherited it.
 *  The TypeScript half stays unfiltered: those carriers are already-parsed SourceFiles costing no I/O, and
 *  narrowing them would drop the malformed/unknown-policy marker alarms they are the only source of. */
export function ordinaryWaiverAcquisition(
  policies: readonly PolicyOwnerResult[],
  authorityById: ReadonlyMap<string, GatePolicy["authority"]>,
  sourceFiles: ReadonlyMap<string, SourceFile>,
  carriers: (paths: readonly string[]) => OrdinaryWaiverCarriers,
): OrdinaryWaiverAcquisition {
  const sourcePaths = new Set(policies.flatMap(({ population }) => population.effectiveSourcePaths));
  // Owner COMPLETION is deliberately not a condition: acquisition alarms (malformed, unknown-policy,
  // wrong-authority) are not completion-bound, so an incomplete ordinary owner still owes its carriers.
  const demanded = policies.flatMap(({ id, population }) => (authorityById.get(id) === "ordinary" ? population.effectiveResourcePaths : []));
  const acquired = carriers(demanded);
  const sources: OrdinaryWaiverSource[] = [...sourcePaths].toSorted().map((path) => {
    const sourceFile = sourceFiles.get(path);
    if (sourceFile === undefined) {
      throw new Error(`ordinary waiver source population has no SourceFile: ${path}`);
    }
    return { kind: "typescript", path, sourceFile };
  });
  for (const source of acquired.sources) {
    if (sourcePaths.has(source.path)) {
      throw new Error(`ordinary waiver population has ambiguous syntax and resource carriers: ${source.path}`);
    }
    sources.push(source);
  }
  return { sources: Object.freeze(sources), refusals: acquired.refusals };
}
