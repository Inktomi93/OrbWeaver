// The ARID ignorer: drops mutants no honest test should kill, by where the code sits, never by a per-site comment.
// Three families: a string whose only destination is a trace or log sink, an arm tsc proved unreachable (a `never`-typed
// binding), and error prose. A string reaching a sink through a local stays scored; recognizing it needs data flow.

import { declareValuePlugin, PluginKind } from "@stryker-mutator/api/plugin";

import type { AridNode, AridPath } from "../contract/types.ts";

// Stryker ignores the whole subtree under a match, so family (1) matches the string itself: matching the call would
// also swallow the operator mutants among its arguments. Family (2) matches the arm, where that is the point.
const STRING_NODES = ["StringLiteral", "TemplateLiteral"] as const;
const CALL_NODE = "CallExpression";
const MEMBER_NODE = "MemberExpression";
const IDENTIFIER_NODE = "Identifier";
const OBJECT_NODE = "ObjectExpression";
const OBJECT_PROPERTY_NODE = "ObjectProperty";
const ASSIGNMENT_NODE = "AssignmentExpression";

/** pino's level methods — the receiver is matched separately so `x.error("…")` on a non-logger is safe. */
const LOG_METHODS: readonly string[] = ["trace", "debug", "info", "warn", "error", "fatal"];
/** Receivers we accept as a logger. Deliberately tiny: the house spelling is `log` (foundation/observability). */
const LOG_RECEIVERS: readonly string[] = ["log", "logger"];
/** Array mutators that append to a trace collection. */
const APPEND_METHODS: readonly string[] = ["push", "unshift"];
/** The house name for a trace value — as an identifier (`trace.x`) or a property (`env.trace.x`). */
const TRACE_NAME = "trace";
/** The house naming convention for a trace-recording helper: `recordOverrideSource`, `recordMergedCacheBuster`. */
const RECORDER_RE = /^record[A-Z]/u;

/** Whitespace is what separates prose from a code, key or mode: `"too-large"` steers behavior, `"over the limit"` is read. */
const WHITESPACE_RE = /\s/u;
const ERROR_CLASS_RE = /(?:Error|Refusal)$/u;
const NEW_NODE = "NewExpression";
const MESSAGE_KEY = "message";
const STRING_COERCION = "String";

const MESSAGE_LOGGER = "Observability: a logger-call string is diagnostic text, never behavior.";
const MESSAGE_RECORDER = "Observability: a trace-recorder argument only ever reaches the trace record.";
const MESSAGE_TRACE_APPEND = "Observability: a string appended to a trace collection is a trace label.";
const MESSAGE_TRACE_ASSIGN = "Observability: a string assigned into the trace is a trace label.";
const MESSAGE_TRACE_PAYLOAD = "Observability: a string in a trace-carrying payload object is a trace label.";
const MESSAGE_ERROR_PROSE = "Copy: error prose is read, never branched on, and no test may pin copy.";

function nameOf(node: AridNode | undefined): string {
  return (node?.type === IDENTIFIER_NODE ? node.name : undefined) ?? "";
}

/** The callee's own name — `foo(…)` → "foo", `a.b.foo(…)` → "foo" ("" for a computed `a[k](…)`). */
function calleeName(callee: AridNode | undefined): string {
  if (callee?.type === IDENTIFIER_NODE) {
    return nameOf(callee);
  }
  return callee?.type === MEMBER_NODE && callee.computed !== true ? nameOf(callee.property) : "";
}

/** Does the member chain rooted at `node` mention `trace` — as the base identifier or any static property?
 *  Covers `trace.staticSections`, `env.trace.dynamicSections`, `this.trace.x`. */
function chainMentionsTrace(node: AridNode | undefined): boolean {
  let current = node;
  while (current !== undefined) {
    if (nameOf(current) === TRACE_NAME) {
      return true;
    }
    if (current.type !== MEMBER_NODE) {
      return false;
    }
    if (current.computed !== true && nameOf(current.property) === TRACE_NAME) {
      return true;
    }
    current = current.object;
  }
  return false;
}

function isArgumentOf(call: AridNode, node: AridNode): boolean {
  return call.arguments?.includes(node) === true;
}

/** An object literal that carries a `trace` property IS a trace-recording payload (the shape
 *  `assembly/assemble.ts` `appendInjections({ sections, label, trace, … })` uses). */
function carriesTrace(object: AridNode): boolean {
  return (
    object.properties?.some((property) => property.type === OBJECT_PROPERTY_NODE && property.computed !== true && nameOf(property.key) === TRACE_NAME) === true
  );
}

/** R1-R3: the string sits in an argument position of an observability call. */
function aridCallArgument(call: AridNode, node: AridNode): string {
  if (!isArgumentOf(call, node)) {
    return "";
  }
  const callee = call.callee;
  const method = calleeName(callee);
  const receiver = nameOf(callee?.object).toLowerCase();
  if (LOG_METHODS.includes(method) && LOG_RECEIVERS.includes(receiver)) {
    return MESSAGE_LOGGER;
  }
  if (RECORDER_RE.test(method)) {
    return MESSAGE_RECORDER;
  }
  if (APPEND_METHODS.includes(method) && chainMentionsTrace(callee?.object)) {
    return MESSAGE_TRACE_APPEND;
  }
  return "";
}

/** R5: the string is a value in an object literal that also carries a `trace` property. */
function aridTracePayload(parentPath: AridPath, node: AridNode): string {
  const property = parentPath.node;
  if (property.type !== OBJECT_PROPERTY_NODE || property.value !== node) {
    return "";
  }
  const grandParent = parentPath.parentPath;
  if (!grandParent) {
    return "";
  }
  const object = grandParent.node;
  return object.type === OBJECT_NODE && carriesTrace(object) ? MESSAGE_TRACE_PAYLOAD : "";
}

