// Native type relations shared by AST lenses and policies. Missing primitives and disagreeing programs refuse;
// no comparison constructs a compiler program or substitutes display type text for assignability.
import type { Node, Project, Symbol as TsSymbol, Type, TypeChecker } from "ts-morph";
import { coLocatedSemanticNodes } from "../compiler/ts-workspace.ts";
import type { TypeRelation } from "./assignability-contract.ts";

export type { TypeRelation } from "./assignability-contract.ts";

export interface AssignabilityChecker {
  isTypeAssignableTo: (source: unknown, target: unknown) => boolean;
}

/** The checker's `isTypeAssignableTo`, a TypeScript internal present on the TS 5.x and TS7 checker objects
 *  (re-verify on a TypeScript bump). Undefined when this build does not expose it. */
export function readAssignabilityChecker(checker: Pick<TypeChecker, "compilerObject">): AssignabilityChecker | undefined {
  const compiler = checker.compilerObject as unknown as Partial<AssignabilityChecker>;
  return typeof compiler.isTypeAssignableTo === "function" ? { isTypeAssignableTo: compiler.isTypeAssignableTo.bind(compiler) } : undefined;
}

/** Why a comparison could not run. Native relation answers flatten their directions and any-ness for refusal evidence. */
export const ASSIGNABILITY_REFUSAL_KINDS = ["primitive-absent", "no-shared-program", "programs-disagree"] as const;
export type AssignabilityRefusalKind = (typeof ASSIGNABILITY_REFUSAL_KINDS)[number];

/** The caller's refusal: it ends the run in the caller's voice, so a comparison never degrades to a quiet false. */
export type RefuseAssignability = (kind: AssignabilityRefusalKind, answers: readonly boolean[]) => never;

/** The two types a comparison judges, read off one pair of nodes in one program. Undefined = no comparable type. */
export type TypePairReader = (left: Node, right: Node) => readonly [Type, Type] | undefined;

/** What a comparison needs besides the nodes: the single-Project checker, the caller's refusal, and its leniency. */
export interface AgreementContext {
  /** Judges the single-Project path; a co-located program judges with its own checker. */
  readonly checker: AssignabilityChecker;
  readonly refuse: RefuseAssignability;
  /** Optionality and `readonly` are not type differences at any depth: `T?` agrees with `T`, `readonly T[]` with `T[]`,
   *  and `{ readonly a: T }` with `{ a: T }`. A copy that differs only there is still a copy. */
  readonly lenient?: boolean;
}

function definedParts(type: Type): readonly Type[] {
  return (type.isUnion() ? type.getUnionTypes() : [type]).filter((part) => !part.isUndefined());
}

function mutual(checker: AssignabilityChecker, left: Type, right: Type): boolean {
  return checker.isTypeAssignableTo(left.compilerType, right.compilerType) && checker.isTypeAssignableTo(right.compilerType, left.compilerType);
}

function isArrayLike(type: Type): boolean {
  return type.isArray() || type.isReadonlyArray();
}

/** The named properties of a plain data object; undefined for arrays, tuples, callables and empty objects. */
function plainProperties(type: Type): readonly TsSymbol[] | undefined {
  const plain = type.isObject() && !isArrayLike(type) && !type.isTuple() && type.getCallSignatures().length === 0 && type.getConstructSignatures().length === 0;
  const properties = plain ? type.getProperties() : [];
  return properties.length > 0 ? properties : undefined;
}

/** A type and a node to read its members' types at. */
interface Side {
  readonly type: Type;
  readonly at: Node;
}

/** Pairs already under comparison, so a recursive type is assumed to agree on the way back in. */
type Seen = Map<unknown, Set<unknown>>;

function revisits(seen: Seen, left: Type, right: Type): boolean {
  const known = seen.get(left.compilerType) ?? new Set<unknown>();
  seen.set(left.compilerType, known);
  const revisit = known.has(right.compilerType);
  known.add(right.compilerType);
  return revisit;
}

function objectsAgree(checker: AssignabilityChecker, left: Side, right: Side, seen: Seen): boolean {
  const leftProperties = plainProperties(left.type);
  const rightProperties = plainProperties(right.type);
  if (leftProperties === undefined || rightProperties === undefined || leftProperties.length !== rightProperties.length) {
    return false;
  }
  if (revisits(seen, left.type, right.type)) {
    return true;
  }
  return leftProperties.every((property) => {
    const twin = rightProperties.find((candidate) => candidate.getName() === property.getName());
    return (
      twin !== undefined &&
      typesAgree(checker, { type: property.getTypeAtLocation(left.at), at: left.at }, { type: twin.getTypeAtLocation(right.at), at: right.at }, seen)
    );
  });
}

/** One non-union constituent against another. Exact assignability agrees. Otherwise arrays agree by element and plain
 *  objects by property, so `readonly` and `?` relax at every depth. */
