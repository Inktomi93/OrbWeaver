// Gate: compose-wiring-only — `entry/compose` wires and owns no business logic (Tier-5-Entry.md invariant 1), so compose runs no
// Drizzle query and no function value it hands out decides on runtime data. SUBJECT: compose, plus any `entry/**` function compose
// reaches by reference (an `entry/auth` factory it calls is judged as compose). ARMS: a drizzle-declared call (`readDrizzleClientCall`,
// fail-closed on an unbound query verb, table via `resolveDrizzleTableRefs`); a per-call decision (branch, loop, catch, `?:`, `&&`/`||`/
// `??`, comparison, `?.`, `Math.max`/`min`, a call dispatched by a computed key) inside a handed-out function or a helper it reaches.
// Construction-time decisions are wiring; D1/D135's exact canonical row projection is identity minting, not admission policy.
// FAMILY: singleton — the timing and canonical projection classifications are this subject's own.
import type { CallExpression, FunctionDeclaration, Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { DrizzleTableRef } from "../../floor/code-facts/drizzle-table-ref.ts";
import { resolveDrizzleTableRefs } from "../../floor/code-facts/drizzle-table-ref.ts";
import { readCalledMember } from "../../floor/code-facts/drizzle-write-chain.ts";
import {
  readMemberReference,
  resolveGlobalMemberOrigin,
  resolveLexicalValueDeclaration,
  resolveModuleMemberOrigin,
} from "../../floor/code-facts/reference-fact.ts";
import { resolveCallableDeclaration } from "../../floor/code-facts/reference-fact-call.ts";
import { defineGate } from "../contract/policy.ts";
import { readDrizzleClientCall } from "../lib/drizzle-client-call.ts";

const ENTRY_POPULATION = { in: ["@server"], under: ["packages/server/src/entry/**"] } as const;
const COMPOSE_PREFIX = "packages/server/src/entry/compose/";
const AUTH_SEAM = "packages/server/src/entry/auth/seam.ts";
const IDENTITY_CONTRACT = "packages/contracts/src/identity/index.ts";
const PRINCIPAL_FIELDS = "packages/server/src/domain/sessions/contract/results.ts";
const IDS_CONTRACT = "packages/kit/src/ids/index.ts";
const PROJECTION_KEYS = ["userId", "role", "handle", "externalId", "via"] as const;

/** The ambient `Math` members that pick between runtime values. */
const CLAMP_MEMBERS = new Set(["max", "min"]);
const MATH_GLOBAL = "Math";

/** Spellings the fail-closed arm reports when the checker cannot bind the called member at all. */
const QUERY_VERBS = new Set(["query", "select", "insert", "update", "delete", "run", "execute", "executeMultiple", "batch", "transaction"]);
const SELECT_VERBS = new Set(["select", "selectDistinct"]);
const FROM_VERB = "from";

/** Array methods that call their callback before returning, so the callback runs in its caller's phase. */
const EAGER_ITERATION = new Set([
  "map",
  "flatMap",
  "filter",
  "forEach",
  "reduce",
  "reduceRight",
  "some",
  "every",
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
  "sort",
  "toSorted",
]);
const TS_LIB_INFIX = "/typescript/lib/lib.";
const UNDEFINED = "undefined";
const SNIPPET_LENGTH = 60;

const DECISION_STATEMENTS = new Set([
  SyntaxKind.IfStatement,
  SyntaxKind.SwitchStatement,
  SyntaxKind.ForStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement,
  SyntaxKind.CatchClause,
  SyntaxKind.ConditionalExpression,
]);

const DECISION_OPERATORS = new Set([
  SyntaxKind.AmpersandAmpersandToken,
  SyntaxKind.BarBarToken,
  SyntaxKind.QuestionQuestionToken,
  SyntaxKind.AmpersandAmpersandEqualsToken,
  SyntaxKind.BarBarEqualsToken,
  SyntaxKind.QuestionQuestionEqualsToken,
  SyntaxKind.EqualsEqualsEqualsToken,
  SyntaxKind.ExclamationEqualsEqualsToken,
  SyntaxKind.EqualsEqualsToken,
  SyntaxKind.ExclamationEqualsToken,
  SyntaxKind.LessThanToken,
  SyntaxKind.LessThanEqualsToken,
  SyntaxKind.GreaterThanToken,
  SyntaxKind.GreaterThanEqualsToken,
  SyntaxKind.InstanceOfKeyword,
  SyntaxKind.InKeyword,
]);

const OPTIONAL_CHAIN_KINDS = new Set([SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression, SyntaxKind.CallExpression]);

const TABLE_LABEL: { readonly [K in DrizzleTableRef["kind"]]: (ref: Extract<DrizzleTableRef, { kind: K }>) => string } = {
  table: (ref) => ref.declaration.getName(),
  imported: (ref) => ref.name,
  "sql-name": (ref) => ref.sqlName,
  subquery: () => "a subquery",
  "raw-sql": () => "raw sql",
  unresolved: () => "an unresolved table",
};

const MESSAGE =
  "an entry/compose module runs a Drizzle query or a function value it hands out carries a rule. Compose only wires: the query and the rule belong to their owning domain, exported from its front door or typed as an injected op in the consumer's contract/ (Tier-5-Entry.md invariant 1).";

const FIX =
  "move the query or the rule into its owning domain and call it from compose; a cross-domain need is an op typed in the consumer's contract/ and wired here. Only while item 964 drains its baseline: `@orb-waive compose-wiring-only(<the reported token>): <reason naming item 964>` on the reported carrier.";

function unwrapParens(node: MorphNode): MorphNode {
  return Node.isParenthesizedExpression(node) ? unwrapParens(node.getExpression()) : node;
}

function isUndefined(node: MorphNode): boolean {
  return Node.isIdentifier(node) && node.getText() === UNDEFINED;
}

/** The value an `x !== undefined` / `x === undefined` test is about, or undefined for any other condition. */
function undefinedTestSubject(condition: MorphNode): { readonly subject: MorphNode; readonly present: boolean } | undefined {
  if (!Node.isBinaryExpression(condition)) {
    return;
  }
  const operator = condition.getOperatorToken().getKind();
  if (!(operator === SyntaxKind.ExclamationEqualsEqualsToken || operator === SyntaxKind.EqualsEqualsEqualsToken)) {
    return;
  }
  const present = operator === SyntaxKind.ExclamationEqualsEqualsToken;
  if (isUndefined(condition.getRight())) {
    return { subject: condition.getLeft(), present };
  }
  return isUndefined(condition.getLeft()) ? { subject: condition.getRight(), present } : undefined;
}

/** The single value an object literal `{ k: v }` (or `{ v }`) carries, or undefined for any other shape. */
function soleValue(node: MorphNode): MorphNode | undefined {
  const object = unwrapParens(node);
  if (!Node.isObjectLiteralExpression(object) || object.getProperties().length !== 1) {
    return;
  }
  const [property] = object.getProperties();
  if (Node.isPropertyAssignment(property)) {
    return property.getInitializer();
  }
  return Node.isShorthandPropertyAssignment(property) ? property.getNameNode() : undefined;
}

function emptyObject(node: MorphNode): boolean {
  const object = unwrapParens(node);
  return Node.isObjectLiteralExpression(object) && object.getProperties().length === 0;
}

/** The exactOptionalPropertyTypes forward: `x !== undefined ? { k: x } : {}` passes a present value on and decides nothing. */
function optionalForward(node: MorphNode): boolean {
  if (!Node.isConditionalExpression(node)) {
    return false;
  }
  const forward = undefinedTestSubject(node.getCondition());
  if (forward === undefined) {
    return false;
  }
  const presentArm = forward.present ? node.getWhenTrue() : node.getWhenFalse();
  const absentArm = forward.present ? node.getWhenFalse() : node.getWhenTrue();
  return emptyObject(absentArm) && soleValue(presentArm)?.getText() === forward.subject.getText();
}

/** Is `node` a decision, and if so which authored node carries it. The forward idiom's own `!== undefined` is part of it. */
function decisionAnchor(node: MorphNode): MorphNode | undefined {
  if (DECISION_STATEMENTS.has(node.getKind())) {
    return optionalForward(node) ? undefined : node;
  }
  if (Node.isBinaryExpression(node) && DECISION_OPERATORS.has(node.getOperatorToken().getKind())) {
    const parent = node.getParent();
    const forwardTest = Node.isConditionalExpression(parent) && parent.getCondition() === node && optionalForward(parent);
    return forwardTest ? undefined : node;
  }
  if (OPTIONAL_CHAIN_KINDS.has(node.getKind()) && node.getFirstChildByKind(SyntaxKind.QuestionDotToken) !== undefined) {
    return node;
  }
  return Node.isCallExpression(node) && (computedDispatch(node) || ambientClamp(node)) ? node : undefined;
}

/** `ARMS[kind](x)`: a call whose callee is picked by a key that is not a literal decides which code runs. */
function computedDispatch(call: CallExpression): boolean {
  const callee = unwrapParens(call.getExpression());
  if (!Node.isElementAccessExpression(callee)) {
    return false;
  }
  const key = callee.getArgumentExpression();
  return !(Node.isStringLiteral(key) || Node.isNumericLiteral(key) || Node.isNoSubstitutionTemplateLiteral(key));
}

/** `Math.max(a, b)` / `Math.min(a, b)` on the ambient global: a clamp picks between values. */
function ambientClamp(call: CallExpression): boolean {
  const callee = unwrapParens(call.getExpression());
  if (!(Node.isPropertyAccessExpression(callee) && CLAMP_MEMBERS.has(callee.getName()))) {
    return false;
  }
  const origin = resolveGlobalMemberOrigin(callee);
  return origin.kind === "resolved" && origin.value.globalName === MATH_GLOBAL && origin.value.memberPath.length === 1;
}

/** A function the code names and calls by that name: a function declaration, or a binding initialized with an arrow/function expression. */
function namedCallable(fn: MorphNode): MorphNode | undefined {
  if (Node.isFunctionDeclaration(fn)) {
    return fn.getNameNode();
  }
  if (!(Node.isArrowFunction(fn) || Node.isFunctionExpression(fn))) {
    return;
  }
  const parent = fn.getParent();
  const bound = Node.isVariableDeclaration(parent) && parent.getInitializer() === fn && Node.isIdentifier(parent.getNameNode());
  return bound ? parent.getNameNode() : undefined;
}

/** The name a function value is handed out under, for the report anchor only. */
function handedOutName(fn: MorphNode): MorphNode | undefined {
  const named = namedCallable(fn);
  if (named !== undefined) {
    return named;
  }
  if (Node.isMethodDeclaration(fn) || Node.isGetAccessorDeclaration(fn) || Node.isSetAccessorDeclaration(fn)) {
    return fn.getNameNode();
  }
  const parent = fn.getParent();
  return Node.isPropertyAssignment(parent) && parent.getInitializer() === fn ? parent.getNameNode() : undefined;
}

function enclosingFunction(node: MorphNode): MorphNode | undefined {
  return node.getFirstAncestor((ancestor) => Node.isFunctionLikeDeclaration(ancestor));
}

/** The call a node sits directly in, skipping parentheses, with the child that occupies the slot. */
function directCall(node: MorphNode): { readonly call: CallExpression; readonly slot: MorphNode } | undefined {
  let slot = node;
  let parent = node.getParent();
  while (Node.isParenthesizedExpression(parent)) {
    slot = parent;
    parent = parent.getParent();
  }
  return Node.isCallExpression(parent) ? { call: parent, slot } : undefined;
}

function declaredInTsLib(call: CallExpression): boolean {
  const member = readCalledMember(call);
  return (
    member.kind === "resolved" &&
    member.value.declarations.length > 0 &&
    member.value.declarations.every((declaration) => declaration.getSourceFile().getFilePath().includes(TS_LIB_INFIX))
  );
}

/** A callback the enclosing code runs before it continues: an IIFE callee or an eager array-method callback. */
function eagerlyInvoked(fn: MorphNode): boolean {
  const site = directCall(fn);
  if (site === undefined) {
    return false;
  }
  if (site.call.getExpression() === site.slot) {
    return true;
  }
  const callee = site.call.getExpression();
  return Node.isPropertyAccessExpression(callee) && EAGER_ITERATION.has(callee.getName()) && declaredInTsLib(site.call);
}

/** Is the identifier the callee of the call it sits in (`helper(x)`), as opposed to a value handed on (`{ op: helper }`)? */
function calledDirectly(identifier: MorphNode): boolean {
  const site = directCall(identifier);
  return site !== undefined && site.call.getExpression() === site.slot;
}

function namesItsParent(identifier: MorphNode, parent: MorphNode): boolean {
  const named =
    Node.isPropertyAssignment(parent) ||
    Node.isMethodDeclaration(parent) ||
    Node.isPropertySignature(parent) ||
    Node.isFunctionDeclaration(parent) ||
    Node.isVariableDeclaration(parent) ||
    Node.isParameterDeclaration(parent) ||
    Node.isBindingElement(parent) ||
    Node.isPropertyAccessExpression(parent);
  return named && parent.getNameNode() === identifier;
}

/** A reference position: not a declaration's own name, not a type, not an import/export specifier, not a member name. */
function referencePosition(identifier: MorphNode): boolean {
  const parent = identifier.getParent();
  if (parent === undefined || Node.isImportSpecifier(parent) || Node.isExportSpecifier(parent) || Node.isImportClause(parent)) {
    return false;
  }
  return !namesItsParent(identifier, parent) && identifier.getFirstAncestor((ancestor) => Node.isTypeNode(ancestor)) === undefined;
}

/** The `.from(<t>)` a `select()` chain reads, walking up the chain from one of its links. */
function fromArgument(link: MorphNode): MorphNode | undefined {
  const access = link.getParent();
  const call = access?.getParent();
  if (!(Node.isPropertyAccessExpression(access) && access.getExpression() === link && Node.isCallExpression(call))) {
    return;
  }
  return access.getName() === FROM_VERB ? call.getArguments()[0] : fromArgument(call);
}

function tableOf(call: CallExpression, method: string): string {
  const argument = SELECT_VERBS.has(method) ? fromArgument(call) : call.getArguments()[0];
  if (argument === undefined) {
    return "an unnamed source";
  }
  const labels = resolveDrizzleTableRefs(argument, () => false).map((ref) => (TABLE_LABEL[ref.kind] as (value: DrizzleTableRef) => string)(ref));
  return [...new Set(labels)].join(" | ");
}

/** The receiver call of a chained call, when the chain continues through it (`a().b()` → `a()`). */
function chainReceiver(call: CallExpression): CallExpression | undefined {
  const callee = call.getExpression();
  if (!(Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee))) {
    return;
  }
  const receiver = unwrapParens(callee.getExpression());
  return Node.isCallExpression(receiver) ? receiver : undefined;
}

