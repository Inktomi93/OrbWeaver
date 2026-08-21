// The ARID ignorer — a Stryker ignore-plugin (`ignorers` config, PluginKind.Ignore) that suppresses
// mutants on string literals whose ONLY destination is an observability sink: a trace record, a
// trace-payload object, or a logger call. Wired into stryker.config.json + stryker.gate.config.json.
//
// WHY IT EXISTS. A surviving mutant is supposed to mean "a test covered this line and asserted nothing
// that would notice the change". A trace label breaks that contract in a way no test SHOULD fix: pinning
// `"room override"` byte-for-byte in a test asserts a debug string, not a behavior — writing that test to
// go green would be exactly the tautology `Spine-Testing.md` bans. Those mutants are permanent noise in
// the denominator, and noise in a ratchet's denominator is what makes a ratchet un-ratchetable: every
// honest score movement gets lost inside a fixed block of unkillable-by-design survivors.
//
// WHY IT IS STRUCTURAL, NOT ANNOTATED. Stryker ships `// Stryker disable` comments; this plugin
// deliberately does NOT use them. A per-site comment is a suppression an author can add to make their own
// mutant go away — the banned-escape-hatch reflex with a vendor's name on it. A structural predicate has
// no per-site opt-out: a string is arid because of WHERE IT SITS, and moving it out of the sink puts it
// back in the denominator automatically.
//
// WHAT IT DELIBERATELY DOES NOT CATCH. A string literal assigned to a LOCAL that is later returned into a
// trace sink (`assembly/assemble.ts` `overrideLabel()` — `source = "room override"`, returned, then passed
// to `recordOverrideSource`) is arid in FACT but not in SYNTAX. Recognising it needs data-flow, which an
// ignore-plugin (one node, no scope graph) cannot do. Those stay in the denominator; that is honest, and
// preferable to a name-shaped heuristic (`/Label$/` on the enclosing function) that would also swallow
// genuinely load-bearing strings the day someone names a function `promptLabel`.
//
// The ignore MESSAGE lands on the StringLiteral / TemplateLiteral node itself, never on the enclosing
// call: Stryker's IgnorerBookkeeper ignores the whole SUBTREE under the node that matched, so matching the
// call would silently swallow every operator/conditional mutant among its arguments too.
//
// Self-test: tests/tooling/mutation-arid-ignorer.test.ts — both arms (ignored AND not-ignored) are pinned.

import { declareValuePlugin, PluginKind } from "@stryker-mutator/api/plugin";

/** The babel AST subset this predicate reads. Local + unexported on purpose: `@stryker-mutator/api`
 *  declares `NodePath` as an EMPTY interface (the real type is babel's, which is not a dependency here),
 *  so the shape has to be named locally. Method parameters are bivariant, which is what lets the class
 *  below still satisfy `Ignorer`. */
interface AridNode {
  readonly type: string;
  readonly name?: string;
  readonly callee?: AridNode;
  readonly arguments?: readonly AridNode[];
  readonly object?: AridNode;
  readonly property?: AridNode;
  readonly computed?: boolean;
  readonly left?: AridNode;
  readonly right?: AridNode;
  readonly key?: AridNode;
  /** A node on `ObjectProperty` (the position this predicate reads); a primitive on a literal node. */
  readonly value?: AridNode | string | number | boolean;
  readonly properties?: readonly AridNode[];
}

interface AridPath {
  readonly node: AridNode;
  readonly parentPath?: AridPath | null;
}

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

const MESSAGE_LOGGER = "Observability: a logger-call string is diagnostic text, never behavior.";
const MESSAGE_RECORDER = "Observability: a trace-recorder argument only ever reaches the trace record.";
const MESSAGE_TRACE_APPEND = "Observability: a string appended to a trace collection is a trace label.";
const MESSAGE_TRACE_ASSIGN = "Observability: a string assigned into the trace is a trace label.";
const MESSAGE_TRACE_PAYLOAD = "Observability: a string in a trace-carrying payload object is a trace label.";

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

class AridIgnorer {
  shouldIgnore(path: AridPath): string | undefined {
    const node = path.node;
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
      (parent.type === CALL_NODE ? aridCallArgument(parent, node) : "") || (assigned ? MESSAGE_TRACE_ASSIGN : "") || aridTracePayload(parentPath, node);

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
