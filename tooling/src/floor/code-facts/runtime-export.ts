import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import { unwrapExpression } from "./expression-value.ts";
import type { InventoryRuntimeExport, InventorySpan } from "./semantic-inventory-contract.ts";

/** Export origins and callability are interpreted in the exporting source's native program. */
export function readRuntimeExports(source: SourceFile, span: (node: MorphNode) => InventorySpan): readonly InventoryRuntimeExport[] {
  const result: InventoryRuntimeExport[] = [];
  for (const [name, declarations] of source.getExportedDeclarations()) {
    for (const declaration of declarations) {
      const initializer = Node.isVariableDeclaration(declaration) ? declaration.getInitializer() : undefined;
      const value = initializer === undefined ? undefined : unwrapExpression(initializer);
      result.push({
        file: span(source).file,
        name,
        declaration: span(declaration),
        callable: declaration.getType().getCallSignatures().length > 0,
        initializer: value === undefined ? null : { kind: value.getKind(), callable: value.getType().getCallSignatures().length > 0 },
      });
    }
  }
  return result;
}
