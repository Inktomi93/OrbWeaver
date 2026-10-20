// Gate: compose-wiring-only — Tier-5 compose wires; its reached entry helpers cannot hide business decisions.
// SUBJECT: compose and entry callables reached by reference. ARMS: per-call branches/loops/catches/operators/optional chains/clamps/computed dispatch.
// Construction and native graph-lifetime decisions are wiring; the exact D1/D135 row mint and resolved Tier-5 bucket policy retain their ownership.
// FAMILY: singleton — the walk nominates exact syntax; callable, origin, member and lifetime answers come from the importing native world.
import type { CallExpression, FunctionDeclaration, Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { referenceResolutionServices } from "../../floor/code-facts/reference-fact.ts";
import { isReferenceWriteTarget } from "../../floor/code-facts/reference-fact-writes.ts";
import type { ComposeReadDemand, ComposeReads } from "../contract/compose-wiring.ts";
import { defineGate } from "../contract/policy.ts";
import { composeNativeReads, unsupportedComposeQuestion } from "../lib/compose-native.ts";

const ENTRY_POPULATION = { in: ["@server"], under: ["packages/server/src/entry/**"] } as const;
const COMPOSE_PREFIX = "packages/server/src/entry/compose/";
const AUTH_SEAM = "packages/server/src/entry/auth/seam.ts";
const IDENTITY_CONTRACT = "packages/contracts/src/identity/index.ts";
const PRINCIPAL_FIELDS = "packages/server/src/domain/sessions/contract/results.ts";
const IDS_CONTRACT = "packages/kit/src/ids/index.ts";
const ROLE_DATA = "packages/server/src/primitives/role-data/index.ts";
const PRINCIPAL_MINT = "packages/server/src/entry/auth/principal-mint.ts";
const RATE_POLICY = "packages/server/src/entry/rate-limit-gate.ts";
const RATE_LIMITER = "packages/server/src/transport/rate-limit.ts";
const RATE_PORT = "packages/server/src/transport/trpc/context.ts";
const PROJECTION_KEYS = ["userId", "role", "handle", "externalId", "via"] as const;
/** The two files whose owned constructs this gate admits by canonical module identity. */
const OWNER_HOMES = [AUTH_SEAM, RATE_POLICY] as const;

/** The ambient `Math` members that pick between runtime values. */
const CLAMP_MEMBERS = new Set(["max", "min"]);
const MATH_GLOBAL = "Math";
const DEFER_MEMBER = "defer";
const CONSUME_MEMBER = "consume";

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
/** Members whose declaring library decides a phase or an ownership, so their native declarations are nominated. */
const DECLARED_MEMBERS = new Set([...EAGER_ITERATION, DEFER_MEMBER, CONSUME_MEMBER]);
const TS_LIB_INFIX = "/typescript/lib/lib.";
const DISPOSAL_STACKS = new Set(["DisposableStack", "AsyncDisposableStack"]);
const DISPOSAL_KEYS = new Set(["dispose", "asyncDispose"]);
const UNDEFINED = "undefined";
const SNIPPET_LENGTH = 60;
const UNKNOWN_SITE = "compose cannot establish this site natively";

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

const MESSAGE =
  "a function value an entry/compose module hands out carries a rule. Compose only wires: the rule belongs to its owning domain, exported from its front door or typed as an injected op in the consumer's contract/ (Tier-5-Entry.md invariant 1).";

const FIX =
  "move the rule into its owning domain and call it from compose; a cross-domain need is an op typed in the consumer's contract/ and wired here. Only while item 964 drains its baseline: `@orb-waive compose-wiring-only(<the reported token>): <reason naming item 964>` on the reported carrier.";

// The one transparent-wrapper rule (parentheses, as, satisfies, !): nomination and evaluation read through the same unwrap.
function unwrap(node: MorphNode): MorphNode {
  return referenceResolutionServices.unwrapExpression(node);
}

/** Does `parent` only wrap `child` under the same rule, so a slot reads through it? */
function transparentWrapper(parent: MorphNode | undefined, child: MorphNode): parent is MorphNode {
  return parent !== undefined && parent !== child && unwrap(parent) === unwrap(child);
}

/** The outermost transparent wrapper around `node`: the node a parent's slot actually holds. */
function outermost(node: MorphNode): MorphNode {
  let current = node;
  for (let parent = current.getParent(); transparentWrapper(parent, current); parent = current.getParent()) {
    current = parent;
  }
  return current;
}

/** The parent of a node's outermost wrapper, so a structural guard never sees a wrapped slot. */
function slotParent(node: MorphNode): MorphNode | undefined {
  return outermost(node).getParent();
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
  const object = unwrap(node);
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
  const object = unwrap(node);
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

/** Is `node` a decision syntax alone settles, and if so which authored node carries it. The forward idiom's own `!== undefined` is part of it. */
function syntacticDecision(node: MorphNode): MorphNode | undefined {
  if (DECISION_STATEMENTS.has(node.getKind())) {
    return optionalForward(node) ? undefined : node;
  }
  if (Node.isBinaryExpression(node) && DECISION_OPERATORS.has(node.getOperatorToken().getKind())) {
    const parent = node.getParent();
    const forwardTest = Node.isConditionalExpression(parent) && parent.getCondition() === node && optionalForward(parent);
    return forwardTest ? undefined : node;
  }
  return OPTIONAL_CHAIN_KINDS.has(node.getKind()) && node.getFirstChildByKind(SyntaxKind.QuestionDotToken) !== undefined ? node : undefined;
}

function literalKey(key: MorphNode): boolean {
  return Node.isStringLiteral(key) || Node.isNumericLiteral(key) || Node.isNoSubstitutionTemplateLiteral(key);
}

/** A member call can be computed dispatch or an ambient clamp reached through an alias; its native meaning settles it at evaluate. */
function typedDecisionCandidate(call: CallExpression): boolean {
  const callee = unwrap(call.getExpression());
  return Node.isElementAccessExpression(callee) || Node.isPropertyAccessExpression(callee);
}

function typedDecision(call: CallExpression, reads: ComposeReads): boolean {
  return computedDispatch(call, reads) || ambientClamp(call, reads);
}

/** `ARMS[kind](x)`: a call whose callee is picked by a key that is not a literal decides which code runs. */
function computedDispatch(call: CallExpression, reads: ComposeReads): boolean {
  const callee = unwrap(call.getExpression());
  if (!Node.isElementAccessExpression(callee)) {
    return false;
  }
  const key = callee.getArgumentExpression();
  return !(key !== undefined && (literalKey(unwrap(key)) || nativeDisposalKey(key, reads)));
}

// A literal key names a string member, never a well-known symbol, so it is never nominated.
function nativeDisposalKey(node: MorphNode | undefined, reads: ComposeReads): boolean {
  if (node === undefined || literalKey(unwrap(node))) {
    return false;
  }
  const origin = reads.globalOrigin(node);
  return (
    origin.kind === "resolved" &&
    origin.value.globalName === "Symbol" &&
    origin.value.memberPath.length === 1 &&
    DISPOSAL_KEYS.has(origin.value.memberPath[0] ?? "")
  );
}

/** `Math.max(a, b)` / `Math.min(a, b)` on the ambient global: a clamp picks between values. */
function ambientClamp(call: CallExpression, reads: ComposeReads): boolean {
  const callee = unwrap(call.getExpression());
  if (!(Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee))) {
    return false;
  }
  // The origin reader resolves `Math.min` and `Math["min"]` to the same member path.
  const origin = reads.globalOrigin(callee);
  return (
    origin.kind === "resolved" &&
    origin.value.globalName === MATH_GLOBAL &&
    origin.value.memberPath.length === 1 &&
    CLAMP_MEMBERS.has(origin.value.memberPath[0] ?? "")
  );
}

/** A function the code names and calls by that name: a function declaration, or a binding initialized with an arrow/function expression. */
function namedCallable(fn: MorphNode): MorphNode | undefined {
  if (Node.isFunctionDeclaration(fn)) {
    return fn.getNameNode();
  }
  if (!(Node.isArrowFunction(fn) || Node.isFunctionExpression(fn))) {
    return;
  }
  const parent = slotParent(fn);
  const bound = Node.isVariableDeclaration(parent) && parent.getInitializer() === outermost(fn) && Node.isIdentifier(parent.getNameNode());
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
  const parent = slotParent(fn);
  return Node.isPropertyAssignment(parent) && parent.getInitializer() === outermost(fn) ? parent.getNameNode() : undefined;
}

function enclosingFunction(node: MorphNode): MorphNode | undefined {
  return node.getFirstAncestor((ancestor) => Node.isFunctionLikeDeclaration(ancestor));
}

/** The call a node sits directly in, skipping transparent wrappers, with the child that occupies the slot. */
function directCall(node: MorphNode): { readonly call: CallExpression; readonly slot: MorphNode } | undefined {
  let slot = node;
  let parent = node.getParent();
  while (transparentWrapper(parent, slot)) {
    slot = parent;
    parent = parent.getParent();
  }
  return Node.isCallExpression(parent) ? { call: parent, slot } : undefined;
}

function declaredInTsLib(call: CallExpression, reads: ComposeReads): boolean {
  const member = reads.calledMember(call);
  return (
    member.kind === "resolved" &&
    member.value.length > 0 &&
    member.value.every((declaration) => declaration.getSourceFile().getFilePath().includes(TS_LIB_INFIX))
  );
}

/** Require the native constructor value, not a stack-shaped annotation or caller-supplied object. */
function nativeDisposalStack(node: MorphNode, reads: ComposeReads, active: Set<object> = new Set()): boolean {
  const value = unwrap(node);
  if (active.has(value.compilerNode)) {
    return false;
  }
  active.add(value.compilerNode);
  if (Node.isNewExpression(value)) {
    const origin = reads.globalOrigin(value.getExpression());
    return origin.kind === "resolved" && DISPOSAL_STACKS.has(origin.value.globalName) && origin.value.memberPath.length === 0;
  }
  if (!Node.isIdentifier(value) || reads.writes(value).kind !== "resolved") {
    return false;
  }
  const binding = reads.binding(value);
  const initializer = binding.kind === "resolved" && Node.isVariableDeclaration(binding.value) ? binding.value.getInitializer() : undefined;
  return initializer !== undefined && nativeDisposalStack(initializer, reads, active);
}

/** Language lifetime retention is a separate phase; independent business escapes remain judged. */
function lifetimeSlot(node: MorphNode, reads: ComposeReads): boolean {
  const parent = slotParent(node);
  if (Node.isPropertyAssignment(parent) && parent.getInitializer() === outermost(node)) {
    const key = parent.getNameNode();
    return Node.isComputedPropertyName(key) && nativeDisposalKey(key.getExpression(), reads);
  }
  if (Node.isMethodDeclaration(node)) {
    const key = node.getNameNode();
    return Node.isComputedPropertyName(key) && nativeDisposalKey(key.getExpression(), reads);
  }
  const site = directCall(node);
  if (site === undefined || site.call.getArguments()[0] !== site.slot || site.call.getArguments().length !== 1) {
    return false;
  }
  const member = reads.member(site.call.getExpression());
  return (
    member.kind === "resolved" && member.value.name === DEFER_MEMBER && declaredInTsLib(site.call, reads) && nativeDisposalStack(member.value.receiver, reads)
  );
}

/** The sanctioned bucket selector is a pure membership projection over its own immutable literal map. */
function bucketSelector(call: CallExpression, factory: FunctionDeclaration, reads: ComposeReads): boolean {
  const callee = unwrap(call.getExpression());
  // The selector is a named function declaration, so only a reference-position callee can denote it.
  if (!(referencePosition(callee) && (Node.isIdentifier(callee) || Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee)))) {
    return false;
  }
  const target = reads.callable(callee);
  if (target.kind !== "resolved" || !Node.isFunctionDeclaration(target.value.declaration)) {
    return false;
  }
  const helper = target.value.declaration;
  const [parameter] = helper.getParameters();
  const body = helper.getBody();
  const statements = Node.isBlock(body) ? body.getStatements() : [];
  const [statement] = statements;
  const returned = Node.isReturnStatement(statement) ? statement.getExpression() : undefined;
  const expression = returned === undefined ? undefined : unwrap(returned);
  if (
    helper.getSourceFile() !== factory.getSourceFile() ||
    helper.getParameters().length !== 1 ||
    parameter === undefined ||
    statements.length !== 1 ||
    !Node.isBinaryExpression(expression) ||
    expression.getOperatorToken().getKind() !== SyntaxKind.InKeyword ||
    !referencesParameter(expression.getLeft(), parameter, reads)
  ) {
    return false;
  }
  return membershipMap(unwrap(expression.getRight()), reads);
}

