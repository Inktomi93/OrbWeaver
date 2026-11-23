// The site-role reader: what one name occurrence does to the declaration it names, read off its parents on the
// TypeScript 7.1 tree. The graph's walk and the find-references precision check both judge an occurrence here, so the
// two cannot disagree on a role. The value roles of a string literal or a read value (a construction, a comparison, a
// `case` label, a key) and what a reference does with a tuple or callable are read here too, for the unions and codes
// scans (./unions.ts).
//
// Owner rulings this reader holds (the other graph modules point here):
// - Escape is a send, not a read: a field counts as read only where a receiver reads it by name. {@link READS} leaves
//   escape out, so a member only sent is member-sent-only, apart from member-write-only and member-untouched.
// - A bump (`x.n++`, `x.n += 1`) stores into its target; it reads the target only when the bump's own value is used,
//   so a member only ever bumped is never read.
//
// Invariants:
// - A logical assignment (`??=`, `||=`, `&&=`) reads its target to decide whether to store, so it reads and writes.
// - A destructuring-assignment target (`({ a: x.n } = o)`, `[x.n] = list`) and a for-of or for-in target write; the
//   pattern's own keys (`a` above) read the source's member.
// - A type or interface member's own name declares the member and does nothing; a class member that supplies its value
//   where it is declared (a field with an initializer, a method, an accessor) writes it. A doc comment does nothing.
import type {
  EnumMember,
  GetAccessorDeclaration,
  MethodDeclaration,
  MethodSignatureDeclaration,
  Node,
  PropertyAssignment,
  PropertyDeclaration,
  PropertySignatureDeclaration,
  SetAccessorDeclaration,
  ShorthandPropertyAssignment,
  StringLiteral,
} from "@typescript/native/ast";
import {
  isArrayLiteralExpression,
  isAsExpression,
  isBinaryExpression,
  isBindingElement,
  isCallExpression,
  isCaseClause,
  isClassDeclaration,
  isClassExpression,
  isComputedPropertyName,
  isDeleteExpression,
  isElementAccessExpression,
  isEnumMember,
  isExportDeclaration,
  isExpressionStatement,
  isExternalModuleReference,
  isForInStatement,
  isForOfStatement,
  isForStatement,
  isGetAccessorDeclaration,
  isIdentifier,
  isImportDeclaration,
  isIndexedAccessTypeNode,
  isJSDocNodeKind,
  isJsxAttribute,
  isJsxOpeningElement,
  isJsxSelfClosingElement,
  isLiteralTypeNode,
  isMethodDeclaration,
  isMethodSignatureDeclaration,
  isNewExpression,
  isNonNullExpression,
  isNoSubstitutionTemplateLiteral,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPostfixUnaryExpression,
  isPrefixUnaryExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertyDeclaration,
  isPropertySignatureDeclaration,
  isSatisfiesExpression,
  isSetAccessorDeclaration,
  isShorthandPropertyAssignment,
  isSourceFile,
  isSpreadAssignment,
  isSpreadElement,
  isStringLiteral,
  isTaggedTemplateExpression,
  isVoidExpression,
  SyntaxKind,
} from "@typescript/native/ast";

// What an occurrence does: reads, stores, calls, deletes, hands the value whole to an opaque receiver, or names the
// member as a key (a type selector, a mapped key) without touching its data.
const ROLES = ["read", "write", "call", "delete", "escape", "key"] as const;
export type Role = (typeof ROLES)[number];

/** A member's roles on one side of the product line. Interned: members with the same roles share one set, so a
 *  whole-program graph holds one set per combination of roles rather than two per member. */
export type RoleSet = ReadonlySet<Role>;

const INTERNED = new Map<string, RoleSet>();

const interned = (roles: readonly Role[]): RoleSet => {
  const key = roles.join(" ");
  const known = INTERNED.get(key);
  if (known !== undefined) {
    return known;
  }
  const made: RoleSet = new Set(roles);
  INTERNED.set(key, made);
  return made;
};

/** The empty role set. */
export const NO_ROLES: RoleSet = interned([]);

/** `roles` with `added` joined, in {@link ROLES} order, as the interned set. */
export const withRoles = (roles: RoleSet, added: Iterable<Role>): RoleSet => {
  const next = new Set(added);
  return [...next].every((role) => roles.has(role)) ? roles : interned(ROLES.filter((role) => roles.has(role) || next.has(role)));
};

