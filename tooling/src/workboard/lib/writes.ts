// Field encoding + mutation building — PURE. The quota shape lives here: N field changes become ONE
// aliased mutation request, and Status is written in its OWN request afterwards (the commit marker, so
// an interrupted command is safe to rerun from its source state).
import type { EncodedWrite, Field, FieldChange, FieldValueNode, GraphqlVariables, ItemState } from "../contract/types.ts";
import { PROJECT_NUMBER } from "./vocab.ts";

/** Project field values arrive as a heterogeneous node list; flatten to name → value. */
export function itemFields(nodes: readonly FieldValueNode[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const node of nodes) {
    const name = node.field?.name;
    const value = node.text ?? node.name;
    if (name !== undefined && typeof value === "string") {
      fields[name] = value;
    }
  }
  return fields;
}

/** Field names are compared case-INSENSITIVELY everywhere: the operator types `priority`, the Project
 *  spells `Priority`, and a case mismatch must never look like an absent field. */
export function fieldOf(fields: Readonly<Record<string, string>>, name: string): string | undefined {
  return Object.entries(fields).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
}

export function currentValue(item: ItemState, name: string): string | undefined {
  return fieldOf(item.fields, name);
}

function namedField(fields: readonly Field[], name: string): Field {
  const candidate = fields.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (candidate === undefined) {
    throw new Error(`Project ${PROJECT_NUMBER} has no field named ${name}`);
  }
  return candidate;
}

export function encodeWrite(fields: readonly Field[], change: FieldChange): EncodedWrite {
  const field = namedField(fields, change.name);
  if (change.value === undefined) {
    return { kind: "clear", fieldId: field.id, fieldName: field.name };
  }
  const value = change.value;
  if (field.type === "ProjectV2Field") {
    return { kind: "text", fieldId: field.id, fieldName: field.name, value, local: value };
  }
  if (field.type !== "ProjectV2SingleSelectField") {
    throw new Error(`${field.name} is not a writable text or single-select field`);
  }
  const selected = field.options?.find((choice) => choice.name.toLowerCase() === value.toLowerCase());
  if (selected === undefined) {
    throw new Error(`${field.name} has no option named ${value}`);
  }
  return { kind: "option", fieldId: field.id, fieldName: field.name, value: selected.id, local: selected.name };
}

export function buildFieldMutation(
  operationName: string,
  item: ItemState,
  writes: readonly EncodedWrite[],
): { readonly query: string; readonly variables: GraphqlVariables } {
  const declarations = ["$project: ID!", "$item: ID!"];
  const operations: string[] = [];
  const variables: Record<string, string | number> = { project: item.projectId, item: item.id };
  for (const [index, write] of writes.entries()) {
    const fieldVariable = `f${index}`;
    declarations.push(`$${fieldVariable}: ID!`);
    variables[fieldVariable] = write.fieldId;
    if (write.kind === "clear") {
      operations.push(
        `  m${index}: clearProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $${fieldVariable} }) { clientMutationId }`,
      );
      continue;
    }
    const valueVariable = `v${index}`;
    declarations.push(`$${valueVariable}: String!`);
    variables[valueVariable] = write.value;
    const valueKind = write.kind === "text" ? "text" : "singleSelectOptionId";
    operations.push(
      `  m${index}: updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $${fieldVariable}, value: { ${valueKind}: $${valueVariable} } }) { clientMutationId }`,
    );
  }
  return { query: `mutation ${operationName}(${declarations.join(", ")}) {\n${operations.join("\n")}\n}`, variables };
}

/** Mirror an applied write into the in-memory item so a multi-step command sees its own effects without
 *  a re-read. */
export function applyLocally(item: ItemState, write: EncodedWrite): void {
  const key = Object.keys(item.fields).find((candidate) => candidate.toLowerCase() === write.fieldName.toLowerCase()) ?? write.fieldName;
  if (write.kind === "clear") {
    Reflect.deleteProperty(item.fields, key);
    return;
  }
  item.fields[key] = write.local;
}

/** A write that would not change anything is not sent — this is what makes every transition rerunnable
 *  without burning quota or emitting a no-op mutation. */
export function pendingChange(item: ItemState, change: FieldChange): boolean {
  if (change.value === undefined) {
    return currentValue(item, change.name) !== undefined;
  }
  return currentValue(item, change.name)?.toLowerCase() !== change.value.toLowerCase();
}