/** An unwritten binding to an object literal whose every member is `true`. */
function membershipMap(map: MorphNode, reads: ComposeReads): boolean {
  if (!Node.isIdentifier(map) || reads.writes(map).kind !== "resolved") {
    return false;
  }
  const binding = reads.binding(map);
  const initializer = binding.kind === "resolved" && Node.isVariableDeclaration(binding.value) ? binding.value.getInitializer() : undefined;
  const literal = initializer === undefined ? undefined : unwrap(initializer);
  return (
    Node.isObjectLiteralExpression(literal) &&
    literal.getProperties().every((property) => {
      const value = Node.isPropertyAssignment(property) ? property.getInitializer() : undefined;
      return value !== undefined && unwrap(value).getKind() === SyntaxKind.TrueKeyword;
    })
  );
}

function nativeBucketConsume(call: CallExpression, factory: FunctionDeclaration, reads: ComposeReads): boolean {
  const member = reads.member(call.getExpression());
  const limiter = member.kind === "resolved" ? unwrap(member.value.receiver) : undefined;
  if (member.kind !== "resolved" || member.value.name !== CONSUME_MEMBER || !Node.isIdentifier(limiter) || reads.writes(limiter).kind !== "resolved") {
    return false;
  }
  const receiver = reads.binding(limiter);
  if (receiver.kind !== "resolved" || !Node.isVariableDeclaration(receiver.value) || enclosingFunction(receiver.value) !== factory) {
    return false;
  }
  const written = receiver.value.getInitializer();
  const initializer = written === undefined ? undefined : unwrap(written);
  if (!(Node.isCallExpression(initializer) && canonicalReference(initializer.getExpression(), RATE_LIMITER, "createRateLimiter", reads))) {
    return false;
  }
  const operation = reads.calledMember(call);
  return (
    operation.kind === "resolved" &&
    operation.value.length > 0 &&
    operation.value.every((declaration) => declaration.getSourceFile().getFilePath().endsWith(`/${RATE_LIMITER}`))
  );
}

/** Tier-5 owns this transport-policy operation; caller-supplied operations never inherit its ownership. */
function nativeRatePolicy(fn: MorphNode, reads: ComposeReads): boolean {
  if (!Node.isArrowFunction(fn)) {
    return false;
  }
  const property = slotParent(fn);
  const object = property?.getParent();
  const returned = object === undefined ? undefined : slotParent(object);
  const factory = enclosingFunction(fn);
  if (
    !Node.isPropertyAssignment(property) ||
    property.getName() !== "enforce" ||
    !Node.isObjectLiteralExpression(object) ||
    !Node.isReturnStatement(returned) ||
    !Node.isFunctionDeclaration(factory) ||
    factory.getName() !== "createRateLimitGate" ||
    !factory.getSourceFile().getFilePath().endsWith(`/${RATE_POLICY}`) ||
    !canonicalReference(factory.getReturnTypeNode(), RATE_PORT, "RateLimitGate", reads) ||
    fn.getParameters().length !== 1 ||
    !canonicalReference(fn.getParameters()[0]?.getTypeNode(), RATE_PORT, "RateLimitDecision", reads)
  ) {
    return false;
  }
  const calls = fn.getDescendantsOfKind(SyntaxKind.CallExpression);
  return (
    calls.some((call) => nativeBucketConsume(call, factory, reads)) &&
    calls.every((call) => nativeBucketConsume(call, factory, reads) || bucketSelector(call, factory, reads)) &&
    fn.getDescendants().every((node) => syntacticDecision(node) === undefined || bucketDecision(node, fn, factory, reads))
  );
}

