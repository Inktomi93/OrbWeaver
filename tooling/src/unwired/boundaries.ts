// Where a value leaves the process. A send is no read: a field counts as read only where its receiver reads it, so a
// send names its destination (./open-sends.ts) and a Drizzle write carries each value into the column a query
// reads back.
import type { CallExpression, Expression, Node, ObjectLiteralExpression } from "@typescript/native/ast";
import {
  isArrayLiteralExpression,
  isArrowFunction,
  isAsExpression,
  isBinaryExpression,
  isBlock,
  isCallExpression,
  isConditionalExpression,
  isIdentifier,
  isNonNullExpression,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isSatisfiesExpression,
  SyntaxKind,
} from "@typescript/native/ast";

const SEND_DESTINATIONS = ["wire", "http", "log", "observability", "file", "error", "stored", "column", "provider", "dependency", "unclassified"] as const;
/** Where a serialized value goes. `wire`: a request body or a message to another realm. `http`: a server response.
 *  `log`: the platform console or a logging library, as the checker resolves the callee, directly or through an
 *  in-tree logger port. `observability`: a callee or receiver declared in {@link OBSERVABILITY_HOME}, or a global our
 *  own `declare global` publishes (the dev bridge).
 *  `stored`: a SQL parameter, so the column's reader parses it. `column`: a Drizzle write; on a reported field no query reads the column back.
 *  `provider`: a provider request the backends make. `dependency`: a library outside the tree, named as the receiver.
 *  `unclassified`: a return or a binding the scan cannot follow. */
export type SendDestination = (typeof SEND_DESTINATIONS)[number];

/** The observability foundation Tier-2-Foundation names: the logger, tracing, the rings and the `/api/_debug` read
 *  surface (D75). A value handed to a declaration here is read by the operator, not by product code. */
export const OBSERVABILITY_HOME = "packages/server/src/foundation/observability/";

/** The destinations a person reads from outside the process rather than code: a value sent only there is observed. */
export const OBSERVABILITY_SINKS: ReadonlySet<SendDestination> = new Set<SendDestination>(["log", "observability"]);

/** Where the tRPC packages live: a symbol they declare is the wire client's, not ours. */
export const TRPC_PACKAGE = "/node_modules/@trpc/";

/** The Drizzle package: its `sql` tag stores a value, a write through it is a column write, and its model types are
 *  computed from a table. */
export const DRIZZLE_PACKAGE = "drizzle-orm";

/** The provider backends make every provider request, so only a value there can reach one. */
export const PROVIDER_BODIES = "packages/inference/src/backends/";

/** Dotted-path readers by their declaration, `nestedValue(value, "a.b")`: the path is a wide string, so the call may read
 *  any nested member of its first argument. A function of the same name declared anywhere else is no reader. */
export const NESTED_READS: readonly { readonly file: string; readonly name: string }[] = [
  { file: "packages/client/src/lib/agent-bridge-appearance.ts", name: "nestedValue" },
];

/** A Drizzle write: the table expression, the value it stores (an object literal or any other expression), and the
 *  builder method's name, where the library fills the columns a whole value carries. */
export interface StoreWrite {
  readonly table: Expression;
  readonly value: Expression;
  readonly at: Node;
  /** The `insert` or `update` name the builder chain opens with: with `at`, what a reader confirms is Drizzle's. */
  readonly opener: Node;
}

const STORE_METHODS: ReadonlySet<string> = new Set(["values", "set"]);
const CONFLICT_METHODS: ReadonlySet<string> = new Set(["onConflictDoUpdate"]);
const INSERT_METHOD = "insert";
const SELECT_METHOD = "select";

// `db.insert(T)` or `db.update(T)` somewhere down the call chain a builder method is called on.
function tableOf(call: CallExpression): { readonly table: Expression; readonly opener: Node } | null {
  let at: Node = call.expression;
  while (isPropertyAccessExpression(at) || isCallExpression(at)) {
    if (isCallExpression(at) && isPropertyAccessExpression(at.expression)) {
      const method = at.expression.name.text;
      const [table] = at.arguments;
      if ((method === INSERT_METHOD || method === "update") && table !== undefined && at.arguments.length === 1) {
        return { table, opener: at.expression.name };
      }
    }
    at = at.expression;
  }
  return null;
}

const unwrapValue = (node: Expression): Expression => {
  let at = node;
  while (isParenthesizedExpression(at) || isAsExpression(at) || isSatisfiesExpression(at) || isNonNullExpression(at)) {
    at = at.expression;
  }
  return at;
};

