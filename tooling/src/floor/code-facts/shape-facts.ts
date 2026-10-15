import type { Node as MorphNode, SourceFile } from "ts-morph";
import type { AgreementContext } from "./assignability.ts";
import type { InventoryShapeQuery, SemanticInventory, ShapeQuerySide } from "./semantic-inventory-contract.ts";
import { SemanticInventoryError } from "./semantic-inventory-contract.ts";
import { canonicalInventoryPath } from "./semantic-inventory-inputs.ts";
import { inventoryExports, semanticInventoryOf } from "./semantic-inventory-reader.ts";
import type { ShapeField, ShapeFieldMode } from "./shape-fields.ts";
import { resolvedShapeProperties } from "./shape-fields.ts";
import { collectShapeQueries, recordShapeQuery, shapeInventoryOf } from "./shape-inventory-scope.ts";

/** Existing matching algorithms nominate their complete comparison closure before native acquisition. */
export function planShapeQueries(sources: readonly SourceFile[], work: () => void): readonly InventoryShapeQuery[] {
  const source = sources[0];
  const inventory = source === undefined ? undefined : shapeFactsOf(source);
  if (inventory === undefined) {
    throw new Error("native shape catalog context is unavailable");
  }
  return collectShapeQueries(inventory, work);
}

/** Only explicit shape capabilities bind ordinary syntax nodes to a native snapshot. */
export function shapeFactsOf(node: MorphNode): SemanticInventory | undefined {
  return shapeInventoryOf(node.getSourceFile()) ?? semanticInventoryOf(node.getSourceFile());
}

/** Native discovery and stored discovery share exactly the same admission and field order. */
export function readShapeFields(node: MorphNode, mode: ShapeFieldMode): readonly ShapeField[] | undefined {
  const inventory = shapeFactsOf(node);
  return inventory === undefined
    ? resolvedShapeProperties(node, mode)?.map((property) => ({ name: property.getName(), type: property.getTypeAtLocation(node).getText() }))
    : (inventory.shape(node)[mode] ?? undefined);
}

/** Preserve exported declaration multiplicity and aliases without consulting the syntax checker. */
export function shapeExports(source: SourceFile): ReadonlyMap<string, readonly MorphNode[]> {
  const inventory = shapeInventoryOf(source);
  if (inventory === undefined) {
    return inventoryExports(source);
  }
  inventory.assertShapeSource(source);
  return inventory.exports(source);
}

/** Stored strict or lenient agreement; absent capability leaves explicit native callers unchanged. */
export function storedShapeAgreement(
  context: Pick<AgreementContext, "lenient" | "refuse">,
  leftSide: ShapeQuerySide,
  rightSide: ShapeQuerySide,
): boolean | undefined {
  const { node: left, field: leftField } = leftSide;
  const { node: right, field: rightField } = rightSide;
  const leftInventory = shapeFactsOf(left);
  const rightInventory = shapeFactsOf(right);
  if (leftInventory !== undefined && rightInventory !== undefined && leftInventory !== rightInventory) {
    throw new SemanticInventoryError("native shape pair contexts differ");
  }
  const inventory = leftInventory ?? rightInventory;
  if (inventory === undefined) {
    return;
  }
  inventory.shape(left);
  inventory.shape(right);
  const span = (node: MorphNode): InventoryShapeQuery["left"] => ({
    file: canonicalInventoryPath(node.getSourceFile().getFilePath()),
    start: node.getStart(),
    end: node.getEnd(),
    kind: node.getKind(),
  });
  const query: InventoryShapeQuery = { left: span(left), right: span(right), leftField, rightField, projection: "mutual", lenient: context.lenient === true };
  if (recordShapeQuery(inventory, query)) {
    return false;
  }
  const rows = inventory.shapePair(query);
  if (rows.length === 0) {
    return context.refuse("no-shared-program", []);
  }
  const answers = rows.map(({ result }) => {
    if (result.kind === "unavailable") {
      if (result.reason === "primitive-absent") {
        return context.refuse("primitive-absent", []);
      }
      throw new Error("native pair source/span is unavailable");
    }
    return result.kind === "no-comparable" ? false : result.values[0] === true;
  });
  if (new Set(answers).size !== 1) {
    return context.refuse("programs-disagree", answers);
  }
  return answers[0] === true;
}
