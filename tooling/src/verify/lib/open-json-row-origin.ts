// Open-bag attribution remains a verify judgment over canonical native vocabulary and row provenance.
import type { Node as TsNode } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { nativeColumnRow } from "./native-value-projection.ts";
import type { OpenJsonColumn } from "./open-json-vocabulary.ts";
import { isOpenBag } from "./open-json-vocabulary.ts";

type ColumnReader = (node: TsNode) => ReturnType<typeof nativeColumnRow>;
function ownsColumn(declarations: readonly TsNode[], column: OpenJsonColumn): boolean {
  const table = column.node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  return (
    table !== undefined &&
    declarations.some(
      (declaration) => declaration.getSourceFile().getFilePath() === table.getSourceFile().getFilePath() && declaration.getStart() === table.getStart(),
    )
  );
}
/** Native observations do not grant a column: the existing open/name/ambiguity fences remain here. */
export function blobTargets(receiver: TsNode, byProp: ReadonlyMap<string, readonly OpenJsonColumn[]>, read: ColumnReader): readonly OpenJsonColumn[] {
  const observation = read(receiver);
  if (!isOpenBag(observation.vocabulary)) {
    return [];
  }
  const origin = observation.origin;
  const column = origin.column;
  if (column === null) {
    return [];
  }
  const cols = column.property === null ? [...byProp.values()].flat() : (byProp.get(column.property) ?? []);
  if (!cols.some((c) => c.open)) {
    return [];
  }
  if (origin.kind === "refused") {
    throw new Error(origin.message);
  }
  const targets = origin.table === null ? [] : cols.filter((candidate) => ownsColumn(origin.declarations, candidate));
  if (column.ambiguous && targets.some((target) => target.open)) {
    throw new Error(`open-json parity: cannot prove destructured column origin at ${receiver.getSourceFile().getFilePath()}:${receiver.getStartLineNumber()}`);
  }
  return targets;
}
