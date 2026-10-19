// Native Type questions for one ordinary cohort. Every question a consumer can read must be planned: a missing
// selector refuses at read time, so a narrowing here is only sound when it follows a reader's own condition.
import type { CallExpression, Node as MorphNode, Type } from "ts-morph";
import { Node } from "ts-morph";
import { ORDINARY_ARRAY_REMAPS, ORDINARY_NORMALIZER_MEMBER } from "./ordinary-observations-contract.ts";
import { staticMemberAccess } from "./reference-fact.ts";
import type { SchemaColumn, SchemaModel } from "./schema-model-contract.ts";
import type { NativeTypeSelectionPlan, NativeTypeSelector } from "./type-projection-contract.ts";

interface TypeQuestions {
  readonly add: (selector: NativeTypeSelector) => number;
  readonly selectors: NativeTypeSelector[];
  readonly relations: { readonly left: number; readonly right: number }[];
}

function typeQuestions(): TypeQuestions {
  const selectors: NativeTypeSelector[] = [];
  const keys = new Map<string, number>();
  const nodes = new Map<MorphNode, number>();
  const id = (node: MorphNode): number => {
    const known = nodes.get(node);
    if (known !== undefined) {
      return known;
    }
    const value = nodes.size;
    nodes.set(node, value);
    return value;
  };
  return {
    selectors,
    relations: [],
    add: (selector): number => {
      const key = JSON.stringify({
        ...selector,
        base: selector.base.kind === "schema-column" ? selector.base : { ...selector.base, node: id(selector.base.node) },
        steps: selector.steps.map((step) => (step.kind === "property" ? { ...step, at: id(step.at) } : step)),
        displayAt: selector.displayAt === null ? null : id(selector.displayAt),
      });
      const known = keys.get(key);
      if (known !== undefined) {
        return known;
      }
      const index = selectors.length;
      keys.set(key, index);
      selectors.push(selector);
      return index;
    },
  };
}
function nodeTypeQuestions(node: MorphNode, questions: TypeQuestions): void {
  const { add } = questions;
  add({ base: { kind: "node", node }, steps: [], displayAt: null });
  add({ base: { kind: "node", node }, steps: [{ kind: "nonnullable" }], displayAt: null });
  add({ base: { kind: "node", node }, steps: [{ kind: "nonnullable" }, { kind: "array-element-or-self" }], displayAt: null });
  if (Node.isVariableDeclaration(node)) {
    add({ base: { kind: "node", node }, steps: [], displayAt: node });
  }
  if (Node.isObjectLiteralExpression(node)) {
    add({ base: { kind: "contextual", node }, steps: [], displayAt: null });
    add({ base: { kind: "contextual", node }, steps: [{ kind: "nonnullable" }], displayAt: null });
  }
  const member = staticMemberAccess(node);
  if (member !== undefined) {
    const steps = [{ kind: "nonnullable" as const }, { kind: "property" as const, name: member.name, at: member.receiver }];
    add({ base: { kind: "node", node: member.receiver }, steps, displayAt: null });
    add({ base: { kind: "node", node: member.receiver }, steps: [...steps, { kind: "nonnullable" }, { kind: "array-element-or-self" }], displayAt: null });
  }
}

// The column-independent half of a call's column questions, read once per call rather than once per column.
interface ColumnCallSite {
  readonly call: CallExpression;
  // A parse receiver whose `_output` a normalizer proof relates to the column shape.
  readonly parser: MorphNode | undefined;
  // The remap members this call may name; a computed key may still resolve to any of them.
  readonly remaps: readonly string[];
}
function columnCallSite(call: CallExpression): ColumnCallSite {
  const callee = call.getExpression();
  const member = staticMemberAccess(callee);
  const computed = Node.isElementAccessExpression(callee);
  const named = member !== undefined && ORDINARY_ARRAY_REMAPS.has(member.name) ? [member.name] : [];
  return {
    call,
    // A consumer may resolve a computed key the default reader cannot, so an element access may still name `parse`.
    parser:
      member !== undefined && (computed || member.name === ORDINARY_NORMALIZER_MEMBER) && member.receiver.getType().getProperty("_output") !== undefined
        ? member.receiver
        : undefined,
    remaps: computed ? [...ORDINARY_ARRAY_REMAPS] : named,
  };
}