// The owned operation may decide only which bucket it debits: a decision is a debiting branch's condition or sits in a debit's own argument.
function bucketDecision(decision: MorphNode, fn: MorphNode, factory: FunctionDeclaration, reads: ComposeReads): boolean {
  for (let current: MorphNode | undefined = decision; current !== undefined && current !== fn; current = current.getParent()) {
    if (Node.isCallExpression(current) && current !== decision && nativeBucketConsume(current, factory, reads)) {
      return current.getArguments().some((argument) => argument === decision || decision.getAncestors().includes(argument));
    }
    if (Node.isIfStatement(current)) {
      const condition = current.getExpression();
      const guards = current === decision || condition === decision || decision.getAncestors().includes(condition);
      return (
        guards &&
        current
          .getThenStatement()
          .getDescendantsOfKind(SyntaxKind.CallExpression)
          .some((call) => nativeBucketConsume(call, factory, reads))
      );
    }
  }
  return false;
}

/** A callback the enclosing code runs before it continues: an IIFE callee or an eager array-method callback. */
function eagerlyInvoked(fn: MorphNode, reads: ComposeReads): boolean {
  const site = directCall(fn);
  if (site === undefined) {
    return false;
  }
  if (site.call.getExpression() === site.slot) {
    return true;
  }
  const callee = unwrap(site.call.getExpression());
  return Node.isPropertyAccessExpression(callee) && EAGER_ITERATION.has(callee.getName()) && declaredInTsLib(site.call, reads);
}