function partsAgree(checker: AssignabilityChecker, left: Side, right: Side, seen: Seen): boolean {
  if (mutual(checker, left.type, right.type)) {
    return true;
  }
  const leftElement = isArrayLike(left.type) ? left.type.getTypeArguments()[0] : undefined;
  const rightElement = isArrayLike(right.type) ? right.type.getTypeArguments()[0] : undefined;
  if (leftElement !== undefined && rightElement !== undefined) {
    return typesAgree(checker, { type: leftElement, at: left.at }, { type: rightElement, at: right.at }, seen);
  }
  return objectsAgree(checker, left, right, seen);
}

/** Lenient agreement. Two unions agree when every non-undefined constituent has an agreeing twin on the other side. */
function typesAgree(checker: AssignabilityChecker, left: Side, right: Side, seen: Seen): boolean {
  const leftParts = definedParts(left.type);
  const rightParts = definedParts(right.type);
  return (
    leftParts.every((part) => rightParts.some((twin) => partsAgree(checker, { ...left, type: part }, { ...right, type: twin }, seen))) &&
    rightParts.every((part) => leftParts.some((twin) => partsAgree(checker, { ...left, type: twin }, { ...right, type: part }, seen)))
  );
}

function checkerOfProject(project: Pick<Project, "getTypeChecker">, refuse: RefuseAssignability): AssignabilityChecker {
  return readAssignabilityChecker(project.getTypeChecker()) ?? refuse("primitive-absent", []);
}

type NativeJudgment<Answer extends readonly boolean[]> = (checker: AssignabilityChecker, left: Node, right: Node) => Answer | undefined;

function compareAcross<Answer extends readonly boolean[]>(
  context: AgreementContext,
  left: Node,
  right: Node,
  judge: NativeJudgment<Answer>,
): Answer | undefined {
  const colocated = coLocatedSemanticNodes(left, right);
  if (colocated.length === 0) {
    if (left.getProject() !== right.getProject()) {
      return context.refuse("no-shared-program", []);
    }
    return judge(context.checker, left, right);
  }
  const answers = colocated.map(({ project, left: a, right: b }) => judge(checkerOfProject(project, context.refuse), a, b));
  if (new Set(answers.map((answer) => (answer === undefined ? "unreadable" : answer.join("|")))).size !== 1) {
    return context.refuse(
      "programs-disagree",
      answers.flatMap((answer) => answer ?? []),
    );
  }
  return answers[0];
}

/** Mutual agreement in every native program containing both nodes. Display type text never establishes identity. */
export function mutuallyAssignableAcross(context: AgreementContext, left: Node, right: Node, read: TypePairReader): boolean {
  const answer = compareAcross(context, left, right, (checker, a, b) => {
    const pair = read(a, b);
    return [
      pair !== undefined &&
        (context.lenient === true ? typesAgree(checker, { type: pair[0], at: a }, { type: pair[1], at: b }, new Map()) : mutual(checker, pair[0], pair[1])),
    ];
  });
  return answer?.[0] === true;
}

/** Scalar relation computation, not declaration provenance: the supplying native or isolated-proof owner holds
 * checker provenance, and a structural fit does not prove that one declaration copied another. */
export function readNativeTypeRelation(checker: AssignabilityChecker, left: Type, right: Type): TypeRelation {
  return {
    leftToRight: checker.isTypeAssignableTo(left.compilerType, right.compilerType),
    rightToLeft: checker.isTypeAssignableTo(right.compilerType, left.compilerType),
    leftIsAny: left.isAny(),
    rightIsAny: right.isAny(),
  };
}

/** Both assignability directions, agreed by every native program owning the pair. Undefined means the reader
 * supplied no comparable types; callers must not treat that as evidence of an unrelated type. */
export function typeRelationAcross(
  context: Pick<AgreementContext, "checker" | "refuse">,
  left: Node,
  right: Node,
  read: TypePairReader,
): TypeRelation | undefined {
  const answer = compareAcross(context, left, right, (checker, a, b): readonly [boolean, boolean, boolean, boolean] | undefined => {
    const pair = read(a, b);
    if (pair === undefined) {
      return;
    }
    const relation = readNativeTypeRelation(checker, pair[0], pair[1]);
    return [relation.leftToRight, relation.rightToLeft, relation.leftIsAny, relation.rightIsAny];
  });
  return answer === undefined
    ? undefined
    : { leftToRight: answer[0] === true, rightToLeft: answer[1] === true, leftIsAny: answer[2] === true, rightIsAny: answer[3] === true };
}

/** One named field of one declaration: the declaration's resolved type supplies the field's type, so a field with
 *  no property node of its own (a `z.infer` or mapped-type member) is read the same way as a written one. */
export interface FieldIdentity {
  readonly decl: Node;
  readonly name: string;
}

function fieldTypeOf(field: FieldIdentity, decl: Node): Type | undefined {
  return decl.getType().getProperty(field.name)?.getTypeAtLocation(decl);
}

/** Whether two declarations' named fields have the same type in every native program that owns both. */
export function fieldTypesAgree(context: AgreementContext, left: FieldIdentity, right: FieldIdentity): boolean {
  const read: TypePairReader = (a, b) => {
    const leftType = fieldTypeOf(left, a);
    const rightType = fieldTypeOf(right, b);
    return leftType === undefined || rightType === undefined ? undefined : [leftType, rightType];
  };
  return mutuallyAssignableAcross(context, left.decl, right.decl, read);
}
