// First-class invocation facts: one declared population, one collector, many policy consumers.
import type { SourceFile, TypeChecker } from "ts-morph";
import type { GatePolicyAnalysis, GatePolicyReceipt, GatePolicyVisitor } from "./policy-primitives.ts";
import type { PopulationExpr } from "./population.ts";
import type { GateResourceRequest } from "./resource-declaration.ts";
import type { ResourceHost } from "./resource-host.ts";

export interface GateFactContext {
  readonly files: readonly SourceFile[];
  readonly resourcePaths: readonly string[];
  readonly resources: ResourceHost;
  readonly relativePath: (sourceFile: SourceFile) => string;
  readonly sourceFile: (repoRelativePath: string) => SourceFile;
  readonly checker: () => TypeChecker;
  readonly receipt: (receipt: GatePolicyReceipt) => void;
}

export interface GateFactHooks<Value> {
  readonly visitors?: readonly GatePolicyVisitor[];
  readonly visitFile?: (sourceFile: SourceFile) => void;
  readonly finish: () => Value;
}

export interface GateFact<Value = unknown> {
  readonly id: string;
  readonly population: PopulationExpr;
  readonly analysis: GatePolicyAnalysis;
  readonly resources: readonly GateResourceRequest[];
  readonly create: (context: GateFactContext) => GateFactHooks<Value>;
}

const definedFacts = new WeakSet<object>();
type ExactFact<Fact extends GateFact> = Fact & Record<Exclude<keyof Fact, keyof GateFact>, never>;

/** Brand one direct provider descriptor. Policies import this token; no fact roster is maintained. */
export function defineFact<const Fact extends GateFact>(fact: ExactFact<Fact>): Fact {
  definedFacts.add(fact);
  return fact;
}

export function isDefinedGateFact(value: unknown): value is GateFact {
  return typeof value === "object" && value !== null && definedFacts.has(value);
}

export type GateFactValue<Fact extends GateFact> = Fact extends GateFact<infer Value> ? Value : never;