/** The roles that consume a member's data where a receiver names it. An escape is a send, never a read. */
export const READS: ReadonlySet<Role> = new Set<Role>(["read", "call", "delete"]);

const NONE: readonly Role[] = [];
const READ: readonly Role[] = ["read"];
const WRITE: readonly Role[] = ["write"];
const READ_WRITE: readonly Role[] = ["read", "write"];

// `=`, a compound `+=` or a logical `??=`: an operator that stores into its left side.
const isAssignment = (kind: SyntaxKind): boolean => kind >= SyntaxKind.FirstAssignment && kind <= SyntaxKind.LastAssignment;

const LOGICAL_ASSIGNMENTS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.QuestionQuestionEqualsToken,
  SyntaxKind.BarBarEqualsToken,
  SyntaxKind.AmpersandAmpersandEqualsToken,
]);

/** Remote nodes are materialised per request, so two wrappers of one node compare by span and kind, never by identity. */
export const sameNode = (a: Node | undefined, b: Node | undefined): boolean =>
  a !== undefined && b !== undefined && a.pos === b.pos && a.end === b.end && a.kind === b.kind;

// The expression a store's value lands in, through parentheses and a non-null assertion.
function outermost(node: Node): Node {
  let at = node;
  while (isParenthesizedExpression(at.parent) || isNonNullExpression(at.parent)) {
    at = at.parent;
  }
  return at;
}

// Whether the value of an expression is thrown away: a statement of its own, a for loop's update, a `void` operand.
function discarded(expression: Node): boolean {
  const at = outermost(expression);
  const { parent } = at;
  return (
    isExpressionStatement(parent) ||
    isVoidExpression(parent) ||
    (isForStatement(parent) && (sameNode(parent.incrementor, at) || sameNode(parent.initializer, at)))
  );
}

const bump = (expression: Node): readonly Role[] => (discarded(expression) ? WRITE : READ_WRITE);

/** Whether `target` is a destructuring assignment's pattern or a slot of one: an element of an array literal, a
 *  property's value or a spread of an object literal, nested to any depth, whose outermost literal is an assignment's
 *  left side or a for-of or for-in target. */
export function inAssignmentPattern(target: Node): boolean {
  let at = target;
  while (isPatternSlot(at)) {
    const { parent } = at;
    // `[x.a = 1] = list`: a default inside the pattern sits on a nested `=`, so the walk climbs past it
    at = isPropertyAssignment(parent) || isShorthandPropertyAssignment(parent) ? parent.parent : parent;
  }
  return isPatternLiteral(at) && isPatternRoot(at);
}

// A literal that is an assignment's left side or a for-of or for-in target.
function isPatternRoot(literal: Node): boolean {
  const { parent } = literal;
  if (isBinaryExpression(parent)) {
    return sameNode(parent.left, literal) && parent.operatorToken.kind === SyntaxKind.EqualsToken;
  }
  return (isForOfStatement(parent) || isForInStatement(parent)) && sameNode(parent.initializer, literal);
}

const isPatternLiteral = (node: Node): boolean => isArrayLiteralExpression(node) || isObjectLiteralExpression(node);

// A node that sits in a slot of an array or object literal: an element, a spread, a property's value, a shorthand.
function isPatternSlot(node: Node): boolean {
  const { parent } = node;
  return (
    isArrayLiteralExpression(parent) ||
    ((isSpreadElement(parent) || isSpreadAssignment(parent)) && isPatternLiteral(parent.parent)) ||
    (isPropertyAssignment(parent) && sameNode(parent.initializer, node) && isObjectLiteralExpression(parent.parent)) ||
    (isShorthandPropertyAssignment(parent) && isObjectLiteralExpression(parent.parent)) ||
    (isBinaryExpression(parent) && sameNode(parent.left, node) && parent.operatorToken.kind === SyntaxKind.EqualsToken && isPatternSlot(parent))
  );
}

// The expression a reference names: `x.m` and `x["m"]` for a member name, else the name itself.
function accessOf(name: Node): Node {
  const { parent } = name;
  const named =
    (isPropertyAccessExpression(parent) && sameNode(parent.name, name)) || (isElementAccessExpression(parent) && sameNode(parent.argumentExpression, name));
  return named ? parent : name;
}

