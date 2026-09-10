// The ARID ignorer — a Stryker ignore-plugin (`ignorers` config, PluginKind.Ignore) that suppresses
// mutants on string literals whose ONLY destination is an observability sink: a trace record, a
// trace-payload object, or a logger call. Wired into stryker.config.js + stryker.gate.config.js.
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
// TWO FAMILIES ARE ARID, for different reasons:
//   (1) OBSERVABILITY — a string whose only destination is a trace/log sink. A test pinning a debug label
//       byte-for-byte would be the tautology Spine-Testing.md bans, so no honest test kills it.
//   (2) COMPILE-TIME-UNREACHABLE ARMS — a `default:` case (or block) that declares a `never`-typed const.
//       Nothing can kill those mutants, because tsc has already proved the arm cannot execute; the
//       exhaustive-dispatch discipline (Spine-TypeScript-and-Patterns §"String-union dispatch") puts one
//       in EVERY dispatch site in the codebase, so leaving them in pins dead weight under every score
//       computed over a dispatching file. Measured 2026-08-26 by `pnpm mutation:probe` on
//       domain/admin/guard.ts: 6 of its 8 planted survivors were exactly this, 25% of that file's
//       denominator, permanently unkillable.
//
// Family (2) matches the ARM node, not the leaf: Stryker's IgnorerBookkeeper ignores the whole subtree
// under a match, and here that is the point — every mutant inside an unreachable arm is unkillable. This
// is the deliberate opposite of family (1), where matching the enclosing call would swallow real mutants.
//
// Self-test: tests/tooling/mutation-arid/lib/predicate.test.ts — every arm, both directions.

import { declareValuePlugin, PluginKind } from "@stryker-mutator/api/plugin";

import type { AridNode, AridPath } from "../contract/types.ts";

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
