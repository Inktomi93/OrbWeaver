// The compiler checker's assignability primitive, shared by `pnpm ast respell` and the verify gates that judge a
// value or a field against a type. Each caller refuses in its own voice when the primitive is absent or the native
// programs disagree; none may answer a silent zero, because a comparison that quietly stops running reads as a
// clean result.
import type { Node, Project, Type, TypeChecker } from "ts-morph";
import { coLocatedSemanticNodes } from "../compiler/ts-workspace.ts";

export interface AssignabilityChecker {
  isTypeAssignableTo: (source: unknown, target: unknown) => boolean;
}

/** The checker's `isTypeAssignableTo`, a TypeScript internal present on the TS 5.x and TS7 checker objects
 *  (re-verify on a TypeScript bump). Undefined when this build does not expose it. */
export function readAssignabilityChecker(checker: Pick<TypeChecker, "compilerObject">): AssignabilityChecker | undefined {
  const compiler = checker.compilerObject as unknown as Partial<AssignabilityChecker>;
  return typeof compiler.isTypeAssignableTo === "function" ? { isTypeAssignableTo: compiler.isTypeAssignableTo.bind(compiler) } : undefined;
}

/** Why a comparison could not run. `answers` carries each native program's verdict for `programs-disagree`. */
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
  /** Optionality and array readonly-ness are not type differences: `T?` agrees with `T`, and `readonly T[]` with `T[]`.
   *  A copy that differs only there is still a copy. */
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

/** One non-union constituent against another: arrays agree by element, so `readonly T[]` agrees with `T[]`. */
function partsAgree(checker: AssignabilityChecker, left: Type, right: Type): boolean {
  const leftElement = isArrayLike(left) ? left.getTypeArguments()[0] : undefined;
  const rightElement = isArrayLike(right) ? right.getTypeArguments()[0] : undefined;
  return leftElement !== undefined && rightElement !== undefined ? typesAgree(checker, leftElement, rightElement, true) : mutual(checker, left, right);
}

function typesAgree(checker: AssignabilityChecker, left: Type, right: Type, lenient: boolean): boolean {
  if (!lenient) {
    return mutual(checker, left, right);
  }
  // Two unions agree when every non-undefined constituent has an agreeing twin on the other side.
  const leftParts = definedParts(left);
  const rightParts = definedParts(right);
  return (
    leftParts.every((part) => rightParts.some((twin) => partsAgree(checker, part, twin))) &&
    rightParts.every((part) => leftParts.some((twin) => partsAgree(checker, twin, part)))
  );
}

function checkerOfProject(project: Pick<Project, "getTypeChecker">, refuse: RefuseAssignability): AssignabilityChecker {
  return readAssignabilityChecker(project.getTypeChecker()) ?? refuse("primitive-absent", []);
}

/** MUTUALLY assignable in every native compiler program that owns both nodes, or in their one shared Project:
 *  the same type whatever the two spell it as. Assignability, not type TEXT, because a text signature is
 *  alias-sensitive (`CharacterId` and `TypeIdOf<"character">` print differently and are the same type). */
export function mutuallyAssignableAcross(context: AgreementContext, left: Node, right: Node, read: TypePairReader): boolean {
  const { checker, refuse, lenient = false } = context;
  const judge = (effective: AssignabilityChecker, a: Node, b: Node): boolean => {
    const pair = read(a, b);
    return pair !== undefined && typesAgree(effective, pair[0], pair[1], lenient);
  };
  const colocated = coLocatedSemanticNodes(left, right);
  if (colocated.length === 0) {
    if (left.getProject() !== right.getProject()) {
      return refuse("no-shared-program", []);
    }
    return judge(checker, left, right);
  }
  const answers = colocated.map(({ project, left: a, right: b }) => judge(checkerOfProject(project, refuse), a, b));
  if (new Set(answers).size !== 1) {
    return refuse("programs-disagree", answers);
  }
  return answers[0] === true;
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
