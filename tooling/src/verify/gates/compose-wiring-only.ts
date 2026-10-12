// Gate: compose-wiring-only — `entry/compose` wires and owns no business logic (Tier-5-Entry.md invariant 1), so a compose
// module runs no Drizzle query and no function value it hands out decides on runtime data. ARMS: a call whose method drizzle-orm
// declares, anywhere in compose (shared `readDrizzleClientCall`, fail-closed on an unbound query-verb spelling, table named by
// `resolveDrizzleTableRefs`); a decision (branch, loop, catch, `?:`, `&&`/`||`/`??`, comparison, `?.`) that runs per call: inside
// a function value compose hands out, or a named helper reachable from one. A decision in a factory body at construction is wiring.
// FAMILY: singleton — the execution-time classification is this subject's own; no sibling policy shares it. POPULATION: new.
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { DrizzleTableRef } from "../../floor/code-facts/drizzle-table-ref.ts";
import { resolveDrizzleTableRefs } from "../../floor/code-facts/drizzle-table-ref.ts";
import { readCalledMember } from "../../floor/code-facts/drizzle-write-chain.ts";
import { resolveCallableDeclaration } from "../../floor/code-facts/reference-fact-call.ts";
import { defineGate } from "../contract/policy.ts";
import { readDrizzleClientCall } from "../lib/drizzle-client-call.ts";

const COMPOSE_POPULATION = { in: ["@server"], under: ["packages/server/src/entry/compose/**"] } as const;

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
  return OPTIONAL_CHAIN_KINDS.has(node.getKind()) && node.getFirstChildByKind(SyntaxKind.QuestionDotToken) !== undefined ? node : undefined;
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

/** When each function runs. Named callables run per call when a reference hands them on as a value or calls them from per-call
 *  code, settled to a fixed point; every other function value runs per call unless the code around it invokes it eagerly. */
function phaseClassifier(named: ReadonlySet<object>, references: readonly Reference[]): (fn: MorphNode) => boolean {
  const perCallNamed = new Set<object>();
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
      const atFn = enclosingFunction(at);
      if (!perCallNamed.has(target.compilerNode) && (!called || (atFn !== undefined && perCall(atFn)))) {
        perCallNamed.add(target.compilerNode);
        changed = true;
      }
    }
    return changed;
  };
  while (settle()) {
    // Each pass can only add, and the named set is finite, so the loop ends.
  }
  return perCall;
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

export const gate = defineGate({
  id: "compose-wiring-only",
  family: "compose-wiring-only",
  authority: "ordinary",
  severity: "error",
  population: COMPOSE_POPULATION,
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
        const perCall = phaseClassifier(named, references(named));
        for (const decision of decisions) {
          const fn = enclosingFunction(decision);
          if (fn !== undefined && perCall(fn)) {
            subjectOf(decision, perCall).decision ??= decision;
          }
        }
        for (const call of calls) {
          const query = queryHead(call);
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
  ],
  mustPass: [
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