// A stored literal through its parentheses and assertions, whose keys name the columns; any other value as written,
// since an assertion's type, not its operand's, is what the store carries.
function storedValue(node: Expression): Expression {
  const at = unwrapValue(node);
  return isObjectLiteralExpression(at) || isArrayLiteralExpression(at) ? at : node;
}

/** The values a Drizzle builder call stores: `.values(x)` and `.set(x)` after `insert(T)` or `update(T)`, an
 *  `onConflictDoUpdate({ set })`, and each element of an array literal handed to `.values`. */
export function storeWritesAt(node: Node): readonly StoreWrite[] {
  if (!(isCallExpression(node) && isPropertyAccessExpression(node.expression))) {
    return [];
  }
  const method = node.expression.name.text;
  const [argument] = node.arguments;
  if (argument === undefined || !(STORE_METHODS.has(method) || CONFLICT_METHODS.has(method))) {
    return [];
  }
  const opened = tableOf(node);
  if (opened === null) {
    return [];
  }
  let value: Expression | undefined = storedValue(argument);
  if (CONFLICT_METHODS.has(method)) {
    const set = isObjectLiteralExpression(value)
      ? value.properties.find((property) => isPropertyAssignment(property) && isIdentifier(property.name) && property.name.text === "set")
      : undefined;
    value = set !== undefined && isPropertyAssignment(set) ? storedValue(set.initializer) : undefined;
  }
  if (value === undefined) {
    return [];
  }
  const values = isArrayLiteralExpression(value) ? value.elements.map(storedValue) : [value];
  const at = node.expression.name;
  return values.map((stored) => ({ ...opened, value: stored, at }));
}

// The field object of a select chain, `db.select({ ... }).from(t).where(c)`, or of the chain a builder callback returns.
function selectedFields(query: Expression): ObjectLiteralExpression | null {
  let at: Node = unwrapValue(query);
  if (isArrowFunction(at) && !isBlock(at.body)) {
    at = unwrapValue(at.body);
  }
  while (isCallExpression(at) && isPropertyAccessExpression(at.expression)) {
    const [fields] = at.arguments;
    if (at.expression.name.text === SELECT_METHOD && fields !== undefined && isObjectLiteralExpression(fields)) {
      return fields;
    }
    at = at.expression.expression;
  }
  return null;
}

/** The fields an insert-select stores: `.insert(T).select(q)`, whose select chain, or the chain a builder callback
 *  returns, names in `select({ ... })` the column each selected value fills. */
export function insertSelectWritesAt(node: Node): readonly StoreWrite[] {
  if (!(isCallExpression(node) && isPropertyAccessExpression(node.expression) && node.expression.name.text === SELECT_METHOD)) {
    return [];
  }
  const [query] = node.arguments;
  const opened = tableOf(node);
  if (query === undefined || opened === null || !(isIdentifier(opened.opener) && opened.opener.text === INSERT_METHOD)) {
    return [];
  }
  const fields = selectedFields(query);
  return fields === null ? [] : [{ ...opened, value: fields, at: node.expression.name }];
}

/** The property read a stored key's value copies, through `??`, `||`, a conditional's branches and assertions: the
 *  read hands the value to the column and is no read of its own. */
export function copiedReads(value: Expression): readonly Node[] {
  const at = unwrapValue(value);
  if (isPropertyAccessExpression(at)) {
    return [at.name];
  }
  if (isBinaryExpression(at) && (at.operatorToken.kind === SyntaxKind.QuestionQuestionToken || at.operatorToken.kind === SyntaxKind.BarBarToken)) {
    return [...copiedReads(at.left), ...copiedReads(at.right)];
  }
  return isConditionalExpression(at) ? [...copiedReads(at.whenTrue), ...copiedReads(at.whenFalse)] : [];
}

/** A Drizzle table definition, `sqliteTable(name, columns, extra)`: its column keys, and the call whose span holds the
 *  column reads that define indexes and foreign keys rather than read stored values. */
export function tableDefinition(node: Node): { readonly call: CallExpression; readonly columns: ObjectLiteralExpression } | null {
  if (!(isCallExpression(node) && isIdentifier(node.expression) && node.expression.text === "sqliteTable")) {
    return null;
  }
  const columns = node.arguments[1];
  return columns !== undefined && isObjectLiteralExpression(columns) ? { call: node, columns } : null;
}