/** The query a call starts, or undefined when it is not a Drizzle call or only continues a Drizzle chain. */
function queryHead(call: CallExpression): string | undefined {
  const verdict = readDrizzleClientCall(call);
  const failClosed = verdict.kind === "unresolved" && verdict.method !== null && QUERY_VERBS.has(verdict.method);
  if (!(verdict.kind === "drizzle" || failClosed) || verdict.method === null) {
    return;
  }
  const receiver = chainReceiver(call);
  if (receiver !== undefined && readDrizzleClientCall(receiver).kind === "drizzle") {
    return;
  }
  return failClosed ? `${verdict.method}() on a receiver the checker cannot bind` : `${verdict.method}() on ${tableOf(call, verdict.method)}`;
}

interface Reference {
  readonly target: MorphNode;
  readonly at: MorphNode;
  readonly called: boolean;
}

/** When each function runs, and which functions the gate judges. Compose's own code is judged; an `entry/**` named callable joins when
 *  a judged site references it, and a function nested in a judged one is judged. Named callables run per call when a judged
 *  reference hands them on as a value or calls them from per-call code; every other function value runs per call unless the code
 *  around it invokes it eagerly. Both sets settle together to a fixed point. */
interface Classifier {
  readonly perCall: (fn: MorphNode) => boolean;
  readonly judged: (node: MorphNode) => boolean;
}

