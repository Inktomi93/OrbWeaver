// The structural-copy reader for `contract-structural-copy`: a contract-export field index and the subset
// match. A candidate copies a contract shape when its own data field names are a subset of (or equal to) one
// contract export's and most shared fields agree on their resolved type. Names and types, not assignability:
// two shapes that agree today by accident are the same drift risk as a deliberate copy.
import type { InterfaceDeclaration, Node, TypeAliasDeclaration, TypeLiteralNode } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";

/** A candidate needs this many own data fields; three-field overlaps are mostly coincidence. */
export const MIN_COPY_FIELDS = 4;
/** The share of shared fields whose resolved types must agree. */
export const TYPE_AGREEMENT_FLOOR = 0.8;

export interface ContractFieldShape {
  readonly name: string;
  readonly file: string;
  readonly fields: ReadonlyMap<string, string>;
}

export interface StructuralCopyMatch {
  readonly contract: ContractFieldShape;
  readonly shared: number;
  readonly agreeing: number;
  readonly exact: boolean;
}

const IMPORT_QUALIFIER_RE = /import\("[^"]*"\)\./gu;

/** Type text compared across files: no import qualifiers, no `readonly`, no trailing `| undefined`. */
function normalizeFieldType(text: string): string {
  return text
    .replace(IMPORT_QUALIFIER_RE, "")
    .replace(/\breadonly\s+/gu, "")
    .replace(/\s+/gu, " ")
    .replace(/ \| undefined$/u, "")
    .trim();
}

/** The resolved data fields of one exported contract type, or undefined when it is not a plain object shape. */
export function contractFields(decl: InterfaceDeclaration | TypeAliasDeclaration): ReadonlyMap<string, string> | undefined {
  const type = decl.getType();
  if (type.isUnion() || type.isArray() || type.isTuple() || type.getCallSignatures().length > 0 || !(type.isObject() || type.isIntersection())) {
    return;
  }
  const fields = new Map<string, string>();
  for (const property of type.getProperties()) {
    fields.set(property.getName(), normalizeFieldType(property.getTypeAtLocation(decl).getText(decl)));
  }
  return fields.size >= MIN_COPY_FIELDS ? fields : undefined;
}

/** A candidate's own data fields. Callable members are behaviour, and an indexed-access member already derives
 *  from its owner, so neither counts. Undefined below the field floor. */
export function candidateFields(node: InterfaceDeclaration | TypeLiteralNode): ReadonlyMap<string, string> | undefined {
  const fields = new Map<string, string>();
  for (const member of node.getMembers()) {
    if (!N.isPropertySignature(member)) {
      continue;
    }
    const typeNode = member.getTypeNode();
    if (typeNode !== undefined && (typeNode.isKind(SyntaxKind.FunctionType) || typeNode.isKind(SyntaxKind.IndexedAccessType))) {
      continue;
    }
    fields.set(member.getName(), normalizeFieldType(member.getType().getText(member)));
  }
  return fields.size >= MIN_COPY_FIELDS ? fields : undefined;
}

/** Index contract shapes by field name, so a candidate is compared only with shapes it shares a field with. */
export function indexByField(shapes: readonly ContractFieldShape[]): ReadonlyMap<string, readonly ContractFieldShape[]> {
  const index = new Map<string, ContractFieldShape[]>();
  for (const shape of shapes) {
    for (const field of shape.fields.keys()) {
      const list = index.get(field) ?? [];
      list.push(shape);
      index.set(field, list);
    }
  }
  return index;
}

/** The best contract this candidate copies: every candidate field is a contract field and enough types agree.
 *  Exact field-set equality ranks above a proper subset, then the larger shared set. */
export function bestCopyMatch(fields: ReadonlyMap<string, string>, index: ReadonlyMap<string, readonly ContractFieldShape[]>): StructuralCopyMatch | undefined {
  const tally = new Map<ContractFieldShape, number>();
  for (const field of fields.keys()) {
    for (const shape of index.get(field) ?? []) {
      tally.set(shape, (tally.get(shape) ?? 0) + 1);
    }
  }
  let best: StructuralCopyMatch | undefined;
  for (const [contract, shared] of tally) {
    if (shared !== fields.size) {
      continue;
    }
    const agreeing = [...fields].filter(([field, type]) => contract.fields.get(field) === type).length;
    if (agreeing < TYPE_AGREEMENT_FLOOR * shared) {
      continue;
    }
    const match = { contract, shared, agreeing, exact: shared === contract.fields.size };
    if (best === undefined || rank(match) > rank(best)) {
      best = match;
    }
  }
  return best;
}

function rank(match: StructuralCopyMatch): number {
  const exactWeight = 1_000_000;
  const sharedWeight = 1000;
  return (match.exact ? exactWeight : 0) + match.shared * sharedWeight + match.agreeing;
}

/** True when a type literal is the body of a type alias; the alias is the candidate, not its literal. */
export function isAliasBody(node: Node): boolean {
  return N.isTypeAliasDeclaration(node.getParent());
}