// The roles of a store into `target`: an assignment, a bump, a for-of or for-in target, a destructuring slot.
function storeRoles(target: Node): readonly Role[] | null {
  const up = target.parent;
  if (isBinaryExpression(up) && sameNode(up.left, target) && isAssignment(up.operatorToken.kind)) {
    const operator = up.operatorToken.kind;
    if (operator === SyntaxKind.EqualsToken) {
      return WRITE;
    }
    return LOGICAL_ASSIGNMENTS.has(operator) ? READ_WRITE : bump(up);
  }
  if (
    (isPrefixUnaryExpression(up) || isPostfixUnaryExpression(up)) &&
    (up.operator === SyntaxKind.PlusPlusToken || up.operator === SyntaxKind.MinusMinusToken)
  ) {
    return bump(up);
  }
  if ((isForOfStatement(up) || isForInStatement(up)) && sameNode(up.initializer, target)) {
    return WRITE;
  }
  return isPatternSlot(target) && inAssignmentPattern(target) ? WRITE : null;
}

/** The roles of a reference: the expression it names (`x.m`, `x["m"]`, a bare name) stored into, bumped, deleted,
 *  called, or else read. A JSX attribute's name writes the prop it names. */
export function referenceRoles(name: Node): readonly Role[] {
  const { parent } = name;
  if (isJsxAttribute(parent) && sameNode(parent.name, name)) {
    return WRITE;
  }
  const target = outermost(accessOf(name));
  const stored = storeRoles(target);
  if (stored !== null) {
    return stored;
  }
  const up = target.parent;
  if (isDeleteExpression(up)) {
    return ["delete"];
  }
  return (isCallExpression(up) && sameNode(up.expression, target)) || (isTaggedTemplateExpression(up) && sameNode(up.tag, target)) ? ["call"] : READ;
}

// The declarations whose own name an occurrence can be: naming the member there declares it.
type MemberDeclaration =
  | PropertySignatureDeclaration
  | PropertyDeclaration
  | MethodSignatureDeclaration
  | MethodDeclaration
  | GetAccessorDeclaration
  | SetAccessorDeclaration
  | EnumMember;

const isMemberDeclaration = (node: Node): node is MemberDeclaration =>
  isPropertySignatureDeclaration(node) ||
  isPropertyDeclaration(node) ||
  isMethodSignatureDeclaration(node) ||
  isMethodDeclaration(node) ||
  isGetAccessorDeclaration(node) ||
  isSetAccessorDeclaration(node) ||
  isEnumMember(node);

// An object literal's own keys: naming a member there fills the slot the literal is typed as.
type LiteralKey = PropertyAssignment | ShorthandPropertyAssignment | MethodDeclaration | GetAccessorDeclaration | SetAccessorDeclaration;

const isLiteralKey = (node: Node): node is LiteralKey =>
  (isPropertyAssignment(node) ||
    isShorthandPropertyAssignment(node) ||
    isMethodDeclaration(node) ||
    isGetAccessorDeclaration(node) ||
    isSetAccessorDeclaration(node)) &&
  isObjectLiteralExpression(node.parent);

function insideDoc(node: Node): boolean {
  for (let up = node.parent; !isSourceFile(up); up = up.parent) {
    if (isJSDocNodeKind(up.kind)) {
      return true;
    }
  }
  return false;
}

// A class member whose declaration gives it a value: a field with an initializer, a method, an accessor.
const suppliesValue = (member: MemberDeclaration): boolean =>
  (isClassDeclaration(member.parent) || isClassExpression(member.parent)) &&
  (!isPropertyDeclaration(member) || member.initializer !== undefined) &&
  !isPropertySignatureDeclaration(member) &&
  !isMethodSignatureDeclaration(member);

// Whether a name is a key of a destructuring assignment's pattern (`a` in `({ a: x.n } = o)`), which reads the
// source's member rather than writing the literal's.
function isPatternKey(name: Node): boolean {
  const { parent } = name;
  return isLiteralKey(parent) && sameNode(parent.name, name) && inAssignmentPattern(parent.parent);
}

