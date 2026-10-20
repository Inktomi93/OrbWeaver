// Shapes of the one liveness reader: import-graph consumptions, checked external consumers and the sets the lenses read.
import type { Node, SourceFile } from "ts-morph";

const CONSUMPTION_ARMS = ["named", "namespace", "dynamic", "external", "legacy"] as const;
/** How a consumption reached an origin declaration; `namespace` and `dynamic` mark a whole module surface, and
 *  `legacy` is an import from a legacy test, read by syntax because D320 keeps legacy out of semantic extraction. */
export type ConsumptionArm = (typeof CONSUMPTION_ARMS)[number];

const LIVENESS_CONSUMER_CLASSES = ["test", "client", "server", "package", "tooling", "scripts"] as const;
/** Who consumes: tests, application source by package home, tool code, or a dev-only script. Test identity wins. */
export type LivenessConsumerClass = (typeof LIVENESS_CONSUMER_CLASSES)[number];

/** One import-graph consumption: the consuming file, the import declaration or `import()` call, and its arm.
 *  `local` is the binding a static import introduces; an `import()` consumption has none and belongs to its call. */
export interface ImportConsumption {
  readonly originKey: string;
  readonly consumer: SourceFile;
  readonly site: Node;
  readonly local: string | undefined;
  readonly arm: Exclude<ConsumptionArm, "external" | "legacy">;
  readonly typeOnly: boolean;
}

/** One file's consumptions plus the namespace-import sites the swallowed lens judges. */
export interface FileConsumptions {
  readonly consumptions: readonly ImportConsumption[];
  readonly namespaceSites: readonly NamespaceSite[];
}

/** A checked consumer outside the import graph: a package-root tool config or a typed source-reader witness. */
export interface ExternalConsumption {
  readonly targetKey: string;
  readonly consumerSite: string;
  readonly consumerFile: string;
  readonly consumerClass: "tooling";
  readonly kind: "value" | "type";
  readonly rootConsumerKey: string;
}

/** One origin a legacy test imports: the legacy file and the 1-based line of its import. */
export interface LegacyConsumption {
  readonly originKey: string;
  readonly file: string;
  readonly line: number;
}

/** One `import * as ns` site and the export names it exposes per origin key. */
export interface NamespaceSite {
  readonly file: SourceFile;
  readonly alias: string;
  readonly binding: Node;
  readonly exposed: ReadonlyMap<string, readonly string[]>;
}

/** What one `buildLiveness` call produces beyond the sets: `edges` adds the declaration-granular consumer map. */
export interface LivenessOptions {
  readonly edges: boolean;
}

export interface Liveness {
  usedProd: Set<string>;
  /** `usedProd` minus keys reached only from `scripts/**`, which mirrors knip's production-entry scope. */
  usedProdNonScripts: Set<string>;
  usedClientProd: Set<string>;
  usedServerProd: Set<string>;
  usedTest: Set<string>;
  starTargets: Set<string>;
  arms: Map<string, Set<ConsumptionArm>>;
  namespaceSites: NamespaceSite[];
  consumers: Map<string, Set<string>>;
  consumptions: readonly ImportConsumption[];
  legacyConsumptions: readonly LegacyConsumption[];
  externalConsumptions: readonly ExternalConsumption[];
}

/** A liveness input the reader cannot judge supplies no verdict: a malformed, unresolved, ambiguous or detached
 *  checked witness, or a legacy import it cannot place. */
export class LivenessRefusalError extends Error {}
