// The FIELD-position walk (what a wire field's own type spells), extracted from bus-payload-fact.ts
// (tooling-size, #1584 residue). The IDENTITY-position walk (walkTypeNode/walkDecl) stays in the front
// door and calls into this leaf for member lists and field types; this leaf never calls back into it.
import type { Node as MorphNode } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import type { WalkFrame } from "./bus-payload-fact-resolve.ts";
import { countReferencedPayload, MEMBERLESS_KINDS, readIndexedAccess, recordMember, refuse, UNSUPPORTED_TOKEN } from "./bus-payload-fact-resolve.ts";

/** The FIELD position's keyless set — deliberately WIDER than `MEMBERLESS_KINDS` (#1066). A field
 *  legitimately spells a scalar where an event's identity never does, and a scalar declares no wire key, so
 *  passing over one hides nothing. A template literal is a string by construction: its interpolations are
 *  types, never wire keys. */
const FIELD_KEYLESS_KINDS: ReadonlySet<SyntaxKind> = new Set([
  ...MEMBERLESS_KINDS,
  SyntaxKind.StringKeyword,
  SyntaxKind.NumberKeyword,
  SyntaxKind.BooleanKeyword,
  SyntaxKind.BigIntKeyword,
  SyntaxKind.SymbolKeyword,
  SyntaxKind.NullKeyword,
  SyntaxKind.TemplateLiteralType,
]);

/** Value-position type keywords that carry an UNCONSTRAINED value — an open key space by another spelling
 *  (the contract headers' "no `unknown`" half). Reported by their own word, not by SyntaxKind name. */
const OPEN_VALUE_KINDS: ReadonlyMap<SyntaxKind, string> = new Map([
  [SyntaxKind.UnknownKeyword, "unknown"],
  [SyntaxKind.AnyKeyword, "any"],
]);

/** The one global type NAME that IS an open key space. Matched by name rather than resolved, because
 *  `Record` is a global lib alias — the workspace resolver would answer "outside the population" for it and
 *  the finding would read `unresolved-base:Record`, which names the wrong defect. */
const OPEN_RECORD_NAME = "Record";

/** Walk a declaration's MEMBER list. A member that is not a plain named property — an index signature, a
 *  method/call/construct signature, a computed name — is a wire key the field-name predicate structurally
 *  cannot read, so it is REFUSED by kind (#1024). `getProperties()` used to be the reader here, and it omits
 *  index signatures silently: that omission was the blind spot. */
export function walkMembers(members: readonly MorphNode[], frame: WalkFrame): void {
  for (const member of members) {
    if (!N.isPropertySignature(member)) {
      refuse(frame.state, member, `${UNSUPPORTED_TOKEN}${member.getKindName()}`);
      continue;
    }
    if (N.isComputedPropertyName(member.getNameNode())) {
      refuse(frame.state, member, `${UNSUPPORTED_TOKEN}ComputedName`);
      continue;
    }
    countReferencedPayload(member, frame.state);
    recordMember({ prop: member, anchor: member.getNameNode(), name: member.getName() }, frame.origin, frame.state);
    walkFieldType(member.getTypeNode(), frame);
  }
}

/** The two MAPPED-TYPE shapes a field's own type can spell, judged together; true when this node was one of
 *  them and has been handled. A BARE mapped type puts its KEYS on the wire under this field, and this reader
 *  cannot judge a key vocabulary it did not author, so it stays refused. The INDEXED form erases those keys,
 *  so a provable distribution is DESCENDED. `Named[K]` — the live `result: WorkloadResultByKind[K]` — is a
 *  shape the field REFERENCES and stops at the non-transitive boundary. */
function walkFieldMappedShape(typeNode: MorphNode, frame: WalkFrame): boolean {
  if (N.isMappedTypeNode(typeNode)) {
    refuse(frame.state, typeNode, `${UNSUPPORTED_TOKEN}MappedType`);
    return true;
  }
  if (!N.isIndexedAccessTypeNode(typeNode)) {
    return false;
  }
  const read = readIndexedAccess(typeNode, frame.state);
  if (read.kind === "distributed") {
    frame.state.distributions += 1;
    walkFieldType(read.template, frame);
    return true;
  }
  if (read.kind === "unprovable") {
    refuse(frame.state, typeNode, `${UNSUPPORTED_TOKEN}MappedType`);
  }
  return true;
}

/** The shapes whose CONSTITUENTS are field positions in their own right — a wrapper's inner type, an array's
 *  element type, a tuple's elements, a union/intersection's parts. True when this node was one of them and
 *  every constituent has been walked. */
function walkFieldContainer(typeNode: MorphNode, frame: WalkFrame): boolean {
  const wrapper =
    N.isParenthesizedTypeNode(typeNode) ||
    N.isTypeOperatorTypeNode(typeNode) ||
    N.isRestTypeNode(typeNode) ||
    N.isOptionalTypeNode(typeNode) ||
    N.isNamedTupleMember(typeNode);
  if (wrapper) {
    walkFieldType(typeNode.getTypeNode(), frame);
    return true;
  }
  if (N.isArrayTypeNode(typeNode)) {
    walkFieldType(typeNode.getElementTypeNode(), frame);
    return true;
  }
  // A TUPLE element is a field position of its own: an inline object literal spelled there rides the wire
  // exactly like an array's element type, and it was never walked at all before #1066.
  if (N.isTupleTypeNode(typeNode)) {
    for (const element of typeNode.getElements()) {
      walkFieldType(element, frame);
    }
    return true;
  }
  if (N.isUnionTypeNode(typeNode) || N.isIntersectionTypeNode(typeNode)) {
    for (const constituent of typeNode.getTypeNodes()) {
      walkFieldType(constituent, frame);
    }
    return true;
  }
  return false;
}

/** Judge a wire field's OWN spelled type: refuse an open key space, and descend an INLINE object literal. A
 *  NAMED reference is never resolved — that is the non-transitive boundary, and `Record` is the one name
 *  matched literally. AND IT FAILS CLOSED ON EVERY OTHER KIND (#1066): a kind that is neither WALKED, READ,
 *  deliberately STOPPED nor provably KEYLESS is REFUSED as `unsupported-shape:<Kind>`. */
export function walkFieldType(typeNode: MorphNode | undefined, frame: WalkFrame): void {
  if (typeNode === undefined) {
    return;
  }
  if (walkFieldContainer(typeNode, frame)) {
    return;
  }
  if (N.isTypeLiteral(typeNode)) {
    walkMembers(typeNode.getMembers(), frame);
    return;
  }
  if (walkFieldMappedShape(typeNode, frame)) {
    return;
  }
  if (N.isTypeReference(typeNode)) {
    if (typeNode.getTypeName().getText() === OPEN_RECORD_NAME) {
      refuse(frame.state, typeNode, `${UNSUPPORTED_TOKEN}${OPEN_RECORD_NAME}`);
    }
    return;
  }
  const openValue = OPEN_VALUE_KINDS.get(typeNode.getKind());
  if (openValue !== undefined) {
    refuse(frame.state, typeNode, `${UNSUPPORTED_TOKEN}${openValue}`);
    return;
  }
  if (FIELD_KEYLESS_KINDS.has(typeNode.getKind())) {
    return;
  }
  refuse(frame.state, typeNode, `${UNSUPPORTED_TOKEN}${typeNode.getKindName()}`);
}
