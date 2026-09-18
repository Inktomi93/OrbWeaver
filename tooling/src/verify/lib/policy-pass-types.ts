// Per-run bookkeeping shared by every policy-pass leaf: the mutable PolicyRun/FactRun state, their
// timing accumulators, and the guard/markIncomplete pair that converts a thrown error into a structured
// tool-error status without aborting the pass.
import { performance } from "node:perf_hooks";
import type { SourceFile } from "ts-morph";
import type { GateFact, GateFactHooks } from "../contract/fact.ts";
import type { GateOwnerCompletion, RawGateFinding } from "../contract/gate-authority.ts";
import type { GatePolicy, GatePolicyHooks } from "../contract/policy.ts";
import type {
  GateFactOwnerResult,
  GateFactPhase,
  GateFactToolError,
  PolicyFactValueRegistry,
  PolicyPhase,
  PolicyPopulationReceipt,
  PolicySemanticReceipt,
  PolicyTiming,
  PolicyToolError,
} from "../contract/policy-pass.ts";
import { GATE_FACT_PHASES, POLICY_PHASES } from "../contract/policy-pass.ts";
import type { GateResourceRequest } from "../contract/resource-declaration.ts";

export interface MutableTiming {
  readonly phaseMs: Record<PolicyPhase, number>;
}

export interface MutableFactTiming {
  readonly phaseMs: Record<GateFactPhase, number>;
}

export interface PolicyRun {
  readonly policy: GatePolicy;
  readonly timing: MutableTiming;
  readonly findings: RawGateFinding[];
  population: PolicyPopulationReceipt;
  owner: GateOwnerCompletion;
  files: readonly SourceFile[];
  effectivePathSet: ReadonlySet<string>;
  hooks: GatePolicyHooks | undefined;
  receipts: readonly PolicySemanticReceipt[];
  finishReceipts: (() => readonly PolicySemanticReceipt[]) | undefined;
  unconsumedFacts: (() => readonly string[]) | undefined;
  unconsumedResources: (() => readonly string[]) | undefined;
  unconsumedResourceRequests: (() => readonly string[]) | undefined;
  resourceRequests: readonly GateResourceRequest[];
}

export interface FactRun {
  readonly fact: GateFact;
  readonly timing: MutableFactTiming;
  population: PolicyPopulationReceipt;
  status: "success" | "incomplete";
  error: string | null;
  files: readonly SourceFile[];
  effectivePathSet: ReadonlySet<string>;
  hooks: GateFactHooks<unknown> | undefined;
  receipts: readonly PolicySemanticReceipt[];
  finishReceipts: (() => readonly PolicySemanticReceipt[]) | undefined;
  unconsumedResources: (() => readonly string[]) | undefined;
  unconsumedResourceRequests: (() => readonly string[]) | undefined;
  resourceRequests: readonly GateResourceRequest[];
}

export interface FactControl {
  readonly errors: GateFactToolError[];
  readonly values: PolicyFactValueRegistry;
}

export const EMPTY_POPULATION: PolicyPopulationReceipt = {
  declaredSourcePaths: [],
  declaredResourcePaths: [],
  requestedPaths: null,
  effectiveSourcePaths: [],
  effectiveResourcePaths: [],
};

export function phaseRecord(): Record<PolicyPhase, number> {
  return { population: 0, create: 0, visitFile: 0, visit: 0, evaluate: 0, receipt: 0 };
}

export function factPhaseRecord(): Record<GateFactPhase, number> {
  return { population: 0, create: 0, visitFile: 0, visit: 0, finish: 0, receipt: 0 };
}

function floorMs(value: number): number {
  const precision = 1000;
  return Math.floor(value * precision) / precision;
}

export function ceilMs(value: number): number {
  const precision = 1000;
  return Math.ceil(value * precision) / precision;
}

export function charge<T>(timing: MutableTiming, phase: PolicyPhase, operation: () => T): T {
  const started = performance.now();
  try {
    return operation();
  } finally {
    timing.phaseMs[phase] += performance.now() - started;
  }
}

export function finishTiming(timing: MutableTiming): PolicyTiming {
  const phaseMs = Object.fromEntries(POLICY_PHASES.map((phase) => [phase, floorMs(timing.phaseMs[phase])])) as Record<PolicyPhase, number>;
  return { phaseMs, totalMs: POLICY_PHASES.reduce((sum, phase) => sum + phaseMs[phase], 0) };
}

export function finishFactTiming(timing: MutableFactTiming): GateFactOwnerResult["timing"] {
  const phaseMs = Object.fromEntries(GATE_FACT_PHASES.map((phase) => [phase, floorMs(timing.phaseMs[phase])])) as Record<GateFactPhase, number>;
  return { phaseMs, totalMs: GATE_FACT_PHASES.reduce((sum, phase) => sum + phaseMs[phase], 0) };
}

export function chargeFact<T>(timing: MutableFactTiming, phase: GateFactPhase, operation: () => T): T {
  const started = performance.now();
  try {
    return operation();
  } finally {
    timing.phaseMs[phase] += performance.now() - started;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function markIncomplete(run: PolicyRun, phase: PolicyPhase, error: unknown, errors: PolicyToolError[]): void {
  const message = messageOf(error);
  run.owner = { status: "incomplete", population: "incomplete", reason: `${phase}: ${message}` };
  errors.push({ policyId: run.policy.id, phase, message });
}

export function guard(run: PolicyRun, phase: Exclude<PolicyPhase, "population">, errors: PolicyToolError[], operation: () => void): void {
  if (run.owner.status !== "success") {
    return;
  }
  // @orb-waive caught-failure-ownership(error): gate evaluation guard: markIncomplete converts error to a structured PolicyToolError with phase and message; the gate run reports tool-error status
  try {
    charge(run.timing, phase, operation);
  } catch (error) {
    markIncomplete(run, phase, error, errors);
  }
}

export function markFactIncomplete(run: FactRun, phase: GateFactPhase, error: unknown, control: FactControl): void {
  const message = messageOf(error);
  run.status = "incomplete";
  run.error = `${phase}: ${message}`;
  control.errors.push({ factId: run.fact.id, phase, message });
  control.values.set(run.fact, { status: "failed", message: run.error });
}

export function guardFact(run: FactRun, phase: Exclude<GateFactPhase, "population">, control: FactControl, operation: () => void): void {
  if (run.status !== "success") {
    return;
  }
  // @orb-waive caught-failure-ownership(error): fact evaluation guard: markFactIncomplete converts error to a structured FactToolError with phase and message; the fact run reports tool-error status
  try {
    chargeFact(run.timing, phase, operation);
  } catch (error) {
    markFactIncomplete(run, phase, error, control);
  }
}
