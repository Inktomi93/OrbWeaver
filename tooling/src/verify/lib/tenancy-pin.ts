// The PIN half of the tenancy read readers: what a predicate value reads and whether it is a plain caller value
// (Spine-Identity-and-Auth §2b). A value is plain only by its TYPE (a string id, or an array of them).
import type { Node, Type } from "ts-morph";
import { readDrizzleValueSources } from "../../floor/code-facts/drizzle-query.ts";
import type { TypeObservationReader } from "../../floor/code-facts/type-observations-contract.ts";
import type { NativeTypeSelector } from "../../floor/code-facts/type-projection-contract.ts";
import { nodeTypeSelector } from "../../floor/code-facts/type-projection-contract.ts";
import type { SchemaTableIndex, TenancyPinServices, ValueReceiver, ValueSources } from "../contract/tenancy.ts";
import { declaredTableOf, tableRefsOf } from "./tenancy-read.ts";

/** Project canonical native source facts onto the tenancy classification index. */
function valueSourcesOf(value: Node, index: SchemaTableIndex, services?: TenancyPinServices): ValueSources {
  const evidence = services?.sourceEvidence(value);
  const fact = evidence?.source ?? readDrizzleValueSources(value);
  if (fact.kind === "unresolved") {
    return { receivers: [], subselects: [], unresolved: true };
  }
  const receivers = new Map<string, ValueReceiver>();
  for (const member of fact.value.members) {
    const native = evidence?.tables.find((table) => table.node === member.receiver);
    if (evidence !== undefined && native === undefined) {
      throw new Error("native pin receiver table evidence is unavailable");
    }
    const refs = tableRefsOf(member.receiver, index, native?.references);
    if (refs.some((ref) => ref.kind === "table" || ref.kind === "subquery")) {
      const receiver = member.receiver.getText();
      receivers.set(receiver, { receiver, table: declaredTableOf(member.receiver, index, native?.references), node: member.receiver });
    }
  }
  return { receivers: [...receivers.values()], subselects: fact.value.subselects, unresolved: false };
}

function isStringLike(type: Type): boolean {
  if (type.isString() || type.isStringLiteral() || type.isTemplateLiteral()) {
    return true;
  }
  if (type.isIntersection()) {
    return type.getIntersectionTypes().some((member) => isStringLike(member));
  }
  return type.isUnion() && type.getUnionTypes().every((member) => isStringLike(member));
}

/** Is this value a plain caller value by its TYPE: a string or branded string id, or an array of them? A column,
 *  a builder, an untyped parameter and a nullable id are not. */
export function isPlainValue(value: Node, index: SchemaTableIndex, services?: TenancyPinServices): boolean {
  const sources = valueSourcesOf(value, index, services);
  if (sources.unresolved || sources.receivers.length > 0 || sources.subselects.length > 0) {
    return false;
  }
  if (services !== undefined) {
    const readers = services.typeObservations(value);
    const root = nodeTypeSelector(value);
    const element = readers.arrayElement(root).element;
    return observedStringLike(element !== null && readers.select(element) !== null ? element : root, readers, new Map());
  }
  const type = value.getType();
  return isStringLike(arrayElementOf(type) ?? type);
}

function observedStringLike(selector: NativeTypeSelector, readers: TypeObservationReader, answers: Map<object, boolean>): boolean {
  const selected = readers.select(selector);
  if (selected === null) {
    return false;
  }
  const identity = readers.type(selected).key;
  const prior = answers.get(identity);
  if (prior !== undefined) {
    return prior;
  }
  const flags = readers.primitiveFlags(selector);
  if (flags.templateLiteral === undefined) {
    throw new Error("native pin template-literal flag was not captured");
  }
  answers.set(identity, false);
  let value = flags.string || flags.stringLiteral || flags.templateLiteral;
  if (!value) {
    const intersections = readers.intersections(selector);
    value =
      intersections.length > 0
        ? intersections.some((member) => observedStringLike(member, readers, answers))
        : readers.type(selected).unionCount > 0 && readers.unions(selector).every((member) => observedStringLike(member, readers, answers));
  }
  answers.set(identity, value);
  return value;
}

function arrayElementOf(type: Type): Type | undefined {
  if (type.isArray()) {
    return type.getArrayElementType();
  }
  return type.isReadonlyArray() ? type.getTypeArguments()[0] : undefined;
}
