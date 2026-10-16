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

import { readMemberReferenceWithName, readStaticString, referenceResolutionServices } from "@orb/tooling/floor/code-facts/reference-fact";
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { TypeObservationReader } from "../../floor/code-facts/type-observations-contract.ts";
import { nodeTypeSelector } from "../../floor/code-facts/type-projection-contract.ts";
import type { RoleAxisVerdict, RoleComparisonServices } from "../contract/role-vocabulary.ts";
import type { TupleVocabularyFact } from "../contract/tuple-vocabulary-fact.ts";

/** The identifier a role read must be spelled with — the legacy subject, kept and declared. */
const ROLE_NAME = "role";

const EQUALITY_TOKENS = [SyntaxKind.EqualsEqualsEqualsToken, SyntaxKind.ExclamationEqualsEqualsToken] as const;

/** One `<role read> ===/!== "<member>"` comparison, either operand order. */
export interface RoleComparison {
  readonly comparison: MorphNode;
  /** The compared read: name-bound by default, or any expression at an explicitly selected enforcement sink. */
  readonly read: MorphNode;
  /** The compared string value, resolved through the shared static-string reader (const aliases included). */
  readonly value: string;
  readonly valueNode: MorphNode;
}

/** Is this node a read named `role` — the bare identifier, or a dotted/optional/computed member? */
function isRoleRead(node: MorphNode, services: RoleComparisonServices): boolean {
  if (Node.isIdentifier(node)) {
    return node.getText() === ROLE_NAME;
  }
  if (!(Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node))) {
    return false;
  }
  const member = readMemberReferenceWithName(node, services.computedName);
  return member.kind === "resolved" && member.value.name === ROLE_NAME;
}

function comparedValue(node: MorphNode, services: RoleComparisonServices): { readonly value: string; readonly valueNode: MorphNode } | undefined {
  const fact = services.string(node);
  return fact.kind === "resolved" ? { value: fact.value, valueNode: node } : undefined;
}

function roleOperand(left: MorphNode, right: MorphNode, services: RoleComparisonServices): MorphNode | undefined {
  if (isRoleRead(left, services)) {
    return left;
  }
  return isRoleRead(right, services) ? right : undefined;
}

/** A lossless syntax nomination; computed keys and known enforcement sinks await sealed meaning. */
export function roleComparisonCandidate(node: MorphNode, matchExpression = false): node is import("ts-morph").BinaryExpression {
  if (!(Node.isBinaryExpression(node) && EQUALITY_TOKENS.includes(node.getOperatorToken().getKind() as (typeof EQUALITY_TOKENS)[number]))) {
    return false;
  }
  const possible = (operand: MorphNode): boolean =>
    Node.isElementAccessExpression(operand) ||
    (Node.isIdentifier(operand) && operand.getText() === ROLE_NAME) ||
    (Node.isPropertyAccessExpression(operand) && operand.getName() === ROLE_NAME);
  return matchExpression || possible(node.getLeft()) || possible(node.getRight());
}

/** Read one role equality; expression matching lets a known enforcement field consume a fresh call result. */
export function readRoleComparison(
  node: MorphNode,
  matchExpression = false,
  services: RoleComparisonServices = { string: readStaticString, computedName: referenceResolutionServices.readComputedName },
): RoleComparison | undefined {
  if (!Node.isBinaryExpression(node)) {
    return;
  }
  if (!EQUALITY_TOKENS.includes(node.getOperatorToken().getKind() as (typeof EQUALITY_TOKENS)[number])) {
    return;
  }
  const left = node.getLeft();
  const right = node.getRight();
  let read = roleOperand(left, right, services);
  if (matchExpression) {
    read = comparedValue(right, services) === undefined ? right : left;
  }
  if (read === undefined) {
    return;
  }
  const literal = comparedValue(read === left ? right : left, services);
  return literal === undefined ? undefined : { comparison: node, read, value: literal.value, valueNode: literal.valueNode };
}

/** The string-literal members of a read's own type, or `undefined` when the checker did not resolve a
 *  closed literal union — an axis this reader cannot name is never claimed as one. */
function literalMembers(read: MorphNode, native?: TypeObservationReader): ReadonlySet<string> | undefined {
  if (native !== undefined) {
    return nativeLiteralMembers(read, native);
  }
  const type = read.getType().getNonNullableType();
  const parts = type.isUnion() ? type.getUnionTypes() : [type];
  const members = new Set<string>();
  for (const part of parts) {
    if (!part.isStringLiteral()) {
      return;
    }
    const literal = part.getLiteralValue();
    if (typeof literal !== "string") {
      return;
    }
    members.add(literal);
  }
  return members.size === 0 ? undefined : members;
}

function nativeLiteralMembers(read: MorphNode, native: TypeObservationReader): ReadonlySet<string> | undefined {
  const selector = { ...nodeTypeSelector(read), steps: [{ kind: "nonnullable" as const }] };
  const selected = native.select(selector);
  if (selected === null) {
    throw new Error("native role type is absent");
  }
  const parts = native.type(selected).unionCount > 0 ? native.unions(selector) : [selector];
  const members = new Set<string>();
  for (const part of parts) {
    const literal = native.literal(part);
    if (literal === null) {
      return;
    }
    members.add(literal);
  }
  return members.size === 0 ? undefined : members;
}

/** Judge a role read against one vocabulary.
 *
 *  - `on-axis` — the read's literal members are EXACTLY the vocabulary.
 *  - `unreadable` — the checker resolved no closed literal union (`any`, `unknown`, `string`, a call result),
 *    or resolved a strict SUPERSET that still carries the whole vocabulary (`ParticipantRole | "observer"`).
 *    Both cases MIGHT be the lattice, so the caller reports them.
 *  - `foreign` — a closed literal union missing at least one vocabulary member: the message-row axis, a
 *    StreamAuthority tier, `"host" | "guest"`. A narrowed binding lands here too, which is the ONE declared
 *    narrowing (a value already narrowed to a single member is not a lattice comparison). */
export function readAxisVerdict(read: MorphNode, vocabulary: ReadonlySet<string>, native?: TypeObservationReader): RoleAxisVerdict {
  const members = literalMembers(read, native);
  if (members === undefined) {
    return "unreadable";
  }
  if (![...vocabulary].every((member) => members.has(member))) {
    return "foreign";
  }
  return members.size === vocabulary.size ? "on-axis" : "unreadable";
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