function classify(named: ReadonlySet<object>, references: readonly Reference[], inCompose: (node: MorphNode) => boolean): Classifier {
  const perCallNamed = new Set<object>();
  const judgedNamed = new Set<object>();
  const judged = (node: MorphNode): boolean => {
    if (inCompose(node)) {
      return true;
    }
    for (let fn: MorphNode | undefined = Node.isFunctionLikeDeclaration(node) ? node : enclosingFunction(node); fn !== undefined; fn = enclosingFunction(fn)) {
      if (judgedNamed.has(fn.compilerNode)) {
        return true;
      }
    }
    return false;
  };
  const perCall = (fn: MorphNode): boolean => {
    if (named.has(fn.compilerNode)) {
      return perCallNamed.has(fn.compilerNode);
    }
    if (!eagerlyInvoked(fn)) {
      return true;
    }
    const outer = enclosingFunction(fn);
    return outer !== undefined && perCall(outer);
  };
  const settle = (): boolean => {
    let changed = false;
    for (const { target, at, called } of references) {
      if (!judged(at)) {
        continue;
      }
      if (!judgedNamed.has(target.compilerNode)) {
        judgedNamed.add(target.compilerNode);
        changed = true;
      }
      const atFn = enclosingFunction(at);
      if (!perCallNamed.has(target.compilerNode) && (!called || (atFn !== undefined && perCall(atFn)))) {
        perCallNamed.add(target.compilerNode);
        changed = true;
      }
    }
    return changed;
  };
  while (settle()) {
    // Each pass can only add, and both sets are finite, so the loop ends.
  }
  return { perCall, judged };
}

