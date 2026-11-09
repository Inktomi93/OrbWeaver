// Where a value leaves the process. A send is no read: a field counts as read only where its receiver reads it, so a
// serialization names its destination and a Drizzle write carries each value into the column a query reads back.
import type { CallExpression, Expression, Node, ObjectLiteralExpression } from "@typescript/native/ast";
import {
  isArrayLiteralExpression,
  isAsExpression,
  isBinaryExpression,
  isCallExpression,
  isConditionalExpression,
  isIdentifier,
  isNewExpression,
  isNonNullExpression,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isSatisfiesExpression,
  isTaggedTemplateExpression,
  isTemplateExpression,
  isTemplateSpan,
  isThrowStatement,
  isVariableDeclaration,
  SyntaxKind,
} from "@typescript/native/ast";

const SEND_DESTINATIONS = ["wire", "http", "log", "file", "error", "stored", "column", "provider", "dependency", "unclassified"] as const;
/** Where a serialized value goes. `wire`: a request body or a message to another realm. `http`: a server response.
 *  `stored`: a SQL parameter, so the column's reader parses it. `column`: a Drizzle write; on a reported field no query reads the column back.
 *  `provider`: a provider request the backends make. `dependency`: a library outside the tree, named as the receiver.
 *  `unclassified`: a return or a binding the scan cannot follow. */
export type SendDestination = (typeof SEND_DESTINATIONS)[number];

/** The provider backends make every provider request, so only a value there can reach one. */
export const PROVIDER_BODIES = "packages/inference/src/backends/";

/** What a serialization does with its value: consumed whole in the process, or sent to a destination. */
export type Serialized = { readonly whole: true } | { readonly whole: false; readonly destination: SendDestination };

const WHOLE: Serialized = { whole: true };
const sent = (destination: SendDestination): Serialized => ({ whole: false, destination });

// Comparing or ordering two serializations reads every field of both.
const COMPARE_OPERATORS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.EqualsEqualsEqualsToken,
  SyntaxKind.ExclamationEqualsEqualsToken,
  SyntaxKind.EqualsEqualsToken,
  SyntaxKind.ExclamationEqualsToken,
  SyntaxKind.LessThanToken,
  SyntaxKind.GreaterThanToken,
  SyntaxKind.LessThanEqualsToken,
  SyntaxKind.GreaterThanEqualsToken,
]);

// A map or set method whose first argument is a key: a serialization there is a cache or identity key.
const KEYED_METHODS: ReadonlySet<string> = new Set(["get", "set", "has", "delete"]);
const HASHING = /hash|digest|fingerprint|sha\d*$|^update$/iu;
const KEY_BINDING = /key$|hash|fingerprint|signature|digest|identity/iu;
const LOG_METHODS: ReadonlySet<string> = new Set(["trace", "debug", "info", "warn", "error", "fatal", "log"]);
const FILE_CALLS = /^(?:writeFile|writeFileSync|appendFile|appendFileSync|write|writeSync)$/u;
const WIRE_CALLS: ReadonlySet<string> = new Set(["send", "postMessage", "enqueue", "fetch"]);
const BODY_KEYS: ReadonlySet<string> = new Set(["body", "data", "payload"]);

const calleeName = (call: CallExpression | Node): string | null => {
  const callee = (call as { readonly expression?: Node }).expression;
  if (callee === undefined) {
    return null;
  }
  if (isIdentifier(callee)) {
    return callee.text;
  }
  return isPropertyAccessExpression(callee) ? callee.name.text : null;
};

// The receiver a method is called on, by its last name: `logger` in `ctx.logger.info(...)`.
function receiverName(call: CallExpression): string | null {
  const callee = call.expression;
  if (!isPropertyAccessExpression(callee)) {
    return null;
  }
  const target = callee.expression;
  if (isIdentifier(target)) {
    return target.text;
  }
  return isPropertyAccessExpression(target) ? target.name.text : null;
}