// What a name declaring a member does: an object literal's key writes, a destructuring-assignment pattern's key reads,
// a class member that supplies its value writes, and a type member's own name declares.
function declaringRoles(name: Node): readonly Role[] | null {
  const { parent } = name;
  if (isLiteralKey(parent) && sameNode(parent.name, name)) {
    return isPatternKey(name) ? READ : WRITE;
  }
  if (!(isMemberDeclaration(parent) && sameNode(parent.name, name))) {
    return null;
  }
  return suppliesValue(parent) ? WRITE : NONE;
}

/** The roles of any occurrence of a member's name, as find-references reports it: a doc comment's name and a member
 *  declaration's own name do nothing, an object literal's key writes, a destructuring key (`{ a } = o`, `{ a: x } = o`)
 *  reads, `T["k"]` names the member as a key, and any other occurrence takes {@link referenceRoles}. */
export function occurrenceRoles(name: Node): readonly Role[] {
  const { parent } = name;
  if (insideDoc(name)) {
    return NONE;
  }
  const declaring = declaringRoles(name);
  if (declaring !== null) {
    return declaring;
  }
  if (isBindingElement(parent) && (sameNode(parent.propertyName, name) || (parent.propertyName === undefined && sameNode(parent.name, name)))) {
    return READ;
  }
  if (isLiteralTypeNode(parent) && isIndexedAccessTypeNode(parent.parent)) {
    return ["key"];
  }
  return referenceRoles(name);
}

// What a string literal does with its value: builds one, tests one, names a key or a module, or sits in a type.
const LITERAL_ROLES = ["construct", "compare", "case", "key", "type", "module"] as const;
export type LiteralRole = (typeof LITERAL_ROLES)[number];

/** What a reference to a function, a callable member or a tuple does with the value. `define`: an implementation
 *  supplies the member. `test`: a membership method reads it. `parse`: `z.enum` reads it. `escape`: the value
 *  leaves for code a scan cannot follow, so any argument or member may be reached there. */
const VALUE_USES = ["call", "define", "type", "test", "parse", "escape"] as const;
export type ValueUse = (typeof VALUE_USES)[number];

const MEMBERSHIP_METHODS: ReadonlySet<string> = new Set(["includes", "has", "indexOf", "lastIndexOf"]);
const EQUALITY: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.EqualsEqualsEqualsToken,
  SyntaxKind.ExclamationEqualsEqualsToken,
  SyntaxKind.EqualsEqualsToken,
  SyntaxKind.ExclamationEqualsToken,
]);
const REQUIRE = "require";
const ENUM_PARSE = "enum";

const isMembershipArgument = (node: Node, parent: Node): boolean =>
  isCallExpression(parent) &&
  parent.arguments.some((argument) => sameNode(argument, node)) &&
  isPropertyAccessExpression(parent.expression) &&
  MEMBERSHIP_METHODS.has(parent.expression.name.text);

function isModuleSpecifier(node: Node, parent: Node): boolean {
  if (isImportDeclaration(parent) || isExportDeclaration(parent) || isExternalModuleReference(parent)) {
    return true;
  }
  const callee = isCallExpression(parent) ? parent.expression : undefined;
  return (
    callee !== undefined &&
    isCallExpression(parent) &&
    (callee.kind === SyntaxKind.ImportKeyword || (isIdentifier(callee) && callee.text === REQUIRE)) &&
    sameNode(parent.arguments[0], node)
  );
}

function isKeyName(node: Node, parent: Node): boolean {
  if (isComputedPropertyName(parent) || isEnumMember(parent) || (isElementAccessExpression(parent) && sameNode(parent.argumentExpression, node))) {
    return true;
  }
  return (isPropertyAssignment(parent) || isMethodDeclaration(parent) || isPropertySignatureDeclaration(parent)) && sameNode(parent.name, node);
}

// What a value does where it stands: a `case` label, an equality or membership operand, a key, or a construction.
function standingRole(node: Node, parent: Node): Exclude<LiteralRole, "type" | "module"> {
  if (isCaseClause(parent)) {
    return "case";
  }
  if ((isBinaryExpression(parent) && EQUALITY.has(parent.operatorToken.kind)) || isMembershipArgument(node, parent)) {
    return "compare";
  }
  return isKeyName(node, parent) ? "key" : "construct";
}

/** What a string literal does with its value: a module specifier, a literal type, or the role its value takes where it
 *  stands. */
export function literalRole(node: StringLiteral): LiteralRole {
  const { parent } = node;
  if (isModuleSpecifier(node, parent)) {
    return "module";
  }
  return isLiteralTypeNode(parent) ? "type" : standingRole(node, parent);
}