/** A judged decision whose enclosing function runs per call. */
function decidesPerCall(decision: MorphNode, classifier: Classifier, canonicalProjection: (fn: MorphNode) => boolean): boolean {
  const fn = enclosingFunction(decision);
  return fn !== undefined && classifier.perCall(fn) && classifier.judged(decision) && !canonicalProjection(fn);
}

function canonicalReference(node: MorphNode | undefined, home: string, name: string): boolean {
  if (node === undefined) {
    return false;
  }
  const origin = resolveModuleMemberOrigin(Node.isTypeReference(node) ? node.getTypeName() : node);
  return (
    origin.kind === "resolved" &&
    origin.value.canonical.kind === "project" &&
    origin.value.canonical.exportedName === name &&
    origin.value.canonical.sourceFile.getFilePath().endsWith(`/${home}`) &&
    origin.value.memberPath.length === 0
  );
}

function referencesParameter(node: MorphNode | undefined, parameter: MorphNode): boolean {
  if (node === undefined) {
    return false;
  }
  const value = resolveLexicalValueDeclaration(unwrapParens(node));
  return value.kind === "resolved" && value.value.compilerNode === parameter.compilerNode;
}

function rowDefault(node: MorphNode | undefined, parameter: MorphNode, field: string): MorphNode | undefined {
  if (!Node.isBinaryExpression(node) || node.getOperatorToken().getKind() !== SyntaxKind.QuestionQuestionToken) {
    return;
  }
  const read = node.getLeft();
  const member = readMemberReference(read);
  return read.getFirstChildByKind(SyntaxKind.QuestionDotToken) !== undefined &&
    member.kind === "resolved" &&
    member.value.name === field &&
    referencesParameter(member.value.receiver, parameter)
    ? node.getRight()
    : undefined;
}

function literalString(node: MorphNode | undefined, value: string): boolean {
  return Node.isStringLiteral(node) && node.getLiteralText() === value;
}

interface ProjectionParameters {
  readonly userId: MorphNode;
  readonly fields: MorphNode;
}

function projectionParameters(fn: FunctionDeclaration): ProjectionParameters | undefined {
  const params = fn.getParameters();
  const [userId, fields] = params;
  if (params.length !== 2 || userId === undefined || fields === undefined || !canonicalReference(userId.getTypeNode(), IDS_CONTRACT, "UserId")) {
    return;
  }
  const fieldsType = fields.getTypeNode();
  if (!Node.isUnionTypeNode(fieldsType)) {
    return;
  }
  const arms = fieldsType.getTypeNodes();
  if (
    arms.length !== 2 ||
    !arms.some((arm) => canonicalReference(arm, PRINCIPAL_FIELDS, "UserPrincipalFields")) ||
    !arms.some((arm) => Node.isLiteralTypeNode(arm) && arm.getLiteral().getKind() === SyntaxKind.NullKeyword)
  ) {
    return;
  }
  return { userId, fields };
}

function propertyExpression(properties: ReadonlyMap<string, MorphNode>, name: string): MorphNode | undefined {
  const property = properties.get(name);
  if (Node.isPropertyAssignment(property)) {
    return property.getInitializer();
  }
  return Node.isShorthandPropertyAssignment(property) ? property.getNameNode() : undefined;
}

/** D1/D135 classify this exact pure row projection as identity construction, not request admission. */
function canonicalPrincipalProjection(fn: MorphNode): boolean {
  if (
    !(
      Node.isFunctionDeclaration(fn) &&
      fn.getSourceFile().getFilePath().endsWith(`/${AUTH_SEAM}`) &&
      canonicalReference(fn.getReturnTypeNode(), IDENTITY_CONTRACT, "Principal")
    )
  ) {
    return false;
  }
  const name = fn.getNameNode();
  if (name === undefined || name.getText() !== "principalFromRow") {
    return false;
  }
  const identity = resolveCallableDeclaration(name);
  const params = projectionParameters(fn);
  if (identity.kind !== "resolved" || identity.value.declaration.compilerNode !== fn.compilerNode || params === undefined) {
    return false;
  }
  const { userId, fields } = params;
  const statements = fn.getBody()?.getStatements() ?? [];
  const [statement] = statements;
  const value = Node.isReturnStatement(statement) ? statement.getExpression() : undefined;
  if (statements.length !== 1 || !Node.isObjectLiteralExpression(value)) {
    return false;
  }
  const properties = value.getProperties();
  if (
    properties.length !== PROJECTION_KEYS.length ||
    !properties.every((property) => Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property))
  ) {
    return false;
  }
  const byName = new Map(properties.map((property) => [property.getName(), property]));
  const expression = (key: string): MorphNode | undefined => propertyExpression(byName, key);
  const role = rowDefault(expression("role"), fields, "role");
  const externalId = rowDefault(expression("externalId"), fields, "externalId");
  const handle = rowDefault(expression("handle"), fields, "handle");
  if (
    byName.size !== PROJECTION_KEYS.length ||
    !referencesParameter(expression("userId"), userId) ||
    !literalString(role, "user") ||
    externalId?.getKind() !== SyntaxKind.NullKeyword ||
    !literalString(expression("via"), "fallback") ||
    !Node.isCallExpression(handle)
  ) {
    return false;
  }
  const args = handle.getArguments();
  const types = handle.getTypeArguments();
  return (
    args.length === 1 &&
    types.length === 1 &&
    referencesParameter(args[0], userId) &&
    canonicalReference(types[0], IDS_CONTRACT, "Handle") &&
    canonicalReference(handle.getExpression(), IDS_CONTRACT, "castId")
  );
}