// The node a serialization's string reaches: through parentheses, assertions, template text, string concatenation and
// an array of parts, as `new Blob([JSON.stringify(value)])` takes them.
function consumerOf(start: Node): { readonly node: Node; readonly parent: Node } {
  let node = start;
  for (;;) {
    const { parent } = node;
    const concatenated = isBinaryExpression(parent) && parent.operatorToken.kind === SyntaxKind.PlusToken;
    if (
      isArrayLiteralExpression(parent) ||
      isParenthesizedExpression(parent) ||
      isAsExpression(parent) ||
      isNonNullExpression(parent) ||
      isTemplateSpan(parent) ||
      isTemplateExpression(parent) ||
      concatenated
    ) {
      node = parent;
      continue;
    }
    return { node, parent };
  }
}

function serializedIntoCall(call: CallExpression, node: Node): Serialized {
  const name = calleeName(call);
  if (name === null) {
    return sent("unclassified");
  }
  if (KEYED_METHODS.has(name) && call.arguments[0] === node) {
    return WHOLE;
  }
  if (HASHING.test(name)) {
    return WHOLE;
  }
  const receiver = receiverName(call);
  if (receiver !== null && (receiver === "console" || /log/iu.test(receiver)) && LOG_METHODS.has(name)) {
    return sent("log");
  }
  if (FILE_CALLS.test(name)) {
    return sent("file");
  }
  return WIRE_CALLS.has(name) ? sent("wire") : sent("unclassified");
}

function serializedIntoNew(construct: Node): Serialized {
  const name = calleeName(construct);
  if (name === "Response") {
    return sent("http");
  }
  if (name === "Blob" || name === "TextEncoder") {
    return sent("file");
  }
  return name?.endsWith("Error") === true ? sent("error") : sent("unclassified");
}

/** What the `JSON.stringify` call `call` does with its value, read from where its string goes. */
export function serializedBy(call: CallExpression): Serialized {
  const { node, parent } = consumerOf(call);
  if (isBinaryExpression(parent) && COMPARE_OPERATORS.has(parent.operatorToken.kind)) {
    return WHOLE;
  }
  if (isTaggedTemplateExpression(parent) || (isTemplateSpan(node) && isTaggedTemplateExpression(node.parent.parent))) {
    return sent("stored");
  }
  if (isCallExpression(parent)) {
    return serializedIntoCall(parent, node);
  }
  if (isNewExpression(parent)) {
    return serializedIntoNew(parent);
  }
  if (isThrowStatement(parent)) {
    return sent("error");
  }
  if (isPropertyAssignment(parent) && isIdentifier(parent.name) && BODY_KEYS.has(parent.name.text)) {
    return sent("wire");
  }
  if (isVariableDeclaration(parent) && isIdentifier(parent.name) && KEY_BINDING.test(parent.name.text)) {
    return WHOLE;
  }
  return sent("unclassified");
}

/** A Drizzle write: the table expression and the value it stores, an object literal or any other expression. */
export interface StoreWrite {
  readonly table: Expression;
  readonly value: Expression;
}

const STORE_METHODS: ReadonlySet<string> = new Set(["values", "set"]);
const CONFLICT_METHODS: ReadonlySet<string> = new Set(["onConflictDoUpdate"]);

// `db.insert(T)` or `db.update(T)` somewhere down the call chain a builder method is called on.
function tableOf(call: CallExpression): Expression | null {
  let at: Node = call.expression;
  while (isPropertyAccessExpression(at) || isCallExpression(at)) {
    if (isCallExpression(at) && isPropertyAccessExpression(at.expression)) {
      const method = at.expression.name.text;
      const [table] = at.arguments;
      if ((method === "insert" || method === "update") && table !== undefined && at.arguments.length === 1) {
        return table;
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
  const table = tableOf(node);
  if (table === null) {
    return [];
  }
  let value: Expression | undefined = unwrapValue(argument);
  if (CONFLICT_METHODS.has(method)) {
    const set = isObjectLiteralExpression(value)
      ? value.properties.find((property) => isPropertyAssignment(property) && isIdentifier(property.name) && property.name.text === "set")
      : undefined;
    value = set !== undefined && isPropertyAssignment(set) ? unwrapValue(set.initializer) : undefined;
  }
  if (value === undefined) {
    return [];
  }
  const values = isArrayLiteralExpression(value) ? value.elements.map(unwrapValue) : [value];
  return values.map((stored) => ({ table, value: stored }));
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