// --- family (2): compile-time-unreachable arms ---
const SWITCH_CASE_NODE = "SwitchCase";
const BLOCK_NODE = "BlockStatement";
const VARIABLE_DECLARATION_NODE = "VariableDeclaration";
const NEVER_KEYWORD = "TSNeverKeyword";

const MESSAGE_UNREACHABLE_ARM = "Exhaustiveness: a `never`-typed arm is compile-time unreachable — no test can execute it.";

/** Does this statement declare a `never`-typed binding (`const _exhaustive: never = x`)? That declaration
 *  is the house marker for an arm tsc has proved unreachable — it only compiles when every real member is
 *  handled above it, which is exactly why nothing can run it. */
function declaresNever(statement: AridNode | undefined): boolean {
  if (statement?.type !== VARIABLE_DECLARATION_NODE) {
    return false;
  }
  return statement.declarations?.some((declarator) => declarator.id?.typeAnnotation?.typeAnnotation?.type === NEVER_KEYWORD) === true;
}

/** Statements directly inside an arm — unwrapping the single-block form (`default: { … }`). */
function armStatements(statements: readonly AridNode[] | undefined): readonly AridNode[] {
  if (statements?.length === 1 && statements[0]?.type === BLOCK_NODE) {
    return statements[0].body ?? [];
  }
  return statements ?? [];
}

/** R6: the node IS an unreachable arm — a `default:` case, or a block, that declares a `never` binding. */
function aridUnreachableArm(node: AridNode): string {
  if (node.type === SWITCH_CASE_NODE) {
    // `test` is absent/null on `default:` only; a `case x:` arm is reachable and stays in the denominator.
    const isDefaultArm = node.test === undefined || node.test === null;
    return isDefaultArm && armStatements(node.consequent).some(declaresNever) ? MESSAGE_UNREACHABLE_ARM : "";
  }
  if (node.type === BLOCK_NODE) {
    return (node.body ?? []).some(declaresNever) ? MESSAGE_UNREACHABLE_ARM : "";
  }
  return "";
}

// --- family (3): error prose ---

function staticText(node: AridNode): string {
  return typeof node.value === "string" ? node.value : (node.quasis ?? []).map((quasi) => quasi.value.raw).join("");
}

/** An interpolation Stryker has nothing to mutate in. Matching a template swallows its whole subtree, so one holding an
 *  operator stays scored: `${a ?? b}` is logic even inside a message. */
function isPlainValue(node: AridNode | undefined): boolean {
  if (node?.type === MEMBER_NODE) {
    return node.computed !== true && isPlainValue(node.object);
  }
  if (node?.type === CALL_NODE) {
    return nameOf(node.callee) === STRING_COERCION && node.arguments?.length === 1 && isPlainValue(node.arguments[0]);
  }
  return node?.type === IDENTIFIER_NODE;
}

function isErrorConstruction(node: AridNode | undefined): boolean {
  return node?.type === NEW_NODE && ERROR_CLASS_RE.test(calleeName(node.callee));
}

/** R7: prose handed to an error class, as an argument or as the `message` of an options object. */
function aridErrorProse(parentPath: AridPath, node: AridNode): string {
  if (!(WHITESPACE_RE.test(staticText(node)) && (node.expressions ?? []).every(isPlainValue))) {
    return "";
  }
  const parent = parentPath.node;
  if (isErrorConstruction(parent)) {
    return isArgumentOf(parent, node) ? MESSAGE_ERROR_PROSE : "";
  }
  const object = parentPath.parentPath;
  const isMessageValue = parent.type === OBJECT_PROPERTY_NODE && parent.value === node && parent.computed !== true && nameOf(parent.key) === MESSAGE_KEY;
  return isMessageValue && object?.node.type === OBJECT_NODE && isErrorConstruction(object.parentPath?.node) ? MESSAGE_ERROR_PROSE : "";
}

class AridIgnorer {
  shouldIgnore(path: AridPath): string | undefined {
    const node = path.node;
    // Family (2) first: it matches the ARM itself, which has no string-node shape and may sit at the
    // program root (a switch case's parentPath is the SwitchStatement, but a block need not have one).
    const unreachable = aridUnreachableArm(node);
    if (unreachable !== "") {
      return unreachable;
    }
    const parentPath = path.parentPath;
    if (!parentPath) {
      return;
    }
    if (!STRING_NODES.some((kind) => kind === node.type)) {
      return;
    }
    const parent = parentPath.node;

    // R4: the string is assigned into the trace (`trace.x = "…"`).
    const assigned = parent.type === ASSIGNMENT_NODE && parent.right === node && chainMentionsTrace(parent.left);
    const message =
      (parent.type === CALL_NODE ? aridCallArgument(parent, node) : "") ||
      (assigned ? MESSAGE_TRACE_ASSIGN : "") ||
      aridTracePayload(parentPath, node) ||
      aridErrorProse(parentPath, node);

    return message === "" ? undefined : message;
  }
}

/** The plugin name Stryker's `ignorers: [...]` config refers to. */
export const ARID_IGNORER_NAME = "arid";

/** Exported for the self-test — the predicate, without the plugin envelope. */
export function shouldIgnoreArid(path: AridPath): string | undefined {
  return new AridIgnorer().shouldIgnore(path);
}

export const strykerPlugins = [declareValuePlugin(PluginKind.Ignore, ARID_IGNORER_NAME, new AridIgnorer())];
