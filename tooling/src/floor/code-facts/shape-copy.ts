// The one shape comparer for copy, placement and respell consumers; they own field discovery, leniency, thresholds and refusal voice.
import type { TypeChecker } from "ts-morph";
import type { AgreementContext, RefuseAssignability } from "./assignability.ts";
import { declarationTypesAgree, fieldTypesAgree, readAssignabilityChecker } from "./assignability.ts";
import type { ShapeCopyCandidate, ShapeCopyComparison, ShapeCopySource, ShapeFieldAgreement, ShapeFieldComparison } from "./shape-copy-contract.ts";
import { storedShapeAgreement } from "./shape-facts.ts";

/** Preserve native lenient field agreement without choosing a copy policy or swallowing a refusal. */
export function createShapeFieldAgreement(
  checker: Pick<TypeChecker, "compilerObject"> | (() => Pick<TypeChecker, "compilerObject">),
  refuse: RefuseAssignability,
): ShapeFieldAgreement {
  let acquired = typeof checker === "function" ? undefined : (readAssignabilityChecker(checker) ?? refuse("primitive-absent", []));
  return (candidate, source, field) => {
    const stored = storedShapeAgreement({ refuse, lenient: true }, { node: candidate, field }, { node: source, field });
    if (stored !== undefined) {
      return stored;
    }
    acquired ??= readAssignabilityChecker(typeof checker === "function" ? checker() : checker);
    const assignability = acquired ?? refuse("primitive-absent", []);
    return fieldTypesAgree({ checker: assignability, refuse, lenient: true }, { decl: candidate, name: field }, { decl: source, name: field });
  };
}

/** Index contract shapes by field name, so a candidate is compared only with shapes it shares a field with. */
export function indexByField(shapes: readonly ShapeCopySource[]): ReadonlyMap<string, readonly ShapeCopySource[]> {
  const index = new Map<string, ShapeCopySource[]>();
  for (const shape of shapes) {
    for (const field of shape.fields) {
      const list = index.get(field) ?? [];
      list.push(shape);
      index.set(field, list);
    }
  }
  return index;
}

/** How many of the candidate's field names each indexed shape carries. */
export function sharedFieldCounts(fields: ReadonlySet<string>, index: ReadonlyMap<string, readonly ShapeCopySource[]>): ReadonlyMap<ShapeCopySource, number> {
  const tally = new Map<ShapeCopySource, number>();
  for (const field of fields) {
    for (const shape of index.get(field) ?? []) {
      tally.set(shape, (tally.get(shape) ?? 0) + 1);
    }
  }
  return tally;
}

/** Left field names the right side carries, in left order; a name-only bound that asks the checker nothing. */
export function sharedFieldNames(left: ReadonlySet<string>, right: ReadonlySet<string>): readonly string[] {
  return [...left].filter((field) => right.has(field));
}

/** Compare one pair: the agreement runs once per shared name, in left order, and never on an unshared name. */
export function compareShapeFields(left: ShapeCopyCandidate, right: ShapeCopyCandidate, agree: ShapeFieldAgreement): ShapeFieldComparison {
  const shared = sharedFieldNames(left.fields, right.fields);
  const agreeing = shared.filter((field) => agree(left.decl, right.decl, field));
  return { shared, agreeing, exact: shared.length === left.fields.size && shared.length === right.fields.size };
}

/** The pair comparison in the copy consumers' report shape. */
export function compareCopySource(candidate: ShapeCopyCandidate, contract: ShapeCopySource, agree: ShapeFieldAgreement): ShapeCopyComparison {
  const { shared, agreeing, exact } = compareShapeFields(candidate, contract, agree);
  return { contract, shared: shared.length, agreeing: agreeing.length, exact };
}

/** Exact identity: the same field names and mutually assignable declarations in every owning native program. */
export function shapesIdentical(context: AgreementContext, left: ShapeCopyCandidate, right: ShapeCopyCandidate): boolean {
  return (
    sharedFieldNames(left.fields, right.fields).length === left.fields.size &&
    left.fields.size === right.fields.size &&
    declarationTypesAgree(context, left.decl, right.decl)
  );
}
