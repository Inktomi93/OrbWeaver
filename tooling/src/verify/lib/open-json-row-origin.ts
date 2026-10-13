// Open-bag attribution is a verify judgment over canonical native row provenance.
import type { Node as TsNode } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { columnReceiver, narrowedTable, rowOrigins } from "../../floor/code-facts/drizzle-row-origin.ts";
import { tableDeclarations } from "../../floor/code-facts/drizzle-row-type.ts";
import type { OpenJsonColumn } from "./open-json-vocabulary.ts";
import { isOpenBag } from "./open-json-vocabulary.ts";

function ownsColumn(tableRef: TsNode, column: OpenJsonColumn): boolean {
  const schemaTable = column.node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  return (
    schemaTable !== undefined &&
    tableDeclarations(tableRef).some(
      (declaration) =>
        declaration.getSourceFile().getFilePath() === schemaTable.getSourceFile().getFilePath() && declaration.getStart() === schemaTable.getStart(),
    )
  );
}

/** The open columns a blob receiver names, or [] when it is not one. */
export function blobTargets(receiver: TsNode, byProp: ReadonlyMap<string, readonly OpenJsonColumn[]>): readonly OpenJsonColumn[] {
  if (!isOpenBag(receiver.getType())) {
    return [];
  }
  const column = columnReceiver(receiver);
  if (column === undefined) {
    return [];
  }
  const cols = column.property === undefined ? [...byProp.values()].flat() : (byProp.get(column.property) ?? []);
  if (!cols.some((c) => c.open)) {
    return [];
  }
  const table = narrowedTable(column.row, rowOrigins(column.row));
  const targets = table === undefined ? [] : cols.filter((candidate) => ownsColumn(table, candidate));
  if (column.ambiguous && targets.some((target) => target.open)) {
    throw new Error(`open-json parity: cannot prove destructured column origin at ${receiver.getSourceFile().getFilePath()}:${receiver.getStartLineNumber()}`);
  }
  return targets;
}