// Positions where a name only labels a type, a declaration or a module binding.
const TYPE_PARENTS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.TypeReference,
  SyntaxKind.TypeQuery,
  SyntaxKind.QualifiedName,
  SyntaxKind.LiteralType,
  SyntaxKind.IndexedAccessType,
  SyntaxKind.ImportSpecifier,
  SyntaxKind.ExportSpecifier,
  SyntaxKind.ImportClause,
  SyntaxKind.NamespaceImport,
  SyntaxKind.PropertySignature,
  SyntaxKind.MethodSignature,
  SyntaxKind.ExpressionWithTypeArguments,
]);

const SYNTAX_ROLES = ["read", "write", "type"] as const;
// Whether a name reads the value it names, stores into it, or only labels a type or declaration. A compound store's
// read is the store's own, so it is a write.
type SyntaxRole = (typeof SYNTAX_ROLES)[number];

const accessRole = (access: Node): SyntaxRole =>
  isBinaryExpression(access.parent) && sameNode(access.parent.left, access) && isAssignment(access.parent.operatorToken.kind) ? "write" : "read";

const isStringLiteralLike = (node: Node): boolean => isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node);

function syntaxRole(node: Node): SyntaxRole {
  const { parent } = node;
  if (isStringLiteralLike(node)) {
    if (isBinaryExpression(parent) && sameNode(parent.left, node) && parent.operatorToken.kind === SyntaxKind.InKeyword) {
      return "read";
    }
    return isElementAccessExpression(parent) && sameNode(parent.argumentExpression, node) ? accessRole(parent) : "type";
  }
  if (TYPE_PARENTS.has(parent.kind)) {
    return "type";
  }
  if (writesByName(parent, node)) {
    return "write";
  }
  return isPropertyAccessExpression(parent) && sameNode(parent.name, node) ? accessRole(parent) : "read";
}

// A key, member or attribute name that gives the member its value where it is written.
const writesByName = (parent: Node, node: Node): boolean =>
  (isPropertyAssignment(parent) ||
    isShorthandPropertyAssignment(parent) ||
    isMethodDeclaration(parent) ||
    isPropertyDeclaration(parent) ||
    isGetAccessorDeclaration(parent) ||
    isSetAccessorDeclaration(parent) ||
    isJsxAttribute(parent)) &&
  sameNode(parent.name, node);

// The value a name stands for: the member access it ends, through parentheses and assertions.
function readValue(name: Node): Node {
  let value = isPropertyAccessExpression(name.parent) && sameNode(name.parent.name, name) ? name.parent : name;
  while (isParenthesizedExpression(value.parent) || isAsExpression(value.parent) || isSatisfiesExpression(value.parent) || isNonNullExpression(value.parent)) {
    value = value.parent;
  }
  return value;
}

/** What a value does where it stands, as {@link literalRole} judges a literal: a `case` label, an equality or
 *  membership operand, a key, or a construction. A member access's name stands for the access, and parentheses and
 *  assertions around the value are climbed first. */
export function valueRole(value: Node): Exclude<LiteralRole, "type" | "module"> {
  const at = readValue(value);
  return standingRole(at, at.parent);
}

/** What a reference to a function, a callable member or a tuple does with the value it names. */
export function valueUse(name: Node): ValueUse {
  const callee = isPropertyAccessExpression(name.parent) && sameNode(name.parent.name, name) ? name.parent : name;
  const site = callee.parent;
  const invoked =
    ((isJsxOpeningElement(site) || isJsxSelfClosingElement(site)) && sameNode(site.tagName, callee)) ||
    ((isCallExpression(site) || isNewExpression(site)) && sameNode(site.expression, callee));
  if (invoked) {
    return "call";
  }
  const role = syntaxRole(name);
  if (role !== "read") {
    return role === "write" ? "define" : "type";
  }
  const value = readValue(name);
  const { parent } = value;
  if (isPropertyAccessExpression(parent) && sameNode(parent.expression, value) && MEMBERSHIP_METHODS.has(parent.name.text) && isCallExpression(parent.parent)) {
    return "test";
  }
  return isCallExpression(parent) && isPropertyAccessExpression(parent.expression) && parent.expression.name.text === ENUM_PARSE ? "parse" : "escape";
}
