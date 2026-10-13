// The structural-copy reader for `contract-structural-copy` and `test-hand-shape`: a contract-export field-name index
// and the subset match. A candidate copies a contract shape when its own data field names are a subset of (or equal
// to) one contract export's and most shared fields agree on their TYPE. The checker judges agreement, never type
// text, in `floor/code-facts/assignability.ts`: two shapes that agree today by accident are the same drift risk as a
// deliberate copy, and a field whose type comes from `z.infer` is read like a written one.
import type { InterfaceDeclaration, Node, TypeAliasDeclaration, TypeChecker, TypeLiteralNode } from "ts-morph";
import { Node as N } from "ts-morph";
import type { AssignabilityRefusalKind } from "../../floor/code-facts/assignability.ts";
import { fieldTypesAgree, readAssignabilityChecker } from "../../floor/code-facts/assignability.ts";
import { ownDataFieldNames, resolvedShapeProperties } from "../../floor/code-facts/shape-fields.ts";

/** A candidate needs this many own data fields; three-field overlaps are mostly coincidence. */
export const MIN_COPY_FIELDS = 4;
/** The share of shared fields whose types must agree. */
export const TYPE_AGREEMENT_FLOOR = 0.8;

export interface ContractFieldShape {
  readonly name: string;
  readonly file: string;
  /** The declaration whose resolved type supplies each field's type. */
  readonly decl: Node;
  readonly fields: ReadonlySet<string>;
}

/** A hand-written shape's own data fields, read off the declaration that spells them. */
export interface CopyCandidate {
  readonly decl: Node;
  readonly fields: ReadonlySet<string>;
}

export interface StructuralCopyMatch {
  readonly contract: ContractFieldShape;
  readonly shared: number;
  readonly agreeing: number;
  readonly exact: boolean;
}

/** Whether a candidate's field has the type of the contract's field of the same name. */
type FieldAgreement = (candidate: Node, contract: Node, field: string) => boolean;

const REFUSALS: Readonly<Record<AssignabilityRefusalKind, string>> = {
  "primitive-absent":
    "this TypeScript build exposes no `checker.isTypeAssignableTo`, so a field type cannot be judged (tooling/src/floor/code-facts/assignability.ts)",
  "no-shared-program": "a candidate and a contract share no native compiler program, so a field type cannot be compared",
  "programs-disagree": "native compiler programs disagree about whether a candidate field has the contract field's type",
};

/** The checker-backed agreement for one policy run. Refuses loudly, in the policy's voice, when it cannot compare. */
export function createFieldAgreement(policyId: string, checker: Pick<TypeChecker, "compilerObject">): FieldAgreement {
  const assignability = readAssignabilityChecker(checker);
  const refuse = (kind: AssignabilityRefusalKind): never => {
    throw new Error(`${policyId}: ${REFUSALS[kind]}`);
  };
  if (assignability === undefined) {
    return refuse("primitive-absent");
  }
  // A copy that only adds `?` or `readonly` is still the contract's field.
  const context = { checker: assignability, refuse, lenient: true };
  return (candidate, contract, field) => fieldTypesAgree(context, { decl: candidate, name: field }, { decl: contract, name: field });
}

/** The data field names of one exported contract type, or undefined when it is not a plain object shape. */
export function contractFields(decl: InterfaceDeclaration | TypeAliasDeclaration): ReadonlySet<string> | undefined {
  const properties = resolvedShapeProperties(decl, "copy");
  const fields = properties === undefined ? undefined : new Set(properties.map((property) => property.getName()));
  return fields !== undefined && fields.size >= MIN_COPY_FIELDS ? fields : undefined;
}

/** A candidate's own data fields, excluding behavior and indexed-access derivations. */
export function candidateFields(node: InterfaceDeclaration | TypeLiteralNode): ReadonlySet<string> | undefined {
  const fields = ownDataFieldNames(node);
  return fields.size >= MIN_COPY_FIELDS ? fields : undefined;
}

/** Index contract shapes by field name, so a candidate is compared only with shapes it shares a field with. */
export function indexByField(shapes: readonly ContractFieldShape[]): ReadonlyMap<string, readonly ContractFieldShape[]> {
  const index = new Map<string, ContractFieldShape[]>();
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
function sharedFieldCounts(fields: ReadonlySet<string>, index: ReadonlyMap<string, readonly ContractFieldShape[]>): ReadonlyMap<ContractFieldShape, number> {
  const tally = new Map<ContractFieldShape, number>();
  for (const field of fields) {
    for (const shape of index.get(field) ?? []) {
      tally.set(shape, (tally.get(shape) ?? 0) + 1);
    }
  }
  return tally;
}

/** How many of the candidate's fields the contract carries with the same type. */
function agreeingCount(candidate: CopyCandidate, contract: ContractFieldShape, agree: FieldAgreement): number {
  return [...candidate.fields].filter((field) => contract.fields.has(field) && agree(candidate.decl, contract.decl, field)).length;
}

/** The best contract this candidate copies: every candidate field is a contract field and enough types agree.
 *  Exact field-set equality ranks above a proper subset, then the larger shared set. */
export function bestCopyMatch(
  candidate: CopyCandidate,
  index: ReadonlyMap<string, readonly ContractFieldShape[]>,
  agree: FieldAgreement,
): StructuralCopyMatch | undefined {
  const tally = sharedFieldCounts(candidate.fields, index);
  let best: StructuralCopyMatch | undefined;
  for (const [contract, shared] of tally) {
    if (shared !== candidate.fields.size) {
      continue;
    }
    const agreeing = agreeingCount(candidate, contract, agree);
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

/** The share of a candidate's own field names one shape must carry for the candidate to be a drifted copy of it. */
const OVERLAP_FLOOR = 0.8;
/** How many shared fields a drifted copy may have retyped; more and the shared names are a coincidence of vocabulary. */
const DRIFTED_TYPE_ALLOWANCE = 1;

/** The shape a candidate copied before it drifted: at least `MIN_COPY_FIELDS` of the candidate's field names, and
 *  `OVERLAP_FLOOR` of them, are that shape's, and all but `DRIFTED_TYPE_ALLOWANCE` of those agree on type. The widest
 *  overlap wins. A copy that renamed or retyped a field slips `bestCopyMatch` and is still the same copy. */
export function bestOverlapMatch(
  candidate: CopyCandidate,
  index: ReadonlyMap<string, readonly ContractFieldShape[]>,
  agree: FieldAgreement,
): StructuralCopyMatch | undefined {
  const tally = sharedFieldCounts(candidate.fields, index);
  let best: StructuralCopyMatch | undefined;
  for (const [contract, shared] of tally) {
    if (shared < MIN_COPY_FIELDS || shared < OVERLAP_FLOOR * candidate.fields.size) {
      continue;
    }
    const agreeing = agreeingCount(candidate, contract, agree);
    if (agreeing < shared - DRIFTED_TYPE_ALLOWANCE) {
      continue;
    }
    const match = { contract, shared, agreeing, exact: false };
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