/** Is the identifier the callee of the call it sits in (`helper(x)`), as opposed to a value handed on (`{ op: helper }`)? */
function calledDirectly(expression: MorphNode): boolean {
  const site = directCall(expression);
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
function referencePosition(expression: MorphNode): boolean {
  if (Node.isPropertyAccessExpression(expression) || Node.isElementAccessExpression(expression)) {
    return expression.getFirstAncestor((ancestor) => Node.isTypeNode(ancestor)) === undefined;
  }
  const parent = expression.getParent();
  if (parent === undefined || Node.isImportSpecifier(parent) || Node.isExportSpecifier(parent) || Node.isImportClause(parent)) {
    return false;
  }
  return !namesItsParent(expression, parent) && expression.getFirstAncestor((ancestor) => Node.isTypeNode(ancestor)) === undefined;
}

function ownerHome(node: MorphNode): boolean {
  const path = node.getSourceFile().getFilePath();
  return OWNER_HOMES.some((home) => path.endsWith(`/${home}`));
}

/** A disposal-stack receiver's actual binding chain: its writes, its one lexical declaration and that declaration's initializer. */
function nominateStackReceiver(demand: ComposeReadDemand, receiver: MorphNode): void {
  const value = unwrap(receiver);
  if (Node.isIdentifier(value)) {
    demand.binding(value);
    demand.writes(value);
  }
}

/** A non-literal key can be a well-known symbol, a computed dispatch key or a symbol-keyed member read on a stable object. */
function nominateElementAccess(demand: ComposeReadDemand, access: MorphNode): void {
  if (!Node.isElementAccessExpression(access)) {
    return;
  }
  const key = access.getArgumentExpression();
  if (key === undefined || literalKey(unwrap(key))) {
    return;
  }
  demand.globalOrigin(key);
  demand.computedName(key);
  demand.stable(access.getExpression());
  const receiver = unwrap(access.getExpression());
  if (Node.isIdentifier(receiver)) {
    demand.writes(receiver);
  }
}

function nominateCall(demand: ComposeReadDemand, call: CallExpression): void {
  const callee = unwrap(call.getExpression());
  if (typedDecisionCandidate(call)) {
    demand.globalOrigin(callee);
  }
  if ((Node.isPropertyAccessExpression(callee) && DECLARED_MEMBERS.has(callee.getName())) || Node.isElementAccessExpression(callee)) {
    demand.calledMember(call);
    nominateStackReceiver(demand, callee.getExpression());
  }
  if (ownerHome(call)) {
    demand.moduleOrigin(call.getExpression());
  }
}

/** A computed key can be a native lifetime key; its member value may be the lifetime callable. */
function nominateComputedKey(demand: ComposeReadDemand, name: MorphNode): void {
  if (!Node.isComputedPropertyName(name)) {
    return;
  }
  demand.globalOrigin(name.getExpression());
  demand.staticString(name.getExpression());
  const parent = name.getParent();
  const initializer = Node.isPropertyAssignment(parent) ? parent.getInitializer() : undefined;
  if (initializer !== undefined) {
    demand.callable(initializer);
  }
}

/** A declaration can link a stable object source or a disposal-stack binding chain. */
function nominateVariable(demand: ComposeReadDemand, declaration: MorphNode): void {
  if (!Node.isVariableDeclaration(declaration)) {
    return;
  }
  const name = declaration.getNameNode();
  const initializer = declaration.getInitializer();
  if (initializer === undefined) {
    return;
  }
  const source = unwrap(initializer);
  if (Node.isIdentifier(name) && (Node.isObjectLiteralExpression(source) || Node.isIdentifier(source))) {
    demand.writes(name);
  }
  nominateStackReceiver(demand, initializer);
}

/** Lifetime keys, stack constructors, stable-source links and owned type identities the evaluate phase may ask about. */
function nominateDeclarations(demand: ComposeReadDemand, node: MorphNode): void {
  if (Node.isNewExpression(node)) {
    demand.globalOrigin(node.getExpression());
  }
  nominateComputedKey(demand, node);
  nominateVariable(demand, node);
  if (Node.isTypeReference(node) && ownerHome(node)) {
    demand.moduleOrigin(node.getTypeName());
  }
}

function nominateOwnerIdentifier(demand: ComposeReadDemand, node: MorphNode): void {
  if (!(Node.isIdentifier(node) && ownerHome(node))) {
    return;
  }
  demand.binding(node);
  const parent = node.getParent();
  if (Node.isFunctionDeclaration(parent) && parent.getNameNode() === node) {
    demand.callable(node);
  }
  const operand = slotParent(node);
  if (Node.isBinaryExpression(operand) && operand.getOperatorToken().getKind() === SyntaxKind.InKeyword && operand.getRight() === outermost(node)) {
    demand.writes(node);
  }
}

interface Reference {
  readonly target: MorphNode;
  readonly at: MorphNode;
  readonly called: boolean;
}

/** Named helpers and native lifetime members join by reference; their business escapes settle together to a fixed point.
 *  Ordinary anonymous callbacks keep their per-call default independently of reference reach. */
interface Classifier {
  readonly perCall: (fn: MorphNode) => boolean;
  readonly judged: (node: MorphNode) => boolean;
}

/** Runs one site's native judgment; an un-nominated question records that site as unknown and yields `fallback`. */
type Attempt = <T>(site: MorphNode, fallback: T, run: () => T) => T;

/** The sealed native answers and the per-site unknown boundary every typed judgment runs under. */
interface Judge {
  readonly reads: ComposeReads;
  /** A phase judgment of a function or a typed decision; its unknown can stand in for a decision's verdict. */
  readonly attempt: Attempt;
  /** A reference-reach judgment; its unknown never stands in for the phase of a decision at the same node. */
  readonly attemptReference: Attempt;
}

interface UnknownRecorder extends Omit<Judge, "reads"> {
  readonly phaseUnknowns: ReadonlyMap<object, string>;
  readonly unknownSites: readonly { readonly site: MorphNode; readonly reason: string }[];
}

// D328: an un-nominated question is an explicit unknown at its own site, never a verdict and never a whole-gate refusal.
function unknownRecorder(): UnknownRecorder {
  const phaseUnknowns = new Map<object, string>();
  const unknownSites: { readonly site: MorphNode; readonly reason: string }[] = [];
  const recorded = new Set<object>();
  const record = (site: MorphNode, reason: string, phase: boolean): void => {
    if (phase && !phaseUnknowns.has(site.compilerNode)) {
      phaseUnknowns.set(site.compilerNode, reason);
    }
    if (!recorded.has(site.compilerNode)) {
      recorded.add(site.compilerNode);
      unknownSites.push({ site, reason });
    }
  };
  const attemptInto =
    (phase: boolean): Attempt =>
    <T>(site: MorphNode, fallback: T, run: () => T): T => {
      try {
        return run();
      } catch (error) {
        const reason = unsupportedComposeQuestion(error);
        if (reason === undefined) {
          throw error;
        }
        record(site, reason, phase);
        return fallback;
      }
    };
  return { attempt: attemptInto(true), attemptReference: attemptInto(false), phaseUnknowns, unknownSites };
}

function businessReference(at: MorphNode, called: boolean, perCall: (fn: MorphNode) => boolean, { reads, attemptReference }: Judge): boolean {
  if (!(called || attemptReference(at, false, () => lifetimeSlot(at, reads)))) {
    return true;
  }
  const fn = enclosingFunction(at);
  return fn !== undefined && perCall(fn);
}

function classify(named: ReadonlySet<object>, references: readonly Reference[], inCompose: (node: MorphNode) => boolean, judge: Judge): Classifier {
  const { reads, attempt } = judge;
  const perCallReferenced = new Set<object>();
  const judgedNamed = new Set<object>();
  const nativeOwners = new Map<object, boolean>();
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
      return perCallReferenced.has(fn.compilerNode);
    }
    if (perCallReferenced.has(fn.compilerNode)) {
      return true;
    }
    let owned = nativeOwners.get(fn.compilerNode);
    if (owned === undefined) {
      owned = attempt(fn, false, () => nativeRatePolicy(fn, reads));
      nativeOwners.set(fn.compilerNode, owned);
    }
    const outer = enclosingFunction(fn);
    if (owned || (attempt(fn, false, () => lifetimeSlot(fn, reads)) && (outer === undefined || !perCall(outer)))) {
      return false;
    }
    if (!attempt(fn, false, () => eagerlyInvoked(fn, reads))) {
      return true;
    }
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
      if (!perCallReferenced.has(target.compilerNode) && businessReference(at, called, perCall, judge)) {
        perCallReferenced.add(target.compilerNode);
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

function unwrapped(node: MorphNode | undefined): MorphNode | undefined {
  return node === undefined ? undefined : unwrap(node);
}

function canonicalReference(raw: MorphNode | undefined, home: string, name: string, reads: ComposeReads): boolean {
  const node = unwrapped(raw);
  // Only a named type reference or a named value has a module origin; a keyword, literal or computed node has none to ask about.
  if (
    node === undefined ||
    !(Node.isTypeReference(node) || Node.isIdentifier(node) || Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node))
  ) {
    return false;
  }
  const origin = reads.moduleOrigin(Node.isTypeReference(node) ? node.getTypeName() : node);
  return (
    origin.kind === "resolved" &&
    origin.value.canonical.kind === "project" &&
    origin.value.canonical.exportedName === name &&
    origin.value.canonical.sourceFile.getFilePath().endsWith(`/${home}`) &&
    origin.value.memberPath.length === 0
  );
}

// Only an identifier can denote a parameter; a member read's symbol is a property, never the parameter.
function referencesParameter(node: MorphNode | undefined, parameter: MorphNode, reads: ComposeReads): boolean {
  if (node === undefined) {
    return false;
  }
  const value = unwrap(node);
  if (!Node.isIdentifier(value)) {
    return false;
  }
  const binding = reads.binding(value);
  return binding.kind === "resolved" && binding.value.compilerNode === parameter.compilerNode;
}

function rowDefault(raw: MorphNode | undefined, parameter: MorphNode, field: string, reads: ComposeReads): MorphNode | undefined {
  const node = unwrapped(raw);
  if (!Node.isBinaryExpression(node) || node.getOperatorToken().getKind() !== SyntaxKind.QuestionQuestionToken) {
    return;
  }
  const read = unwrap(node.getLeft());
  const member = reads.member(read);
  return read.getFirstChildByKind(SyntaxKind.QuestionDotToken) !== undefined &&
    member.kind === "resolved" &&
    member.value.name === field &&
    referencesParameter(member.value.receiver, parameter, reads)
    ? unwrap(node.getRight())
    : undefined;
}

function literalString(raw: MorphNode | undefined, value: string): boolean {
  const node = unwrapped(raw);
  return Node.isStringLiteral(node) && node.getLiteralText() === value;
}

/** The fields object a `mintPrincipal({ … })` call hands the one Principal constructor. */
function mintedFields(raw: MorphNode | undefined, reads: ComposeReads): MorphNode | undefined {
  const node = unwrapped(raw);
  if (
    !Node.isCallExpression(node) ||
    node.getTypeArguments().length > 0 ||
    node.getArguments().length !== 1 ||
    !canonicalReference(node.getExpression(), PRINCIPAL_MINT, "mintPrincipal", reads)
  ) {
    return;
  }
  return unwrapped(node.getArguments()[0]);
}

/** D135's absent-row floor: the role-data primitive's own capture of the literal `"user"` code. */
function capturedUserFloor(raw: MorphNode | undefined, reads: ComposeReads): boolean {
  const node = unwrapped(raw);
  return (
    Node.isCallExpression(node) &&
    node.getTypeArguments().length === 0 &&
    node.getArguments().length === 1 &&
    literalString(node.getArguments()[0], "user") &&
    canonicalReference(node.getExpression(), ROLE_DATA, "captureUserRole", reads)
  );
}

interface ProjectionParameters {
  readonly userId: MorphNode;
  readonly fields: MorphNode;
}

function projectionParameters(fn: FunctionDeclaration, reads: ComposeReads): ProjectionParameters | undefined {
  const params = fn.getParameters();
  const [userId, fields] = params;
  if (
    params.length !== 2 ||
    params.some((parameter) => parameter.getInitializer() !== undefined) ||
    userId === undefined ||
    fields === undefined ||
    !canonicalReference(userId.getTypeNode(), IDS_CONTRACT, "UserId", reads)
  ) {
    return;
  }
  const fieldsType = fields.getTypeNode();
  if (!Node.isUnionTypeNode(fieldsType)) {
    return;
  }
  const arms = fieldsType.getTypeNodes();
  if (
    arms.length !== 2 ||
    !arms.some((arm) => canonicalReference(arm, PRINCIPAL_FIELDS, "UserPrincipalFields", reads)) ||
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
function canonicalPrincipalProjection(fn: MorphNode, reads: ComposeReads): boolean {
  if (
    !(
      Node.isFunctionDeclaration(fn) &&
      fn.getSourceFile().getFilePath().endsWith(`/${AUTH_SEAM}`) &&
      canonicalReference(fn.getReturnTypeNode(), IDENTITY_CONTRACT, "Principal", reads)
    )
  ) {
    return false;
  }
  const name = fn.getNameNode();
  if (name === undefined || name.getText() !== "principalFromRow") {
    return false;
  }
  const identity = reads.callable(name);
  const params = projectionParameters(fn, reads);
  if (identity.kind !== "resolved" || identity.value.declaration.compilerNode !== fn.compilerNode || params === undefined) {
    return false;
  }
  const { userId, fields } = params;
  const body = fn.getBody();
  const statements = Node.isBlock(body) ? body.getStatements() : [];
  const [statement] = statements;
  const value = mintedFields(Node.isReturnStatement(statement) ? statement.getExpression() : undefined, reads);
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
  const role = rowDefault(expression("role"), fields, "role", reads);
  const externalId = rowDefault(expression("externalId"), fields, "externalId", reads);
  const handle = rowDefault(expression("handle"), fields, "handle", reads);
  if (
    byName.size !== PROJECTION_KEYS.length ||
    !referencesParameter(expression("userId"), userId, reads) ||
    !capturedUserFloor(role, reads) ||
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
    referencesParameter(args[0], userId, reads) &&
    canonicalReference(types[0], IDS_CONTRACT, "Handle", reads) &&
    canonicalReference(handle.getExpression(), IDS_CONTRACT, "castId", reads)
  );
}

interface Subject {
  readonly anchor: MorphNode;
  /** Every per-call decision in source order; one unknown never hides another decision's concrete phase. */
  readonly decisions: MorphNode[];
}

interface DecisionCandidate {
  readonly node: MorphNode;
  /** A call whose decision needs its callee or key's native meaning, settled at evaluate. */
  readonly typed: boolean;
}

/** The function a finding belongs to: the outermost per-call function around `node`, else the construction-time function, else `node`. */
function subjectKey(node: MorphNode, perCall: (fn: MorphNode) => boolean, { reads, attempt }: Judge): MorphNode {
  let fn = enclosingFunction(node);
  if (fn !== undefined && perCall(fn)) {
    for (let outer = enclosingFunction(fn); outer !== undefined && perCall(outer); outer = enclosingFunction(outer)) {
      fn = outer;
    }
    return fn;
  }
  while (fn !== undefined) {
    const current = fn;
    if (!attempt(current, false, () => eagerlyInvoked(current, reads))) {
      break;
    }
    fn = enclosingFunction(current);
  }
  return fn ?? node;
}

/** The first unknown on `node` or the functions around it: a decision there has no established phase. */
function unknownAround(node: MorphNode, unknowns: ReadonlyMap<object, string>): string | undefined {
  let current: MorphNode | undefined = node;
  while (current !== undefined && !unknowns.has(current.compilerNode)) {
    current = enclosingFunction(current);
  }
  return current === undefined ? undefined : unknowns.get(current.compilerNode);
}

function subjectMessage(decision: MorphNode): string {
  const snippet = (decision.getText().split("\n")[0] ?? "").slice(0, SNIPPET_LENGTH);
  return `compose decides per call: \`${snippet}\` at line ${decision.getStartLineNumber()}. ${MESSAGE}`;
}

const COMPOSE_FILE = "packages/server/src/entry/compose/x.ts";
/** Each transparent wrapper spelling on a native callee; one unwrap must see through all of them. */
const DEFER_CALLEES = ["(s.defer as (cb: () => void) => void)", "s.defer!", "(s.defer satisfies (cb: () => void) => void)"] as const;
const EAGER_CALLEES = [
  "(sizes.filter as (cb: (size: number) => boolean) => number[])",
  "sizes.filter!",
  "(sizes.filter satisfies (cb: (size: number) => boolean) => number[])",
] as const;
const PRINCIPAL_TYPE_FILES = {
  [IDS_CONTRACT]:
    'declare const brand: unique symbol;\nexport type UserId = string & { readonly [brand]: "UserId" };\nexport type Handle = string & { readonly [brand]: "Handle" };\nexport type ExternalId = string & { readonly [brand]: "ExternalId" };\nexport declare function castId<T extends string>(raw: string): T;\n',
  [IDENTITY_CONTRACT]:
    'import type { UserId, Handle, ExternalId } from "../../../kit/src/ids/index.ts";\nexport type UserRole = "owner" | "admin" | "user";\ndeclare const userRoleState: unique symbol;\nexport interface UserRoleState { readonly [userRoleState]: true; }\nexport interface Principal { userId: UserId; role: UserRoleState; handle: Handle; externalId: ExternalId | null; via: "cookie" | "header" | "fallback"; }\n',
  [PRINCIPAL_FIELDS]:
    'import type { Handle, ExternalId } from "../../../../../kit/src/ids/index.ts";\nimport type { UserRoleState } from "../../../../../contracts/src/identity/index.ts";\nexport interface UserPrincipalFields { role: UserRoleState; handle: Handle; externalId: ExternalId | null; enabled: boolean; }\n',
  [ROLE_DATA]:
    'import type { UserRole, UserRoleState } from "../../../../contracts/src/identity/index.ts";\nexport declare function captureUserRole(code: UserRole): UserRoleState;\n',
  [PRINCIPAL_MINT]:
    'import type { Principal } from "../../../../contracts/src/identity/index.ts";\nexport declare function mintPrincipal(fields: Principal): Principal;\n',
};
const PRINCIPAL_IMPORTS =
  'import type { Principal } from "../../../../contracts/src/identity/index.ts";\nimport type { UserId, Handle } from "../../../../kit/src/ids/index.ts";\nimport { castId } from "../../../../kit/src/ids/index.ts";\nimport { captureUserRole } from "../../primitives/role-data/index.ts";\nimport { mintPrincipal } from "./principal-mint.ts";\nimport type { UserPrincipalFields } from "../../domain/sessions/contract/results.ts";\n';
const PRINCIPAL_MAPPER =
  'function principalFromRow(userId: UserId, fields: UserPrincipalFields | null): Principal {\n  return mintPrincipal({ userId, role: fields?.role ?? captureUserRole("user"), handle: fields?.handle ?? castId<Handle>(userId), externalId: fields?.externalId ?? null, via: "fallback" });\n}\n';
const PRINCIPAL_BRIDGE = "export function bridge(userId: UserId, fields: UserPrincipalFields | null): Principal { return principalFromRow(userId, fields); }\n";
const PRINCIPAL_COMPOSE = 'import { bridge } from "../auth/seam.ts";\nexport function build() { return { principal: bridge }; }\n';
/** Each transparent-wrapper spelling of a canonical mint callee, as `[canonical, wrapped]`. */
const WRAPPED_MINTS = [
  ["return mintPrincipal({", "return (mintPrincipal)({"],
  ["castId<Handle>(userId)", "castId!<Handle>(userId)"],
  ['captureUserRole("user")', '(captureUserRole)("user")'],
  ["return mintPrincipal({", "return (mintPrincipal satisfies typeof mintPrincipal)({"],
] as const;
const DOMAIN_OWNER = "packages/server/src/domain/x/owner.ts";
const DOMAIN_OWNER_SOURCE =
  '/// <reference lib="esnext.disposable" />\nexport const owner = { value: 1, [Symbol.asyncDispose]: (): number => (Date.now() > 1 ? 1 : 0) };\n';
/** A reference-reach unknown beside a concrete decision, in both source orders, plus the plain-member control. */
const MASKING_ORDERS = [
  {
    body: "const f = owner?.[Symbol.asyncDispose]; if (id.length > 0) { return f; } return undefined;",
    why: "an unknown symbol-member reach written before a concrete branch never masks the branch's violation",
  },
  {
    body: "if (id.length > 0) { return undefined; } return owner?.[Symbol.asyncDispose];",
    why: "the same unknown reach written after the concrete branch leaves the same violation; source order decides nothing",
  },
  {
    body: "const f = owner?.value; if (id.length > 0) { return f; } return undefined;",
    why: "CONTROL: a plain member read of the same domain object carries no unknown and the same violation",
  },
] as const;

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
    const native = composeNativeReads(ctx);
    const { demand } = native;
    const decisions: DecisionCandidate[] = [];
    const referenceSites: MorphNode[] = [];
    const callables = new Map<string, MorphNode[]>();
    const functions: MorphNode[] = [];
    const unresolvedMembers: { readonly at: MorphNode; readonly detail: string }[] = [];
    const subjects = new Map<object, Subject>();
    const { attempt, attemptReference, phaseUnknowns, unknownSites } = unknownRecorder();
    const reference = (node: MorphNode): void => {
      referenceSites.push(node);
      if (referencePosition(node)) {
        demand.callable(node);
      }
    };
    const subjectOf = (node: MorphNode, perCall: (fn: MorphNode) => boolean, judge: Judge): Subject => {
      const key = subjectKey(node, perCall, judge);
      const existing = subjects.get(key.compilerNode);
      if (existing !== undefined) {
        return existing;
      }
      const subject: Subject = { anchor: (key === node ? undefined : handedOutName(key)) ?? key, decisions: [] };
      subjects.set(key.compilerNode, subject);
      return subject;
    };
    const lifetimeTarget = (expression: MorphNode, reads: ComposeReads): MorphNode | undefined => {
      if (!(Node.isElementAccessExpression(expression) && nativeDisposalKey(expression.getArgumentExpression(), reads)) || isReferenceWriteTarget(expression)) {
        return;
      }
      const member = reads.symbolMember(expression);
      if (member.kind === "unresolved") {
        unresolvedMembers.push({ at: expression, detail: member.detail });
        return;
      }
      if (Node.isMethodDeclaration(member.value)) {
        return member.value;
      }
      const value = reads.callable(member.value);
      return value.kind === "resolved" ? value.value.declaration : undefined;
    };
    const references = (tracked: ReadonlySet<object>, { reads }: Judge): readonly Reference[] =>
      referenceSites.flatMap((expression) => {
        if (!referencePosition(expression)) {
          return [];
        }
        return attemptReference(expression, [], (): readonly Reference[] => {
          const callable = reads.callable(expression);
          const target = callable.kind === "resolved" ? callable.value.declaration : lifetimeTarget(expression, reads);
          return target !== undefined && tracked.has(target.compilerNode) ? [{ target, at: expression, called: calledDirectly(expression) }] : [];
        });
      });
    const reportSubjects = (): void => {
      for (const subject of subjects.values()) {
        // Any decision whose phase is established is a violation; only a subject with no such decision is an unknown.
        const concrete = subject.decisions.find((decision) => unknownAround(decision, phaseUnknowns) === undefined);
        const [first] = subject.decisions;
        if (concrete !== undefined) {
          ctx.report.node(subject.anchor, { message: subjectMessage(concrete) });
        } else if (first !== undefined) {
          const reason = unknownAround(first, phaseUnknowns) ?? UNKNOWN_SITE;
          ctx.report.analysis(subject.anchor, { kind: "unknown", reason: `compose cannot establish this operation's phase natively: ${reason}` });
        }
      }
      for (const { site, reason } of unknownSites) {
        ctx.report.analysis(site, { kind: "unknown", reason });
      }
    };
    const reportMemberRefusals = ({ perCall, judged }: Classifier, judge: Judge): void => {
      for (const { at, detail } of unresolvedMembers) {
        if (judged(at) && businessReference(at, calledDirectly(at), perCall, judge)) {
          ctx.report.node(at, { message: `compose cannot establish the native lifetime member handed to a business operation: ${detail}. ${MESSAGE}` });
        }
      }
    };
    return {
      visitors: [
        {
          kinds: [...DECISION_STATEMENTS, SyntaxKind.BinaryExpression, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
          visit: (node) => {
            if (Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node)) {
              reference(node);
              nominateElementAccess(demand, node);
            }
            const anchor = syntacticDecision(node);
            if (anchor !== undefined) {
              decisions.push({ node: anchor, typed: false });
            }
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node) => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            nominateCall(demand, node);
            const anchor = syntacticDecision(node);
            if (anchor !== undefined) {
              decisions.push({ node: anchor, typed: false });
            } else if (typedDecisionCandidate(node)) {
              decisions.push({ node, typed: true });
            }
          },
        },
        {
          kinds: [SyntaxKind.FunctionDeclaration, SyntaxKind.ArrowFunction, SyntaxKind.FunctionExpression, SyntaxKind.MethodDeclaration],
          visit: (node) => {
            const name = namedCallable(node)?.getText();
            if (name !== undefined) {
              callables.set(name, [...(callables.get(name) ?? []), node]);
            }
            functions.push(node);
          },
        },
        {
          kinds: [SyntaxKind.Identifier],
          visit: (node) => {
            reference(node);
            nominateOwnerIdentifier(demand, node);
          },
        },
        {
          kinds: [SyntaxKind.NewExpression, SyntaxKind.ComputedPropertyName, SyntaxKind.VariableDeclaration, SyntaxKind.TypeReference],
          visit: (node) => nominateDeclarations(demand, node),
        },
      ],
      prepare: native.prepare,
      evaluate: () => {
        const reads = native.reads();
        const judge: Judge = { reads, attempt, attemptReference };
        const named = new Set<object>([...callables.values()].flat().map((fn) => fn.compilerNode));
        const lifetimeMembers = functions.filter((fn) => attempt(fn, false, () => lifetimeSlot(fn, reads))).map((fn) => fn.compilerNode);
        const inCompose = (node: MorphNode): boolean => ctx.relativePath(node.getSourceFile()).startsWith(COMPOSE_PREFIX);
        const classifier = classify(named, references(new Set([...named, ...lifetimeMembers]), judge), inCompose, judge);
        reportMemberRefusals(classifier, judge);
        const projections = new Map<object, boolean>();
        const canonicalProjection = (fn: MorphNode): boolean => {
          const known = projections.get(fn.compilerNode);
          if (known !== undefined) {
            return known;
          }
          const admitted = attempt(fn, false, () => canonicalPrincipalProjection(fn, reads));
          projections.set(fn.compilerNode, admitted);
          return admitted;
        };
        for (const { node, typed } of decisions) {
          const decides = !typed || (Node.isCallExpression(node) && attempt(node, false, () => typedDecision(node, reads)));
          if (decides && decidesPerCall(node, classifier, canonicalProjection)) {
            subjectOf(node, classifier.perCall, judge).decisions.push(node);
          }
        }
        reportSubjects();
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          '/// <reference lib="esnext.disposable" />\nexport function build(receiver: AsyncDisposable) { return { op: receiver[Symbol.asyncDispose] }; }',
      },
      expect: { count: 1, messageIncludes: "cannot establish the native lifetime member" },
      why: "A same-typed formal proves no actual lifetime member value for a business escape; unresolved origin refuses explicitly.",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          '/// <reference lib="esnext.disposable" />\nexport function build(active: () => boolean) { const owner = { [Symbol.asyncDispose]: () => active() ? 1 : 0 }; const alias = owner; alias[Symbol.asyncDispose] = () => 2; return { op: owner[Symbol.asyncDispose] }; }',
      },
      expect: { count: 1, messageIncludes: "cannot establish the native lifetime member" },
      why: "A write through an actual receiver alias prevents an immutable member-origin claim and refuses the business escape.",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          '/// <reference lib="esnext.disposable" />\nexport function build(active: () => boolean) { const owner = { [Symbol.asyncDispose]: () => active() ? 1 : 0 }; return { op: owner[Symbol.asyncDispose] }; }',
      },
      expect: { count: 1, messageIncludes: "decides per call" },
      why: "An anonymous native disposal property loses its lifetime phase when the actual callable escapes as a business operation.",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          '/// <reference lib="esnext.disposable" />\nexport function build(active: () => boolean) { const owner = { [Symbol.asyncDispose]() { return active() ? 1 : 0; } }; return { op: owner[Symbol.asyncDispose] }; }',
      },
      expect: { count: 1, messageIncludes: "decides per call" },
      why: "Native method syntax cannot hide the same independent business escape of the resolved member callable.",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          '/// <reference lib="esnext.disposable" />\nexport function build(active: () => boolean) { const owner = { [Symbol.asyncDispose]: () => active() ? 1 : 0 }; return { op: () => owner[Symbol.asyncDispose]() }; }',
      },
      expect: { count: 1, messageIncludes: "decides per call" },
      why: "Invoking the anonymous disposer inside an ordinary operation runs its decision per business call.",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          '/// <reference lib="esnext.disposable" />\nexport function build(active: () => boolean) { const owner = { [Symbol.asyncDispose]() { return active() ? 1 : 0; } }; return { op: () => owner[Symbol.asyncDispose]() }; }',
      },
      expect: { count: 1, messageIncludes: "decides per call" },
      why: "A native disposal method invoked by a business operation participates in the same per-call fixed point.",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          '/// <reference lib="esnext.disposable" />\nexport function build(active: () => boolean) { return { op: () => { const stack = new AsyncDisposableStack(); stack.defer(() => { if (active()) throw new Error("busy"); }); return stack; } }; }',
      },
      expect: { count: 1, token: "op", messageIncludes: "decides per call" },
      why: "A request-local native stack cannot relabel business-operation decisions as graph construction or shutdown.",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          '/// <reference lib="esnext.disposable" />\nexport function build(stack: AsyncDisposableStack, active: () => boolean) { stack.defer(() => { if (active()) throw new Error("busy"); }); }',
      },
      expect: { count: 1, messageIncludes: "decides per call" },
      why: "An annotation proves no native constructor value for a caller-supplied stack.",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          'export function build(stack: { defer: (callback: () => void) => void }, active: () => boolean) { stack.defer(() => { if (active()) throw new Error("busy"); }); }',
      },
      expect: { count: 1, messageIncludes: "decides per call" },
      why: "A caller-supplied defer method is not the native disposal protocol and cannot hide business policy.",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          '/// <reference lib="esnext.disposable" />\nexport function build(active: () => boolean) { const stack = new AsyncDisposableStack(); const shutdown = () => { if (active()) throw new Error("busy"); }; stack.defer(shutdown); return { op: shutdown }; }',
      },
      expect: { count: 1, token: "shutdown", messageIncludes: "decides per call" },
      why: "Native lifetime retention does not erase the same function's independent business-operation escape.",
    },

    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          'const Symbol = { asyncDispose: "run" } as const; export function build(active: () => boolean) { return { [Symbol.asyncDispose]: () => active() ? 1 : 0 }; }',
      },
      expect: { count: 1, messageIncludes: "decides per call" },
      why: "A shadowed Symbol property does not establish a language disposal operation.",
    },
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
        [AUTH_SEAM]: `${PRINCIPAL_IMPORTS}${PRINCIPAL_MAPPER.replace('captureUserRole("user")', 'captureUserRole("owner")')}${PRINCIPAL_BRIDGE}`,
        [COMPOSE_FILE]: PRINCIPAL_COMPOSE,
      },
      expect: { count: 1, token: "principalFromRow", messageIncludes: "decides per call" },
      why: "the canonical name/home cannot admit a changed authority grant instead of D135's absent-row user floor",
    },
    {
      mode: "types",
      files: {
        ...PRINCIPAL_TYPE_FILES,
        [AUTH_SEAM]: `${PRINCIPAL_IMPORTS.replace('"../../primitives/role-data/index.ts"', '"./lookalike.ts"')}${PRINCIPAL_MAPPER}${PRINCIPAL_BRIDGE}`,
        "packages/server/src/entry/auth/lookalike.ts":
          'import type { UserRoleState } from "../../../../contracts/src/identity/index.ts";\nexport declare function captureUserRole(code: string): UserRoleState;\n',
        [COMPOSE_FILE]: PRINCIPAL_COMPOSE,
      },
      expect: { count: 1, token: "principalFromRow", messageIncludes: "decides per call" },
      why: "a same-named role capture outside the role-data primitive proves no absent-row user floor",
    },
    {
      mode: "types",
      files: {
        ...PRINCIPAL_TYPE_FILES,
        [AUTH_SEAM]: `${PRINCIPAL_IMPORTS.replace('"./principal-mint.ts"', '"./lookalike.ts"')}${PRINCIPAL_MAPPER}${PRINCIPAL_BRIDGE}`,
        "packages/server/src/entry/auth/lookalike.ts":
          'import type { Principal } from "../../../../contracts/src/identity/index.ts";\nexport declare function mintPrincipal(fields: object): Principal;\n',
        [COMPOSE_FILE]: PRINCIPAL_COMPOSE,
      },
      expect: { count: 1, token: "principalFromRow", messageIncludes: "decides per call" },
      why: "a same-named constructor outside principal-mint.ts is not the one Principal mint",
    },
    {
      mode: "types",
      files: {
        ...PRINCIPAL_TYPE_FILES,
        [AUTH_SEAM]: `${PRINCIPAL_IMPORTS}${PRINCIPAL_MAPPER.replace("return mintPrincipal({", "return {").replace(" });\n}", " };\n}")}${PRINCIPAL_BRIDGE}`,
        [COMPOSE_FILE]: PRINCIPAL_COMPOSE,
      },
      expect: { count: 1, token: "principalFromRow", messageIncludes: "decides per call" },
      why: "a projection that bypasses the branded constructor is not the canonical mint, even with the canonical floor",
    },
    {
      mode: "types",
      files: {
        ...PRINCIPAL_TYPE_FILES,
        [AUTH_SEAM]: `${PRINCIPAL_IMPORTS}${PRINCIPAL_MAPPER.replace("  return mintPrincipal({", '  if (!fields?.enabled) { throw new Error("disabled"); }\n  return mintPrincipal({')}${PRINCIPAL_BRIDGE}`,
        [COMPOSE_FILE]: PRINCIPAL_COMPOSE,
      },
      expect: { count: 1, token: "principalFromRow", messageIncludes: "decides per call" },
      why: "an added request admission branch is policy even in the canonical mapper; only the pure single-return projection is admitted",
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
        ...PRINCIPAL_TYPE_FILES,
        [AUTH_SEAM]: `${PRINCIPAL_IMPORTS}declare const currentFields: UserPrincipalFields;\n${PRINCIPAL_MAPPER.replace("fields: UserPrincipalFields | null", "fields: UserPrincipalFields | null = currentFields.enabled ? currentFields : null")}${PRINCIPAL_BRIDGE.replace("principalFromRow(userId, fields)", "principalFromRow(userId)")}`,
        [COMPOSE_FILE]: PRINCIPAL_COMPOSE,
      },
      expect: { count: 1, token: "principalFromRow", messageIncludes: "currentFields.enabled" },
      why: "a reached canonical mapper's executable parameter default remains per-call admission even when its body is only the pure row projection",
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
        "packages/server/src/entry/auth/helper.ts": "export function pick(n: number): number { return n > 1 ? n : 0; }\n",
        [COMPOSE_FILE]: 'import { pick as choose } from "../auth/helper.ts";\nexport function build() { return { op: choose }; }\n',
      },
      expect: { count: 1, token: "pick", messageIncludes: "decides per call" },
      why: "A renamed import retains its entry helper declaration; an identifier-name prefilter must not hide its per-call decision.",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/entry/auth/helper.ts": "export function pick(n: number): number { return n > 1 ? n : 0; }\n",
        [COMPOSE_FILE]: 'import * as helpers from "../auth/helper.ts";\nexport function build() { return { op: helpers.pick }; }\n',
      },
      expect: { count: 1, token: "pick", messageIncludes: "decides per call" },
      why: "A handed-out namespace member denotes the same entry helper, not an unjudged namespace receiver.",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/entry/auth/helper.ts": "export function pick(n: number): number { return n > 1 ? n : 0; }\n",
        [COMPOSE_FILE]: 'import * as helpers from "../auth/helper.ts";\nexport function build() { return { op: (n: number) => helpers.pick(n) }; }\n',
      },
      expect: { count: 1, token: "pick", messageIncludes: "decides per call" },
      why: "A namespace call inside a handed-out operation preserves the helper's per-call phase.",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/entry/auth/helper.ts": "export function pick(n: number): number { return n > 1 ? n : 0; }\n",
        "packages/server/src/entry/auth/barrel.ts": 'export { pick as choose } from "./helper.ts";\n',
        [COMPOSE_FILE]: 'import { choose } from "../auth/barrel.ts";\nexport function build() { return { op: choose }; }\n',
      },
      expect: { count: 1, token: "pick", messageIncludes: "decides per call" },
      why: "A re-export rename resolves to the original helper declaration without depending on its local name.",
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
    {
      mode: "types",
      files: { [COMPOSE_FILE]: 'export function build() {\n  return { cap: (n: number) => Math["max"](n, 10) };\n}\n' },
      expect: { count: 1, token: "cap", messageIncludes: "decides per call" },
      why: 'CLAMP, bracket spelling: Math["max"] resolves to the same ambient member as Math.max',
    },
    {
      mode: "types",
      files: { [COMPOSE_FILE]: "export function build() {\n  return { cap: (n: number) => Math.min!(n, 10) };\n}\n" },
      expect: { count: 1, token: "cap", messageIncludes: "Math.min" },
      why: "CLAMP through a non-null assertion: the ambient member under a transparent wrapper still picks between runtime values",
    },
    {
      mode: "types",
      files: {
        [DOMAIN_OWNER]: '/// <reference lib="esnext.disposable" />\nexport const owner = { [Symbol.asyncDispose]: (): number => (Date.now() > 1 ? 1 : 0) };\n',
        [COMPOSE_FILE]:
          '/// <reference lib="esnext.disposable" />\nimport { owner } from "../../domain/x/owner.ts";\nexport function build() { const s = new AsyncDisposableStack(); s.defer(owner[Symbol.asyncDispose]); return s; }\n',
        "packages/server/src/entry/compose/y.ts":
          'export function build(load: (id: string) => string) {\n  return { read: (id: string) => (id.length > 0 ? load(id) : "") };\n}\n',
      },
      expect: { count: 1, token: "read", messageIncludes: "decides per call" },
      why: "D328: an unsupported site (a domain-owned stable member source) is an explicit unknown at that site; every other compose file stays judged",
    },
    ...MASKING_ORDERS.map(({ body, why }) => ({
      mode: "types" as const,
      files: {
        [DOMAIN_OWNER]: DOMAIN_OWNER_SOURCE,
        [COMPOSE_FILE]: `/// <reference lib="esnext.disposable" />\nimport { owner } from "../../domain/x/owner.ts";\nexport function build() { return { op: (id: string) => { ${body} } }; }\n`,
      },
      expect: { count: 1, token: "op", messageIncludes: "decides per call" },
      why,
    })),
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          'const Math = { min: (a: number, _b: number) => a };\nexport function build() {\n  return { cap: (n: number) => Math["min"](n, 10) };\n}\n',
      },
      why: "A shadowed Math is not the ambient global, so its bracket-spelled min is no clamp",
    },
    {
      mode: "types",
      files: { [COMPOSE_FILE]: 'export function build() {\n  return { cap: (n: number) => Math["abs"](n) };\n}\n' },
      why: "An ambient Math member that does not pick between values is wiring in either spelling",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          '/// <reference lib="esnext.disposable" />\nexport function build(active: () => boolean) { return { [Symbol.asyncDispose]: () => active() ? 1 : 0 }; }',
      },
      why: "An anonymous disposal property used only by the language lifetime retains graph-shutdown decisions.",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          '/// <reference lib="esnext.disposable" />\nexport function build(active: () => boolean) { return { [Symbol.asyncDispose]() { return active() ? 1 : 0; } }; }',
      },
      why: "A genuine disposal method has the same lifetime phase without an independent business escape.",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          '/// <reference lib="esnext.disposable" />\nexport function build(active: () => boolean) { const owner = { [Symbol.asyncDispose]: () => active() ? 1 : 0 }; const stack = new AsyncDisposableStack(); stack.defer(owner[Symbol.asyncDispose]); return stack; }',
      },
      why: "Forwarding the actual member to another proven native graph-lifetime slot is not a business escape.",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          '/// <reference lib="esnext.disposable" />\nexport function build(active: () => boolean) { const stack = new AsyncDisposableStack(); stack.defer(async () => { if (active()) throw new Error("busy"); }); return stack; }',
      },
      why: "A callback retained by the actual installed native disposal stack owns shutdown decisions, not business request policy.",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          '/// <reference lib="esnext.disposable" />\nexport function build(active: () => boolean) { const Stack = DisposableStack; const stack = new Stack(); function shutdown() { if (active()) throw new Error("busy"); } stack.defer(shutdown); return stack; }',
      },
      why: "Native constructor aliases and a named callback retain the same lifetime phase through resolved identities.",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          '/// <reference lib="esnext.disposable" />\nexport function build(resource: AsyncDisposable) { return { [Symbol.asyncDispose]: () => resource[Symbol.asyncDispose]() }; }',
      },
      why: "The language's fixed well-known disposal key is neither runtime record dispatch nor a request operation.",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/entry/auth/helper.ts": "export function pick(n: number): number { return n > 1 ? n : 0; }\n",
        [COMPOSE_FILE]:
          'import { pick as choose } from "../auth/helper.ts";\nexport function build() { const value = choose(2); return { op: () => value }; }\n',
      },
      why: "Renamed helpers called only during construction still perform wiring, not per-call policy.",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/entry/auth/helper.ts": "export function pick(n: number): number { return n > 1 ? n : 0; }\n",
        [COMPOSE_FILE]:
          'import * as helpers from "../auth/helper.ts";\nexport function build() { const value = helpers.pick(2); return { op: () => value }; }\n',
      },
      why: "A namespace helper invoked during construction retains the same wiring phase as a direct call.",
    },
    {
      mode: "types",
      files: {
        ...PRINCIPAL_TYPE_FILES,
        [AUTH_SEAM]: `${PRINCIPAL_IMPORTS}${PRINCIPAL_MAPPER.replace("mintPrincipal({ userId,", "mintPrincipal({ userId: userId,")}${PRINCIPAL_BRIDGE}`,
        [COMPOSE_FILE]: PRINCIPAL_COMPOSE,
      },
      why: "an explicit property forward denotes the same parameter as shorthand; source spelling cannot turn the row projection into admission",
    },
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
      why: "A same-named local select operation carries no business decision; query vocabulary is not a per-call policy.",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]: "export function build(op: () => void) {\n  return { op };\n}\n",
        "packages/server/src/domain/x/persistence/q.ts": "export function read(id: string) {\n  return id.length > 0 ? [id] : [];\n}\n",
      },
      why: "POPULATION: a domain decision is outside the compose subject, beside an admitted compose anchor",
    },
    {
      mode: "types",
      files: {
        [COMPOSE_FILE]:
          'export function build(load: (id: string) => string) {\n  // @orb-waive compose-wiring-only(read): baselined while item 964 moves compose rules into their domains.\n  return { read: (id: string) => (id.length > 0 ? load(id) : "") };\n}\n',
      },
      why: "the ordinary waiver door at the reported op name, the form the item 964 baseline uses",
    },
    ...DEFER_CALLEES.map((callee) => ({
      mode: "types" as const,
      files: {
        [COMPOSE_FILE]: `/// <reference lib="esnext.disposable" />\nexport function build(active: () => boolean) { const s = new AsyncDisposableStack(); ${callee}(() => { if (active()) throw new Error("busy"); }); return s; }`,
      },
      why: `a transparent wrapper on the native defer callee (${callee}) keeps the shutdown phase; nomination and evaluation read through one unwrap`,
    })),
    ...EAGER_CALLEES.map((callee) => ({
      mode: "types" as const,
      files: {
        [COMPOSE_FILE]: `export function build(sizes: number[]) {\n  const big = ${callee}((size: number) => size > 1);\n  return { op: () => big };\n}\n`,
      },
      why: `a transparent wrapper on an eager library callee (${callee}) keeps its callback in the construction phase`,
    })),
    ...WRAPPED_MINTS.map(([from, to]) => ({
      mode: "types" as const,
      files: {
        ...PRINCIPAL_TYPE_FILES,
        [AUTH_SEAM]: `${PRINCIPAL_IMPORTS}${PRINCIPAL_MAPPER.replace(from, to)}${PRINCIPAL_BRIDGE}`,
        [COMPOSE_FILE]: PRINCIPAL_COMPOSE,
      },
      why: `a transparent wrapper on a canonical mint callee (${to}) keeps D1/D135 admission; every guard reads the unwrapped node`,
    })),
  ],
});
