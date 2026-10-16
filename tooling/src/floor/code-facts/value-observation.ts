// Canonical compiler readers own semantics; this layer projects their returned facts before worker release.
import type { Node } from "ts-morph";
import { columnReceiver, DrizzleRowOriginRefusal, narrowedTable, rowOrigins } from "./drizzle-row-origin.ts";
import { tableDeclarations } from "./drizzle-row-type.ts";
import { readStoredValueShape } from "./stored-value-shape.ts";
import type { StoredValueMember, StoredValueShape } from "./stored-value-shape-contract.ts";
import { captureTypeVocabulary } from "./type-projection.ts";
import type { NativeColumnRowObservation, ProjectedStoredValueMember, ProjectedStoredValueShape } from "./value-observation-contract.ts";

function projectMember(member: StoredValueMember): ProjectedStoredValueMember {
  return member.kind === "spread" ? { ...member, value: projectShape(member.value) } : member;
}
function projectShape(shape: StoredValueShape): ProjectedStoredValueShape {
  const base = { node: shape.node, type: captureTypeVocabulary(shape.type) };
  if (shape.kind === "object") {
    return { ...base, kind: shape.kind, members: shape.members.map(projectMember) };
  }
  if (shape.kind === "binding" || shape.kind === "call" || shape.kind === "choice") {
    return { ...base, kind: shape.kind, values: shape.values.map(projectShape) };
  }
  return { ...base, kind: shape.kind };
}
/** Preserve the full canonical tree; hop limits and vocabulary reduction remain consumer judgments. */
export function captureStoredValueObservation(node: Node): ProjectedStoredValueShape {
  return projectShape(readStoredValueShape(node));
}
/** Preserve native row occurrence/narrowing, legitimate absence and only the canonical semantic refusal. */
export function captureColumnRowObservation(node: Node): NativeColumnRowObservation {
  const column = columnReceiver(node);
  try {
    const table = column === undefined ? undefined : narrowedTable(column.row, rowOrigins(column.row));
    return {
      kind: "resolved",
      column: column === undefined ? null : { ...column, property: column.property ?? null },
      table: table ?? null,
      declarations: table === undefined ? [] : tableDeclarations(table),
    };
  } catch (error) {
    if (!(error instanceof DrizzleRowOriginRefusal)) {
      throw error;
    }
    if (column === undefined) {
      throw error;
    }
    return { kind: "refused", node, message: error.message, column: { ...column, property: column.property ?? null } };
  }
}