interface Subject {
  readonly anchor: MorphNode;
  query?: string;
  decision?: MorphNode;
}

/** The function a finding belongs to: the outermost per-call function around `node`, else the construction-time function, else `node`. */
function subjectKey(node: MorphNode, perCall: (fn: MorphNode) => boolean): MorphNode {
  let fn = enclosingFunction(node);
  if (fn !== undefined && perCall(fn)) {
    for (let outer = enclosingFunction(fn); outer !== undefined && perCall(outer); outer = enclosingFunction(outer)) {
      fn = outer;
    }
    return fn;
  }
  while (fn !== undefined && eagerlyInvoked(fn)) {
    fn = enclosingFunction(fn);
  }
  return fn ?? node;
}

function subjectMessage(subject: Subject): string {
  const parts: string[] = [];
  if (subject.query !== undefined) {
    parts.push(`runs a Drizzle query: ${subject.query}`);
  }
  if (subject.decision !== undefined) {
    const snippet = (subject.decision.getText().split("\n")[0] ?? "").slice(0, SNIPPET_LENGTH);
    parts.push(`decides per call: \`${snippet}\` at line ${subject.decision.getStartLineNumber()}`);
  }
  return `compose ${parts.join("; ")}. ${MESSAGE}`;
}

const DRIZZLE_FILE = "node_modules/drizzle-orm/index.ts";
const DRIZZLE =
  "export declare class Builder {\n  values(v: unknown): Builder;\n  where(w: unknown): Builder;\n}\nexport declare class Db {\n  insert(t: unknown): Builder;\n  select(shape?: unknown): { from(t: unknown): Builder };\n}\n";
const SCHEMA_FILE = "packages/db/src/schema/chats.ts";
const SCHEMA = 'export declare const chats: { readonly _: { readonly brand: "Table"; readonly name: "chats" } };\n';
const DB_PRELUDE = 'import type { Db } from "drizzle-orm";\nimport { chats } from "../../../../db/src/schema/chats.ts";\n';
const COMPOSE_FILE = "packages/server/src/entry/compose/x.ts";
const PRINCIPAL_TYPE_FILES = {
  [IDS_CONTRACT]:
    'declare const brand: unique symbol;\nexport type UserId = string & { readonly [brand]: "UserId" };\nexport type Handle = string & { readonly [brand]: "Handle" };\nexport type ExternalId = string & { readonly [brand]: "ExternalId" };\nexport declare function castId<T extends string>(raw: string): T;\n',
  [IDENTITY_CONTRACT]:
    'import type { UserId, Handle, ExternalId } from "../../../kit/src/ids/index.ts";\nexport type UserRole = "owner" | "admin" | "user";\nexport interface Principal { userId: UserId; role: UserRole; handle: Handle; externalId: ExternalId | null; via: "cookie" | "header" | "fallback"; }\n',
  [PRINCIPAL_FIELDS]:
    'import type { Handle, ExternalId } from "../../../../../kit/src/ids/index.ts";\nimport type { UserRole } from "../../../../../contracts/src/identity/index.ts";\nexport interface UserPrincipalFields { role: UserRole; handle: Handle; externalId: ExternalId | null; enabled: boolean; }\n',
};
const PRINCIPAL_IMPORTS =
  'import type { Principal } from "../../../../contracts/src/identity/index.ts";\nimport type { UserId, Handle } from "../../../../kit/src/ids/index.ts";\nimport { castId } from "../../../../kit/src/ids/index.ts";\nimport type { UserPrincipalFields } from "../../domain/sessions/contract/results.ts";\n';
const PRINCIPAL_MAPPER =
  'function principalFromRow(userId: UserId, fields: UserPrincipalFields | null): Principal {\n  return { userId, role: fields?.role ?? "user", handle: fields?.handle ?? castId<Handle>(userId), externalId: fields?.externalId ?? null, via: "fallback" };\n}\n';
const PRINCIPAL_BRIDGE = "export function bridge(userId: UserId, fields: UserPrincipalFields | null): Principal { return principalFromRow(userId, fields); }\n";
const PRINCIPAL_COMPOSE = 'import { bridge } from "../auth/seam.ts";\nexport function build() { return { principal: bridge }; }\n';

