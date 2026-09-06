// One reader for "is this an equality comparison of a `role` READ against a member of ROLE AXIS X" — the
// shared half of `owner-role-split` (the global-role lattice) and `two-class-role-authority` (the chat
// participant role).
//
// Both policies stood on two spellings at once: a hardcoded literal set inside the gate (`"owner"`,
// `"admin"`, `"host"`) and a textual `role` tail. The literal set is now READ FROM THE VOCABULARY'S OWN
// DECLARATION through the shared `tupleVocabularyFact` and bound to its declaring module, so a member added
// to `USER_ROLES`/`PARTICIPANT_ROLES` is judged the day it lands and a vocabulary that stops resolving takes
// the policy's receipt to zero and WITHHOLDS the verdict instead of rendering a clean pass. The AXIS is then
// proven by the read's own TYPE — the set of string-literal members the checker resolved must be exactly the
// vocabulary — which is what separates `membership.role === "host"` (the participant axis) from
// `message.role === "user"` (the message-row axis) and from `authority === "host"` (a StreamAuthority TIER
// string that merely shares a lexeme). A hardcoded literal list cannot make that distinction at all.
//
// THE `role` NAME IS A DELIBERATE, DECLARED NARROWING, not an oversight: it is the legacy subject, and
// dropping it would widen both policies onto every comparison of a role-typed value (`resolvedRole ===
// "owner"` in the sessions provisioning path is the live shape), which is a burn-down and not a conversion.
// Each policy carries that limit as a `mustPass` row.
//
// A pure reader over nodes the dispatcher delivered: no walk, no Project, no cache, no filesystem.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { TupleVocabularyFact } from "../contract/tuple-vocabulary-fact.ts";
import { readMemberReference, readStaticString } from "./reference-fact.ts";

/** The identifier a role read must be spelled with — the legacy subject, kept and declared. */
const ROLE_NAME = "role";

const EQUALITY_TOKENS = [SyntaxKind.EqualsEqualsEqualsToken, SyntaxKind.ExclamationEqualsEqualsToken] as const;

/** One `<role read> ===/!== "<member>"` comparison, either operand order. */
export interface RoleComparison {
  readonly comparison: MorphNode;
  /** The `role` read itself — a bare identifier or a member access in any spelling. */
  readonly read: MorphNode;
  /** The compared string value, resolved through the shared static-string reader (const aliases included). */
  readonly value: string;
  readonly valueNode: MorphNode;
}

/** Is this node a read named `role` — the bare identifier, or a dotted/optional/computed member? */
function isRoleRead(node: MorphNode): boolean {
  if (Node.isIdentifier(node)) {
    return node.getText() === ROLE_NAME;
  }
  if (!(Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node))) {
    return false;
  }
  const member = readMemberReference(node);
  return member.kind === "resolved" && member.value.name === ROLE_NAME;
}

function comparedValue(node: MorphNode): { readonly value: string; readonly valueNode: MorphNode } | undefined {
  const fact = readStaticString(node);
  return fact.kind === "resolved" ? { value: fact.value, valueNode: node } : undefined;
}

function roleOperand(left: MorphNode, right: MorphNode): MorphNode | undefined {
  if (isRoleRead(left)) {
    return left;
  }
  return isRoleRead(right) ? right : undefined;
}

/** Read one equality comparison as a role comparison, in either operand order. */
export function readRoleComparison(node: MorphNode): RoleComparison | undefined {
  if (!Node.isBinaryExpression(node)) {
    return;
  }
  if (!EQUALITY_TOKENS.includes(node.getOperatorToken().getKind() as (typeof EQUALITY_TOKENS)[number])) {
    return;
  }
  const left = node.getLeft();
  const right = node.getRight();
  const read = roleOperand(left, right);
  if (read === undefined) {
    return;
  }
  const literal = comparedValue(read === left ? right : left);
  return literal === undefined ? undefined : { comparison: node, read, value: literal.value, valueNode: literal.valueNode };
}

/** The string-literal members of a read's own type, or `undefined` when the checker did not resolve a
 *  closed literal union — an axis this reader cannot name is never claimed as one. */
function literalMembers(read: MorphNode): ReadonlySet<string> | undefined {
  const type = read.getType().getNonNullableType();
  const parts = type.isUnion() ? type.getUnionTypes() : [type];
  const members = new Set<string>();
  for (const part of parts) {
    if (!part.isStringLiteral()) {
      return;
    }
    members.add(String(part.getLiteralValue()));
  }
  return members.size === 0 ? undefined : members;
}

/** Does the read's own TYPE name exactly this vocabulary? Exact set equality on purpose: a proper subset is
 *  either a narrowed binding (not a lattice comparison) or a DIFFERENT axis that happens to overlap. */
export function readIsOnAxis(read: MorphNode, vocabulary: ReadonlySet<string>): boolean {
  const members = literalMembers(read);
  return members !== undefined && members.size === vocabulary.size && [...members].every((member) => vocabulary.has(member));
}

/** Bind a vocabulary tuple to its DECLARING MODULE: a tuple of the right name declared anywhere else is a
 *  different vocabulary and refuses the axis rather than being adopted. The home is an absolute-path INFIX
 *  because a vocabulary declaration is routinely OUTSIDE the consuming policy's population, where
 *  `ctx.relativePath` refuses by contract. */
export function vocabularyAtHome(fact: TupleVocabularyFact, exportedName: string, homeInfix: string): TupleVocabularyFact {
  if (fact.kind !== "resolved") {
    return fact;
  }
  const declaration: SourceFile = fact.symbol.declaration.getSourceFile();
  const path = declaration.getFilePath().replaceAll("\\", "/");
  return path.includes(homeInfix)
    ? fact
    : {
        kind: "unresolved",
        exportedName,
        reason: "ambiguous",
        detail: `${exportedName} is declared at ${path}, not inside its home ${homeInfix}`,
        node: fact.symbol.declaration,
        declarations: fact.declarations,
      };
}

/** The member set of a resolved vocabulary; empty for every refusal, which the caller's receipt reports. */
export function vocabularyMembers(fact: TupleVocabularyFact): ReadonlySet<string> {
  return fact.kind === "resolved" ? new Set(fact.entries.map((entry) => entry.value)) : new Set<string>();
}
