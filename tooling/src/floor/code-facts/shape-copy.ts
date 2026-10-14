// Field overlap facts shared by placement and copy policies; consumers own admission, thresholds and refusal policy.
import type { TypeChecker } from "ts-morph";
import type { RefuseAssignability } from "./assignability.ts";
import { fieldTypesAgree, readAssignabilityChecker } from "./assignability.ts";
import type { ShapeCopyCandidate, ShapeCopySource, ShapeFieldAgreement } from "./shape-copy-contract.ts";

/** Preserve native lenient field agreement without choosing a copy policy or swallowing a refusal. */
export function createShapeFieldAgreement(checker: Pick<TypeChecker, "compilerObject">, refuse: RefuseAssignability): ShapeFieldAgreement {
  const assignability = readAssignabilityChecker(checker);
  if (assignability === undefined) {
    return refuse("primitive-absent", []);
  }
  const context = { checker: assignability, refuse, lenient: true };
  return (candidate, source, field) => fieldTypesAgree(context, { decl: candidate, name: field }, { decl: source, name: field });
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

/** How many of the candidate's fields the contract carries with the same type. */
export function agreeingCount(candidate: ShapeCopyCandidate, contract: ShapeCopySource, agree: ShapeFieldAgreement): number {
  return [...candidate.fields].filter((field) => contract.fields.has(field) && agree(candidate.decl, contract.decl, field)).length;
}