export const gate = defineGate({
  id: "compose-wiring-only",
  family: "compose-wiring-only",
  authority: "ordinary",
  severity: "error",
  population: ENTRY_POPULATION,
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const decisions: MorphNode[] = [];
    const calls: CallExpression[] = [];
    const identifiers: MorphNode[] = [];
    const callables = new Map<string, MorphNode[]>();
    const subjects = new Map<object, Subject>();
    const subjectOf = (node: MorphNode, perCall: (fn: MorphNode) => boolean): Subject => {
      const key = subjectKey(node, perCall);
      const existing = subjects.get(key.compilerNode);
      if (existing !== undefined) {
        return existing;
      }
      const subject: Subject = { anchor: (key === node ? undefined : handedOutName(key)) ?? key };
      subjects.set(key.compilerNode, subject);
      return subject;
    };
    const references = (named: ReadonlySet<object>): readonly Reference[] =>
      identifiers.flatMap((identifier) => {
        if (!(callables.has(identifier.getText()) && referencePosition(identifier))) {
          return [];
        }
        const callable = resolveCallableDeclaration(identifier);
        return callable.kind === "resolved" && named.has(callable.value.declaration.compilerNode)
          ? [{ target: callable.value.declaration, at: identifier, called: calledDirectly(identifier) }]
          : [];
      });
    return {
      visitors: [
        {
          kinds: [...DECISION_STATEMENTS, SyntaxKind.BinaryExpression, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
          visit: (node) => {
            const anchor = decisionAnchor(node);
            if (anchor !== undefined) {
              decisions.push(anchor);
            }
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node) => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            calls.push(node);
            const anchor = decisionAnchor(node);
            if (anchor !== undefined) {
              decisions.push(anchor);
            }
          },
        },
        {
          kinds: [SyntaxKind.FunctionDeclaration, SyntaxKind.ArrowFunction, SyntaxKind.FunctionExpression],
          visit: (node) => {
            const name = namedCallable(node)?.getText();
            if (name !== undefined) {
              callables.set(name, [...(callables.get(name) ?? []), node]);
            }
          },
        },
        { kinds: [SyntaxKind.Identifier], visit: (node) => void identifiers.push(node) },
      ],
      evaluate: () => {
        const named = new Set<object>([...callables.values()].flat().map((fn) => fn.compilerNode));
        const inCompose = (node: MorphNode): boolean => ctx.relativePath(node.getSourceFile()).startsWith(COMPOSE_PREFIX);
        const { perCall, judged } = classify(named, references(named), inCompose);
        const projections = new Map<object, boolean>();
        const canonicalProjection = (fn: MorphNode): boolean => {
          const known = projections.get(fn.compilerNode);
          if (known !== undefined) {
            return known;
          }
          const admitted = canonicalPrincipalProjection(fn);
          projections.set(fn.compilerNode, admitted);
          return admitted;
        };
        for (const decision of decisions) {
          if (decidesPerCall(decision, { perCall, judged }, canonicalProjection)) {
            subjectOf(decision, perCall).decision ??= decision;
          }
        }
        for (const call of calls) {
          const query = judged(call) ? queryHead(call) : undefined;
          if (query !== undefined) {
            subjectOf(call, perCall).query ??= query;
          }
        }
        for (const subject of subjects.values()) {
          ctx.report.node(subject.anchor, { message: subjectMessage(subject) });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        ...PRINCIPAL_TYPE_FILES,
        "packages/server/src/entry/auth/other.ts": `${PRINCIPAL_IMPORTS}${PRINCIPAL_MAPPER}${PRINCIPAL_BRIDGE}`,
        [COMPOSE_FILE]: PRINCIPAL_COMPOSE.replace("seam.ts", "other.ts"),
      },
      expect: { count: 1, token: "principalFromRow", messageIncludes: "decides per call" },
      why: "a same-named pure Principal mapper outside the canonical auth seam is not the D1 mint; removing the declaration-home fence admits it",
    },
    {
      mode: "types",
      files: {
        ...PRINCIPAL_TYPE_FILES,
        [AUTH_SEAM]: `${PRINCIPAL_IMPORTS}${PRINCIPAL_MAPPER.replace('?? "user"', '?? "owner"')}${PRINCIPAL_BRIDGE}`,
        [COMPOSE_FILE]: PRINCIPAL_COMPOSE,
      },
      expect: { count: 1, token: "principalFromRow", messageIncludes: "decides per call" },
      why: "the canonical name/home cannot admit a changed authority grant instead of D135's absent-row user floor",
    },
    {
      mode: "types",
      files: {
        ...PRINCIPAL_TYPE_FILES,
        [AUTH_SEAM]: `${PRINCIPAL_IMPORTS}${PRINCIPAL_MAPPER.replace("  return {", '  if (!fields?.enabled) { throw new Error("disabled"); }\n  return {')}${PRINCIPAL_BRIDGE}`,
        [COMPOSE_FILE]: PRINCIPAL_COMPOSE,
      },
      expect: { count: 1, token: "principalFromRow", messageIncludes: "decides per call" },
      why: "an added request admission branch is policy even in the canonical mapper; only the pure single-return projection is admitted",
    },
    {
      mode: "types",
      files: {
        ...PRINCIPAL_TYPE_FILES,
        [DRIZZLE_FILE]: DRIZZLE,
        [SCHEMA_FILE]: SCHEMA,
        [AUTH_SEAM]: `${PRINCIPAL_IMPORTS}import { Db } from "drizzle-orm";\nimport { chats } from "../../../../db/src/schema/chats.ts";\n${PRINCIPAL_MAPPER.replace("  return {", "  new Db().select().from(chats);\n  return {")}${PRINCIPAL_BRIDGE}`,
        [COMPOSE_FILE]: PRINCIPAL_COMPOSE,
      },
      expect: { count: 1, token: "principalFromRow", messageIncludes: "runs a Drizzle query" },
      why: "a query added inside the mapper remains reportable; canonical identity never disables the query arm",
    },
    {
      mode: "types",
      files: {
        ...PRINCIPAL_TYPE_FILES,
        [AUTH_SEAM]: `${PRINCIPAL_IMPORTS}${PRINCIPAL_MAPPER}function admission(fields: UserPrincipalFields | null) { return fields?.enabled === true; }\n${PRINCIPAL_BRIDGE.replace("return principalFromRow", "admission(fields); return principalFromRow")}`,
        [COMPOSE_FILE]: PRINCIPAL_COMPOSE,
      },
      expect: { count: 1, token: "admission", messageIncludes: "=== true" },
      why: "an arbitrary auth helper reached beside the admitted mapper remains policy; the seam is not a file exemption",
    },
    {
      mode: "types",
      files: {
        ...PRINCIPAL_TYPE_FILES,
        [DRIZZLE_FILE]: DRIZZLE,
        [SCHEMA_FILE]: SCHEMA,
        [AUTH_SEAM]: `${PRINCIPAL_IMPORTS}import { Db } from "drizzle-orm";\nimport { chats } from "../../../../db/src/schema/chats.ts";\n${PRINCIPAL_MAPPER}${PRINCIPAL_BRIDGE.replace("return principalFromRow", "new Db().select().from(chats); return principalFromRow")}`,
        [COMPOSE_FILE]: PRINCIPAL_COMPOSE,
      },
      expect: { count: 1, token: "bridge", messageIncludes: "runs a Drizzle query" },
      why: "queries elsewhere in the reached auth file remain live even when its canonical mapper is admitted",
    },
    {
      mode: "types",
      files: {
        ...PRINCIPAL_TYPE_FILES,
        [AUTH_SEAM]: `${PRINCIPAL_IMPORTS.replace('"../../../../contracts/src/identity/index.ts"', '"./lookalike.ts"')}${PRINCIPAL_MAPPER}${PRINCIPAL_BRIDGE}`,
        "packages/server/src/entry/auth/lookalike.ts": "export interface Principal { role: string; }\n",
        [COMPOSE_FILE]: PRINCIPAL_COMPOSE,
      },
      expect: { count: 1, token: "principalFromRow", messageIncludes: "decides per call" },
      why: "a same-spelled but foreign Principal annotation proves no canonical authority construction",
    },
    {
      mode: "types",
      files: {
        ...PRINCIPAL_TYPE_FILES,
        [AUTH_SEAM]: `${PRINCIPAL_IMPORTS.replace('"../../domain/sessions/contract/results.ts"', '"./missing.ts"')}${PRINCIPAL_MAPPER}${PRINCIPAL_BRIDGE}`,
        [COMPOSE_FILE]: PRINCIPAL_COMPOSE,
      },
      expect: { count: 1, token: "principalFromRow", messageIncludes: "decides per call" },
      why: "unresolved row-fields provenance cannot admit the projection merely because the imported type has the right name",
    },
    {
      mode: "types",
      files: {
        ...PRINCIPAL_TYPE_FILES,
        [AUTH_SEAM]: `${PRINCIPAL_IMPORTS.replace('import { castId } from "../../../../kit/src/ids/index.ts";', 'import { castId } from "./lookalike.ts";')}${PRINCIPAL_MAPPER}${PRINCIPAL_BRIDGE}`,
        "packages/server/src/entry/auth/lookalike.ts": "export declare function castId<T extends string>(raw: string): T;\n",
        [COMPOSE_FILE]: PRINCIPAL_COMPOSE,
      },
      expect: { count: 1, token: "principalFromRow", messageIncludes: "decides per call" },
      why: "a lookalike cast helper cannot borrow the canonical mapper's permission",
    },
    {
      mode: "types",
      files: {
        [DRIZZLE_FILE]: DRIZZLE,
        [SCHEMA_FILE]: SCHEMA,
        [COMPOSE_FILE]: `${DB_PRELUDE}export function build(db: Db) {\n  const rows = db.select().from(chats);\n  return { rows };\n}\n`,
      },
      expect: { count: 1, token: "build", messageIncludes: "runs a Drizzle query: select() on chats" },
      why: "the query arm at construction time: a factory body that runs a select names the factory, and the table comes from the shared table-ref resolver",
    },
    {
      mode: "types",
      files: {
        [DRIZZLE_FILE]: DRIZZLE,
        [SCHEMA_FILE]: SCHEMA,
        [COMPOSE_FILE]: `${DB_PRELUDE}export function build(db: Db) {\n  return { write: (id: string) => db.insert(chats).values({ id }) };\n}\n`,
      },
      expect: { count: 1, token: "write", messageIncludes: "runs a Drizzle query: insert() on chats" },
      why: "the query arm inside a handed-out op: the finding names the op, and the chain's `values` link does not report a second query",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]: "export function build(db: Record<string, (table: unknown) => unknown>) {\n  return { read: () => db.select({}) };\n}\n",
      },
      expect: { count: 1, token: "read", messageIncludes: "cannot bind" },
      why: "FAIL-CLOSED: an index-signature receiver gives the checker no member declaration, so a query-verb spelling is reported rather than admitted",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          "export function build(load: (id: string) => Promise<string>) {\n  return {\n    read: async (id: string) => {\n      if (id.length === 0) {\n        return null;\n      }\n      return load(id);\n    },\n  };\n}\n",
      },
      expect: { count: 1, token: "read", messageIncludes: "decides per call" },
      why: "the founding rule shape: a handed-out op branches on its own runtime argument; one finding per op, not per decision",
    },
    {
      mode: "types",
      files: { [COMPOSE_FILE]: 'export function build(load: (id: string) => string) {\n  return { read: (id?: string) => load(id ?? "self") };\n}\n' },
      expect: { count: 1, token: "read", messageIncludes: "id ?? " },
      why: "`??` inside a handed-out op picks between runtime values, so it is a decision; the construction-time `??` row in mustPass is its counterpart",
    },
    {
      mode: "types",
      files: { [COMPOSE_FILE]: "export function build() {\n  return { name: (row?: { readonly name: string }) => row?.name };\n}\n" },
      expect: { count: 1, token: "name", messageIncludes: "decides per call" },
      why: "an optional chain inside a handed-out op is a decision on runtime data",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          "function pick(score: number): number {\n  return score > 1 ? score : 0;\n}\nexport function build() {\n  return { op: (score: number) => pick(score) };\n}\n",
      },
      expect: { count: 1, token: "pick", messageIncludes: "decides per call" },
      why: "REACHABILITY: a named helper called from a handed-out op runs per call; the op itself holds no decision, so the helper is the finding",
    },
    {
      mode: "types",
      files: { [COMPOSE_FILE]: "const pick = (score: number): number => (score > 1 ? score : 0);\nexport function build() {\n  return { op: pick };\n}\n" },
      expect: { count: 1, token: "pick", messageIncludes: "decides per call" },
      why: "a named helper handed on as a value is a handed-out function, even though no compose code calls it",
    },
    {
      mode: "types",
      files: { [COMPOSE_FILE]: "export function build() {\n  return { keep: (xs: readonly number[]) => xs.filter((x) => x > 1) };\n}\n" },
      expect: { count: 1, token: "keep", messageIncludes: "x > 1" },
      why: "an eager array callback runs in its caller's phase: inside a handed-out op its predicate is that op's rule, reported once at the op",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/entry/auth/x.ts":
          "export function createResolveEnabled(load: (id: string) => Promise<{ readonly enabled: boolean } | null>) {\n  return async (id: string) => (await load(id))?.enabled === true;\n}\n",
        [COMPOSE_FILE]:
          'import { createResolveEnabled } from "../auth/x.ts";\nexport function build(load: (id: string) => Promise<{ readonly enabled: boolean } | null>) {\n  return { enabled: createResolveEnabled(load) };\n}\n',
      },
      expect: { count: 1, token: "async", messageIncludes: "=== true" },
      why: "REACH ACROSS entry/: a factory compose calls from another entry module hands out a per-call decision, so it is judged as compose; cutting the cross-file reach reds this row",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          'const ARMS = { a: (n: number) => n, b: (n: number) => -n } as const;\nexport function build() {\n  return { run: (kind: "a" | "b", n: number) => ARMS[kind](n) };\n}\n',
      },
      expect: { count: 1, token: "run", messageIncludes: "ARMS[kind](n)" },
      why: "RECORD DISPATCH: a call through a computed key picks which code runs per call, so it is a decision",
    },
    {
      mode: "types",
      files: { [COMPOSE_FILE]: "export function build() {\n  return { cap: (n: number) => Math.min(n, 10) };\n}\n" },
      expect: { count: 1, token: "cap", messageIncludes: "Math.min" },
      why: "CLAMP: the ambient Math.min picks between runtime values inside a handed-out op",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { ...PRINCIPAL_TYPE_FILES, [AUTH_SEAM]: `${PRINCIPAL_IMPORTS}${PRINCIPAL_MAPPER}${PRINCIPAL_BRIDGE}`, [COMPOSE_FILE]: PRINCIPAL_COMPOSE },
      why: "D1/D135's one row-derived mint remains at the auth seam, with its absent-row user floor and no admission decision",
    },
    {
      mode: "types",
      files: {
        ...PRINCIPAL_TYPE_FILES,
        [AUTH_SEAM]: `${PRINCIPAL_IMPORTS.replace("{ Principal }", "{ Principal as Caller }").replace("{ castId }", "{ castId as brandId }")}${PRINCIPAL_MAPPER.replace(": Principal", ": Caller").replace("castId<", "brandId<")}${PRINCIPAL_BRIDGE.replace(": Principal", ": Caller")}`,
        [COMPOSE_FILE]: PRINCIPAL_COMPOSE,
      },
      why: "canonical declaration identity survives import aliases; names alone neither admit nor accuse the projection",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          'const ARMS = { a: (n: number) => n } as const;\nexport function build() {\n  const cap = Math.max(1, 2);\n  return { run: (n: number) => ARMS["a"](n) + cap };\n}\n',
      },
      why: "a literal-key element call names one callee, and a clamp in the factory body runs once at construction; neither is a per-call decision",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/entry/http/x.ts":
          "export function register(app: { get: (h: (id: string) => boolean) => void }) {\n  app.get((id) => id.length > 0);\n}\n",
        [COMPOSE_FILE]: "export function build(op: () => void) {\n  return { op };\n}\n",
      },
      why: "POPULATION FENCE: an entry/ module compose never references keeps its own rules out of this subject; judging every entry/ function reds this row",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          "export function build(env: { readonly on: boolean }, real: () => void) {\n  if (env.on) {\n    real();\n  }\n  const op = env.on ? real : (): void => undefined;\n  return { op };\n}\n",
      },
      why: "WIRING: an `if` and a `?:` in the factory body run once while compose is built, on config; deleting the phase test reds this row",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]: "export function build(deps: { readonly limit?: number }) {\n  const limit = deps.limit ?? 1;\n  return { op: () => limit };\n}\n",
      },
      why: "the `??` counterpart: defaulting an optional dep in the factory body is construction-time wiring selection",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          "export function build(send: (o: { readonly tag?: string }) => void) {\n  return { op: (tag?: string) => send({ ...(tag !== undefined ? { tag } : {}) }) };\n}\n",
      },
      why: "the one exemption: the exactOptionalPropertyTypes forward passes a present value on and decides nothing, including its `!== undefined` test",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]: "export function build(sizes: readonly number[]) {\n  const big = sizes.filter((size) => size > 1);\n  return { op: () => big };\n}\n",
      },
      why: "an eager array callback in the factory body runs at construction; treating every arrow as handed out reds this row",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          "function pick(score: number): number {\n  return score > 1 ? score : 0;\n}\nexport function build() {\n  const chosen = pick(2);\n  return { op: () => chosen };\n}\n",
      },
      why: "a named helper only called from the factory body runs at construction, so its decision is wiring",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          "class Cache {\n  select(value: unknown): unknown {\n    return value;\n  }\n}\nexport function build(cache: Cache) {\n  return { op: () => cache.select({}) };\n}\n",
      },
      why: "IDENTITY: a same-named `select` declared by a local class is not a Drizzle query; deleting the drizzle-declaration test reds this row",
    },
    {
      mode: "types",
      files: {
        [DRIZZLE_FILE]: DRIZZLE,
        [SCHEMA_FILE]: SCHEMA,
        [COMPOSE_FILE]: "export function build(op: () => void) {\n  return { op };\n}\n",
        "packages/server/src/domain/x/persistence/q.ts":
          'import type { Db } from "drizzle-orm";\nimport { chats } from "../../../../../db/src/schema/chats.ts";\nexport function read(db: Db, id: string) {\n  return id.length > 0 ? db.select().from(chats) : [];\n}\n',
      },
      why: "POPULATION: a query and a decision in a domain module are outside the compose subject, beside an admitted compose anchor",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          'export function build(load: (id: string) => string) {\n  // @orb-waive compose-wiring-only(read): baselined while item 964 moves compose rules into their domains.\n  return { read: (id: string) => (id.length > 0 ? load(id) : "") };\n}\n',
      },
      why: "the ordinary waiver door at the reported op name, the form the item 964 baseline uses",
    },
  ],
});