// The array-field proof reads a field at a remap only when that field's value is the remap receiver, so the field's
// Type must carry the remap member in some union arm; an any, unknown or generic field may carry anything.
function carriesMember(type: Type, name: string): boolean {
  return (type.isUnion() ? type.getUnionTypes() : [type]).some(
    (arm) => arm.isAny() || arm.isUnknown() || arm.isTypeParameter() || arm.getApparentType().getProperty(name) !== undefined,
  );
}
interface TypedColumn {
  readonly column: SchemaColumn;
  readonly whole: number;
  readonly fields: readonly string[];
  readonly remapFields: ReadonlyMap<string, readonly string[]>;
}
function typedColumn(column: SchemaColumn, whole: number, override: NonNullable<SchemaColumn["typeOverride"]>): TypedColumn {
  const properties = override.type.getProperties();
  const types = properties.map((property) => ({ name: property.getName(), type: property.getTypeAtLocation(override.node) }));
  return {
    column,
    whole,
    fields: properties.map((property) => property.getName()),
    remapFields: new Map([...ORDINARY_ARRAY_REMAPS].map((remap) => [remap, types.filter(({ type }) => carriesMember(type, remap)).map(({ name }) => name)])),
  };
}

function columnCallQuestions(typed: TypedColumn, site: ColumnCallSite, questions: TypeQuestions): void {
  const { add, relations } = questions;
  const { column, whole, fields, remapFields } = typed;
  const { call, parser, remaps } = site;
  if (parser !== undefined) {
    const output = add({ base: { kind: "node", node: parser }, steps: [{ kind: "property", name: "_output", at: parser }], displayAt: null });
    relations.push({ left: output, right: whole });
    for (const name of fields) {
      const field = add({
        base: { kind: "schema-column", column: column.identity.key },
        steps: [{ kind: "property", name, at: call.getArguments()[0] ?? call }],
        displayAt: null,
      });
      relations.push({ left: output, right: field });
    }
  }
  // Field-at-call questions are read only at array remaps; planning them for every call overflows the selector Map.
  for (const name of new Set(remaps.flatMap((remap) => remapFields.get(remap) ?? []))) {
    const field = add({
      base: { kind: "schema-column", column: column.identity.key },
      steps: [{ kind: "property", name, at: call }, { kind: "nonnullable" }],
      displayAt: null,
    });
    const actual = add({ base: { kind: "node", node: call }, steps: [], displayAt: null });
    relations.push({ left: actual, right: field });
  }
}
function schemaTypeQuestions(schema: SchemaModel | undefined, calls: readonly CallExpression[], questions: TypeQuestions): void {
  const { add } = questions;
  const typed: TypedColumn[] = [];
  for (const table of schema?.tables ?? []) {
    for (const name of ["$inferSelect", "$inferInsert"]) {
      add({ base: { kind: "node", node: table.declaration }, steps: [{ kind: "property", name, at: table.declaration }], displayAt: null });
    }
    for (const column of table.columns) {
      if (column.typeOverride === null) {
        continue;
      }
      const whole = add({ base: { kind: "schema-column", column: column.identity.key }, steps: [], displayAt: null });
      add({
        base: { kind: "schema-column", column: column.identity.key },
        steps: [{ kind: "nonnullable" }, { kind: "array-element-or-self" }],
        displayAt: null,
      });
      typed.push(typedColumn(column, whole, column.typeOverride));
    }
  }
  const sites = typed.length === 0 ? [] : calls.map(columnCallSite);
  for (const column of typed) {
    for (const site of sites) {
      columnCallQuestions(column, site, questions);
    }
  }
}
/** Plan one cohort's native Type questions: node shapes, typed-column shapes, and the column questions its readers ask at calls. */
export function ordinaryTypeSelectionPlan(
  nodes: readonly MorphNode[],
  calls: readonly CallExpression[],
  schema: SchemaModel | undefined,
  extra: readonly NativeTypeSelector[],
): NativeTypeSelectionPlan {
  const questions = typeQuestions();
  for (const node of nodes) {
    nodeTypeQuestions(node, questions);
  }
  schemaTypeQuestions(schema, calls, questions);
  for (const selector of extra) {
    questions.add(selector);
  }
  const seen = new Set<string>();
  return {
    selectors: questions.selectors,
    relations: questions.relations.filter((pair) => {
      const key = `${pair.left}:${pair.right}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    }),
  };
}
