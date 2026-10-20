// The one liveness reader: origin-keyed consumption sets for every AST lens, split by consumer class.
// A candidate and each of its consumers key on the origin declaration node, never on a name, so no alias can fork it.
import type { Node, SourceFile } from "ts-morph";
import type { SourceCorpus } from "../compiler/ts-workspace.ts";
import { sourceBindingUsage } from "../compiler/ts-workspace.ts";
import { inventoryConsumerClass } from "./inventory-consumers.ts";
import { fileConsumptions } from "./liveness-consumption.ts";
import type { ConsumptionArm, ImportConsumption, Liveness, LivenessConsumerClass, LivenessOptions, NamespaceSite } from "./liveness-contract.ts";
import { moduleScopeKeyOf, recordDeclarationEdges } from "./liveness-edges.ts";
import { legacyConsumptions } from "./liveness-legacy.ts";
import { collectExternalConsumptions } from "./liveness-witnesses.ts";
import { inventoryDeclarationKey, inventoryStaticTarget } from "./semantic-inventory-reader.ts";

const CLIENT_SRC_PREFIX = "/packages/client/src/";
const SERVER_SRC_PREFIX = "/packages/server/src/";
// Dev-only probes are never shipped: knip's production entries carry no `scripts/**` root either.
const SCRIPTS_PREFIX = "/scripts/";

/** Shipped client application source. */
export function isClientSourcePath(filePath: string): boolean {
  return inventoryConsumerClass(filePath) === "product" && filePath.includes(CLIENT_SRC_PREFIX);
}

/** The consumer class of a file: test identity wins, then application source by package home, then tool or script. */
export function livenessConsumerClass(filePath: string): LivenessConsumerClass {
  const consumer = inventoryConsumerClass(filePath);
  if (consumer === "test") {
    return "test";
  }
  if (consumer === "tooling") {
    return filePath.includes(SCRIPTS_PREFIX) ? "scripts" : "tooling";
  }
  if (filePath.includes(CLIENT_SRC_PREFIX)) {
    return "client";
  }
  return filePath.includes(SERVER_SRC_PREFIX) ? "server" : "package";
}

/** Same-file use: an export used inside its own module is not an orphan. Identity comes from stored bindings, so a
 *  same-spelled shadow or a re-export pass-through does not count, and `export { Inner as Outer }` still matches. */
export function isReferencedInOwnFile(sf: SourceFile, decl: Node): boolean {
  const nativeKeys = sourceBindingUsage(decl.getSourceFile()).lexical(decl);
  const targetKeys = new Set(nativeKeys.length === 0 ? [inventoryDeclarationKey(decl)] : nativeKeys);
  const parent = inventoryDeclarationKey(decl);
  const uses = sourceBindingUsage(sf).parents();
  return [...targetKeys].some((key) => [...(uses.get(key) ?? [])].some((site) => site !== parent));
}

// A member of an `export *` target may be reached through a namespace consumer of the re-exporting barrel.
function starTargetsOf(sf: SourceFile): string[] {
  return sf
    .getExportDeclarations()
    .filter((declaration) => declaration.isNamespaceExport())
    .flatMap((declaration) => inventoryStaticTarget(declaration)?.getFilePath() ?? []);
}

class LivenessSets {
  readonly byClass = new Map<LivenessConsumerClass, Set<string>>();
  readonly arms = new Map<string, Set<ConsumptionArm>>();

  add(consumer: LivenessConsumerClass, key: string, arm: ConsumptionArm): void {
    const bucket = this.byClass.get(consumer) ?? new Set<string>();
    bucket.add(key);
    this.byClass.set(consumer, bucket);
    const arms = this.arms.get(key) ?? new Set<ConsumptionArm>();
    arms.add(arm);
    this.arms.set(key, arms);
  }

  union(...classes: readonly LivenessConsumerClass[]): Set<string> {
    return new Set(classes.flatMap((consumer) => [...(this.byClass.get(consumer) ?? [])]));
  }
}

const NO_EDGES: LivenessOptions = { edges: false };

/** One pass over the corpus. `{ edges: true }` adds the declaration-granular consumer map `chains` reads; the
 *  liveness sets are identical either way. An input it cannot judge throws a refusal. */
export function buildLiveness(project: SourceCorpus, options: LivenessOptions = NO_EDGES): Liveness {
  const sets = new LivenessSets();
  const starTargets = new Set<string>();
  const namespaceSites: NamespaceSite[] = [];
  const consumptions: ImportConsumption[] = [];
  const consumers = new Map<string, Set<string>>();
  for (const sf of project.getSourceFiles()) {
    const consumer = livenessConsumerClass(sf.getFilePath());
    const file = fileConsumptions(sf, project);
    for (const consumption of file.consumptions) {
      sets.add(consumer, consumption.originKey, consumption.arm);
    }
    consumptions.push(...file.consumptions);
    namespaceSites.push(...file.namespaceSites);
    for (const target of starTargetsOf(sf)) {
      starTargets.add(target);
    }
    if (options.edges) {
      recordDeclarationEdges(sf, file.consumptions, consumers);
    }
  }
  const legacy = legacyConsumptions(project);
  for (const fact of legacy) {
    sets.add("test", fact.originKey, "legacy");
    if (options.edges) {
      const roots = consumers.get(fact.originKey) ?? new Set<string>();
      roots.add(moduleScopeKeyOf(fact.file));
      consumers.set(fact.originKey, roots);
    }
  }
  const externalConsumptions = collectExternalConsumptions(project);
  for (const fact of externalConsumptions) {
    sets.add(fact.consumerClass, fact.targetKey, "external");
    if (options.edges) {
      const roots = consumers.get(fact.targetKey) ?? new Set<string>();
      roots.add(fact.rootConsumerKey);
      consumers.set(fact.targetKey, roots);
    }
  }
  const usedProdNonScripts = sets.union("client", "server", "package", "tooling");
  return {
    usedProd: new Set([...usedProdNonScripts, ...sets.union("scripts")]),
    usedProdNonScripts,
    usedClientProd: sets.union("client"),
    usedServerProd: sets.union("server"),
    usedTest: sets.union("test"),
    starTargets,
    arms: sets.arms,
    namespaceSites,
    consumers,
    consumptions,
    legacyConsumptions: legacy,
    externalConsumptions,
  };
}
