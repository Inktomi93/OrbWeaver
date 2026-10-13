import type { Node as MorphNode } from "ts-morph";
import type { TestFamily } from "../testing/test-kinds.ts";

/** One `@subject` declaration, kept whether or not its path names a real module so a stale header can red. */
export interface DeclaredSubject {
  readonly test: string;
  readonly subject: string;
  readonly family: TestFamily;
}

export interface TestReach {
  /** Product module path to the families of the tests that reach it. */
  readonly reachedBy: ReadonlyMap<string, ReadonlySet<TestFamily>>;
  /** Product module path, then an exported name a test calls, to the families of the tests that call it. Only names asked about. */
  readonly calledBy: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<TestFamily>>>;
  readonly declared: readonly DeclaredSubject[];
  /** Registered test files walked, and distinct (test-side file, product module) references resolved. */
  readonly tests: number;
  readonly references: number;
}

export interface ProductionEdges {
  readonly declarations: readonly MorphNode[];
  readonly next: readonly MorphNode[];
}

export interface InstrumentAffectedPolicyReach {
  readonly policyIds: readonly string[];
  readonly unclassifiableGatePaths: readonly string[];
}

/** A package file a specifier names: its package directory and its path under `src/`. */
export interface PackageFileReach {
  readonly pkg: string;
  readonly path: string;
}

/** Where a relative specifier climbs to when it leaves its legal tree. */
export type RelativeClimb = ({ readonly kind: "package" } & PackageFileReach) | { readonly kind: "testkit"; readonly door: string };

export const MODULE_IMPORT_KINDS = ["import", "dynamic-import"] as const;

export interface ModuleImportHit {
  readonly node: MorphNode;
  readonly kind: (typeof MODULE_IMPORT_KINDS)[number];
}

export interface ModuleImporters {
  readonly hits: readonly ModuleImportHit[];
  readonly targetPaths: ReadonlySet<string>;
}
