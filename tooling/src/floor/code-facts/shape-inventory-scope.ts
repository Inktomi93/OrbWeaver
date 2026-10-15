import type { SourceFile } from "ts-morph";
import type { InventoryShapeQuery, SemanticInventory } from "./semantic-inventory-contract.ts";
import { shapePairKey } from "./semantic-inventory-contract.ts";

const scopes = new WeakMap<object, SemanticInventory>();
const collectors = new WeakMap<SemanticInventory, Map<string, InventoryShapeQuery>>();

/** Plan the conservative query closure through the consumers' actual comparison paths. */
export function collectShapeQueries(inventory: SemanticInventory, work: () => void): readonly InventoryShapeQuery[] {
  const queries = new Map<string, InventoryShapeQuery>();
  collectors.set(inventory, queries);
  try {
    work();
    return [...queries.values()];
  } finally {
    collectors.delete(inventory);
  }
}

/** Consumers with answer-dependent branches must also visit their conservative planning closure. */
export function collectingShapeQueries(inventory: SemanticInventory | undefined): boolean {
  return inventory !== undefined && collectors.has(inventory);
}

/** Planning records native query intent; false traverses every potential fallback comparison. */
export function recordShapeQuery(inventory: SemanticInventory, query: InventoryShapeQuery): boolean {
  const collector = collectors.get(inventory);
  collector?.set(shapePairKey(query), query);
  return collector !== undefined;
}

/** Only shape readers use this binding; unported readers keep their existing native context. */
export function shapeInventoryOf(source: SourceFile): SemanticInventory | undefined {
  return scopes.get(source);
}

/** Bind a run's syntax carriers without teaching them type or checker methods. */
export function bindShapeInventory(sources: readonly SourceFile[], inventory: SemanticInventory): Disposable {
  const previous = sources.map((source) => [source, scopes.get(source)] as const);
  for (const source of sources) {
    scopes.set(source, inventory);
  }
  return {
    [Symbol.dispose]: (): void => {
      for (const [project, value] of previous) {
        if (value === undefined) {
          // A delivered capability may not become an implicit syntax-checker fallback after its run ends.
          scopes.set(project, inventory);
        } else {
          scopes.set(project, value);
        }
      }
    },
  };
}
