// The `policy-soundness` family's shared reader (#1971): what a FINAL `defineGate` module says about itself,
// read statically and by IDENTITY. Four sibling policies consume it — `policy-soundness`,
// `policy-proof-expectations`, `policy-waiver-identity`, `policy-waiver-spelling` — so every read here is a
// shared reader by consumer count, not by address.
//
// Three things a text tool cannot do, which is why this exists (the brief measured each grep at 100% false
// positives on the live corpus): (1) a module is FINAL only when its `gate` initializer's callee resolves by
// import origin to `contract/policy.ts` (`isCanonicalDefineGate`) — a same-named local `defineGate` registers
// nothing; (2) a `fix`, a `message`, a `messageIncludes` and a fixture's content are read through the stable
// binding resolver as CONTIGUOUS STATIC SEGMENTS — const aliases, `+` concatenation and template spans that
// resolve are joined, a dynamic span breaks the segment — so a substring is only ever judged against text that
// can actually appear in one finding; (3) the report SINK is
// recognised through `resolveCallableMember`, so `ctx.report.node`, a destructured `report.node` and a const
// alias of the sink all read as the same site.
//
// A CALL is authored text or it is a value (#2040): a callee with ONE return expression is read THROUGH (its
// parameters stay dynamic, so the pieces are still certain); every other call — a method, a formatter such as
// `JSON.stringify`, a callee with statements — yields the empty incomplete read, which every consumer treats as
// UNREADABLE rather than as absent text. And because a HIT is certain while an ABSENCE is not, `complete` is
// load-bearing at the verdict: see `discriminationOf`.
// The bounded exception is lib/static-derived-text.ts: canonical freeze/keys and string-sequence join over
// proven inert inputs yield exact text. Its alias/effect refusals apply before either text query admits it.
//
// TWO READS, NOT ONE, AND THE DIFFERENCE IS THE CONDITIONAL (#2055). `staticSegments` answers "which pieces of
// text are CERTAIN in this expression" and folds a conditional's branches into one record — right for judging
// one subject (a `fix` sentence, a diagnostic's text), WRONG for a message CENSUS, where a site spelled
// `cond ? A : B` is two sources and never one text containing both. `messageAlternatives` is that second read:
// one entry per possible text. Consumers counting message SOURCES use it; every other consumer stays on the
// single read.
//
// Segments, not values, on purpose: `readExpressionString` (config-static-read.ts) answers "what WHOLE strings
// does this expression contribute" and refuses a template with a dynamic span outright; this family needs
// the opposite answer — "which pieces of text are certain" — because a `messageIncludes` substring that sits
// inside a certain piece matches every finding that site emits, whatever the dynamic part says.
//
// SPLIT AT THE SIZE CAP (2026-09-18): the static-text reads (2) — `staticSegments`, `messageAlternatives`,
// `staticText`, the waiver-spelling text tests, `enclosingStringExpression`, `discriminationOf` and the
// family's `unwrapExpression` — are `policy-static-text.ts`; the production-reach walk behind
// `policyProductionDependencies` is `policy-production-reach.ts`. Both are leaves; registration, the
// descriptor fields, proof rows and the report-site readers (3) stay here.

import { resolveStableExpression } from "@orb/tooling/_shared/reference-fact";
import type { CallExpression, Node as MorphNode, ObjectLiteralExpression, PropertyAssignment, ShorthandPropertyAssignment, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateContractKind } from "../contract/gate-corpus.ts";
import type { FinalRegistration, ProofRows, ReportSiteMessage } from "../contract/policy-descriptor-read.ts";
import { isCanonicalDefineGate, resolveCallableMember } from "./gate-contract-origin.ts";
import type { ProductionEdges } from "./policy-production-reach.ts";
import { reachableDeclarations } from "./policy-production-reach.ts";
import { messageAlternatives, unwrapExpression } from "./policy-static-text.ts";
import { readAuthoredArrayPresence } from "./static-authored-value.ts";

const REPORT_SINK = "report";
const REPORT_METHODS: ReadonlySet<string> = new Set(["node", "file"]);
/** The two property names the runtime and the one shared reporter read a finding message from:
 *  `report.*(_, { message })` (policy-pass-context.ts) and `text.unreadableMessage` (reviewed-grant-findings.ts:57). */
const MESSAGE_PROPERTY_NAMES: ReadonlySet<string> = new Set(["message", "unreadableMessage"]);

/** How a gate module REGISTERS under the final contract, or undefined: a `gate` variable whose initializer is a
 *  call whose callee resolves by import origin to `contract/policy.ts`. The descriptor is the argument WHEN it is
 *  a direct object literal; a non-literal argument (`defineGate(DESCRIPTOR)`) is still a registration — the loader
 *  brands the object it receives — with no readable descriptor, which is the §12.1 shape `policy-soundness` E7
 *  reports rather than the blind spot every arm used to skip (#2111, A42). A legacy descriptor object and a local
 *  lookalike read as no registration at all. */
export function finalRegistrationOf(sourceFile: SourceFile): FinalRegistration | undefined {
  const initializer = sourceFile.getVariableDeclaration("gate")?.getInitializer();
  let registration: FinalRegistration | undefined;
  if (initializer !== undefined) {
    const value = unwrapExpression(initializer);
    if (Node.isCallExpression(value)) {
      const callee = value.getExpression();
      const argument = value.getArguments()[0];
      // IDENTITY, NOT NODE KIND (#2199) — and REGISTRATION is a different question from CONFORMANCE.
      // `isCanonicalDefineGate` resolves a namespace member to the canonical export on its own, so the
      // `isIdentifier` test only narrowed the SPELLING: a module registering through
      // `import * as policy …; policy.defineGate({…})` read as NO REGISTRATION, and a module that registers
      // nothing is judged by no arm of the `policy-soundness` family at all — a silent green, not a refusal.
      //
      // THE NAMESPACE SPELLING REMAINS FORBIDDEN, deliberately: `lib/gate-contract.ts#usesDefineGate` keeps its
      // identifier-callee requirement and reports `descriptor-wrapper` for exactly this shape (pinned by
      // "refuses namespace, computed, and dynamic defineGate call shapes", tests/tooling/verify/lib/gate-contract.test.ts).
      // Widening THAT reader was this fix's first attempt and it deleted the ruling; widening THIS one is what
      // makes the ruling enforceable, because a module the family never recognises is a module whose contract
      // violation nobody reports. Recognise first, then judge.
      if (isCanonicalDefineGate(callee)) {
        registration = { callee, argument, descriptor: argument !== undefined && Node.isObjectLiteralExpression(argument) ? argument : undefined };
      }
    }
  }
  return registration;
}

/** How a gate module REGISTERS under EITHER contract, or undefined — the loader's rules 1 and 2 (`lib/loader.ts`)
 *  read statically: a `gate` variable whose initializer is a canonical `defineGate(…)` call is FINAL; a `gate`
 *  variable whose initializer is an object literal is LEGACY (the loader validates its fields; registration is
 *  the question here, validity is not); anything else registers nothing — a module with no `gate`, a local
 *  `defineGate` lookalike, a `gate` bound to a call that is not the contract's. The `policy-legacy-imports`
 *  sibling-gate arm (#2096) asks this of an import's TARGET, so a gate module can never be told apart from a
 *  shared proof surface under `gates/_proof/` by its directory — only by whether it registers. */
export function gateRegistrationOf(sourceFile: SourceFile): GateContractKind | undefined {
  let contract: GateContractKind | undefined;
  if (finalRegistrationOf(sourceFile) !== undefined) {
    contract = "final";
  } else {
    const initializer = sourceFile.getVariableDeclaration("gate")?.getInitializer();
    if (initializer !== undefined && Node.isObjectLiteralExpression(unwrapExpression(initializer))) {
      contract = "legacy";
    }
  }
  return contract;
}

/** Does this expression PROVABLY bind a parameter declaration? The receiver test behind `policy-soundness` E4: a
 *  policy `create` context and a fact context are both parameters, a local data object carrying its own
 *  `resources` field is not. Shared so the gate module owns no binding resolution of its own (#2097, §12.3 —
 *  `getSymbol().getDeclarations()` inside a gate module is the private-reader shape the family now reports). */
export function bindsParameter(expression: MorphNode): boolean {
  return Node.isIdentifier(expression) && (expression.getSymbol()?.getDeclarations() ?? []).some((declaration) => Node.isParameterDeclaration(declaration));
}

/** The FINAL descriptor literal of a gate module, or undefined: the registration's direct object literal. A
 *  legacy descriptor object, a local lookalike and a non-literal argument all read as "not a final descriptor" —
 *  an arm that must judge the non-literal shape reads `finalRegistrationOf` instead. */
export function finalDescriptorOf(sourceFile: SourceFile): ObjectLiteralExpression | undefined {
  return finalRegistrationOf(sourceFile)?.descriptor;
}

/** The value expression of one descriptor property (a shorthand property's value is its own name node). */
export function descriptorValue(object: ObjectLiteralExpression, name: string): MorphNode | undefined {
  const property = object.getProperty(name);
  let value: MorphNode | undefined;
  if (Node.isPropertyAssignment(property)) {
    value = property.getInitializer();
  } else if (Node.isShorthandPropertyAssignment(property)) {
    value = property.getNameNode();
  }
  return value;
}

/** The property node itself — the report anchor for a finding about that property. */
export function descriptorProperty(object: ObjectLiteralExpression, name: string): PropertyAssignment | ShorthandPropertyAssignment | undefined {
  const property = object.getProperty(name);
  return Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property) ? property : undefined;
}

/** Source-reachable production dependencies for a set of final descriptors. The roots are their create
 *  functions, never module proof builders or type-only references. Canonical declarations compare by node
 *  identity; stable derived values and callable wrappers are followed to a fixpoint, with no hop limit.
 *
 *  Caches belong to this census invocation. Shared helper edges are read once across the family corpus;
 *  no workspace state survives a source overwrite. A dependency's semantic fitness for a family remains
 *  a review obligation: possible source reach does not prove execution on every input or meaningful use. */
export function policyProductionDependencies(descriptors: readonly ObjectLiteralExpression[]): ReadonlyMap<ObjectLiteralExpression, ReadonlySet<MorphNode>> {
  const edges = new Map<object, ProductionEdges>();
  const result = new Map<ObjectLiteralExpression, ReadonlySet<MorphNode>>();
  for (const descriptor of descriptors) {
    const property = descriptor.getProperty("create");
    const create = Node.isMethodDeclaration(property) ? property : descriptorValue(descriptor, "create");
    result.set(descriptor, create === undefined ? new Set() : reachableDeclarations(create, edges));
  }
  return result;
}

/** Through immutable aliases to the terminal expression; a dynamic terminal (call, template, conditional…)
 *  is returned AS the terminal so the caller can read what static text it still carries. */
export function stableTerminal(expression: MorphNode): MorphNode | undefined {
  const node = unwrapExpression(expression);
  let terminal: MorphNode | undefined = node;
  if (Node.isIdentifier(node)) {
    const fact = resolveStableExpression(node);
    if (fact.kind === "resolved") {
      terminal = unwrapExpression(fact.value);
    } else {
      terminal = fact.reason === "dynamic" ? unwrapExpression(fact.node) : undefined;
    }
  }
  return terminal;
}

export function objectLiteralOf(expression: MorphNode | undefined): ObjectLiteralExpression | undefined {
  const terminal = expression === undefined ? undefined : stableTerminal(expression);
  return terminal !== undefined && Node.isObjectLiteralExpression(terminal) ? terminal : undefined;
}

type ArrayPresence = ReturnType<typeof readAuthoredArrayPresence>;

/** Array fields selected by one policy's semantic query. Only canonical final descriptor values are
 *  accepted consumption endpoints; an identically named field on an arbitrary object is not one.
 *  Undefined means absent. Present unreadable values retain their refusal rather than becoming empty. */
export function descriptorArrayPresence(
  descriptors: readonly ObjectLiteralExpression[],
  fields: readonly string[],
): ReadonlyMap<ObjectLiteralExpression, ReadonlyMap<string, ArrayPresence | undefined>> {
  const canonical = descriptors.filter((descriptor) => finalDescriptorOf(descriptor.getSourceFile()) === descriptor);
  const accepted = new Set(canonical.flatMap((descriptor) => fields.flatMap((field) => descriptorValue(descriptor, field) ?? [])));
  const result = new Map<ObjectLiteralExpression, ReadonlyMap<string, ArrayPresence | undefined>>();
  for (const descriptor of canonical) {
    const values = new Map<string, ArrayPresence | undefined>();
    for (const field of fields) {
      const property = descriptor.getProperty(field);
      const value = descriptorValue(descriptor, field);
      let read: ArrayPresence | undefined;
      if (value !== undefined) {
        read = readAuthoredArrayPresence(value, accepted);
      } else if (property !== undefined) {
        read = {
          kind: "unresolved",
          reason: "unsupported",
          node: property,
          detail: "array declaration is not a readable data property",
          trace: { declarations: [], origin: property },
        };
      }
      values.set(field, read);
    }
    result.set(descriptor, values);
  }
  return result;
}

interface RowCollector {
  readonly rows: ObjectLiteralExpression[];
  readonly unreadable: MorphNode[];
}

function collectElement(element: MorphNode, out: RowCollector): void {
  const unwrapped = unwrapExpression(element);
  if (Node.isSpreadElement(unwrapped)) {
    collectRows(unwrapped.getExpression(), out);
    return;
  }
  const row = stableTerminal(unwrapped);
  if (row !== undefined && Node.isObjectLiteralExpression(row)) {
    out.rows.push(row);
  } else if (row !== undefined && Node.isArrayLiteralExpression(row)) {
    collectRows(row, out);
  } else {
    out.unreadable.push(unwrapped);
  }
}

function collectRows(expression: MorphNode, out: RowCollector): void {
  const terminal = stableTerminal(expression);
  if (terminal === undefined) {
    out.unreadable.push(expression);
  } else if (Node.isArrayLiteralExpression(terminal)) {
    for (const element of terminal.getElements()) {
      collectElement(element, out);
    }
  } else if (Node.isObjectLiteralExpression(terminal)) {
    out.rows.push(terminal);
  } else {
    out.unreadable.push(terminal);
  }
}

/** The rows of a `mustFlag`/`mustPass` value: array literals, spreads and const aliases resolved; anything
 *  that does not end in an object literal is UNREADABLE and reported as such by the caller, never skipped. */
export function proofRowsOf(expression: MorphNode | undefined): ProofRows {
  const out = { rows: [] as ObjectLiteralExpression[], unreadable: [] as MorphNode[] };
  if (expression !== undefined) {
    collectRows(expression, out);
  }
  return out;
}

/** Is this call a report site — `<sink>.node(…)` / `<sink>.file(…)` where the sink resolves to a member
 *  named `report` through const aliases and destructuring? Returns the method, or undefined. */
export function reportSiteOf(call: CallExpression): "node" | "file" | undefined {
  const member = resolveCallableMember(call.getExpression());
  let method: "node" | "file" | undefined;
  if (member !== undefined && REPORT_METHODS.has(member.name) && resolveCallableMember(member.receiver)?.name === REPORT_SINK) {
    method = member.name === "node" ? "node" : "file";
  }
  return method;
}

/** Where a report site's message comes from: no details or no `message` key → the descriptor's `message`;
 *  a readable `message` value → its segments; details that are not an object literal, or a message with no
 *  static text at all → unreadable (the caller must not judge). */
export function reportSiteMessage(call: CallExpression): ReportSiteMessage {
  const details = call.getArguments()[1];
  let verdict: ReportSiteMessage = { kind: "policy" };
  if (details !== undefined) {
    const object = objectLiteralOf(details);
    if (object === undefined || object.getProperties().some((property) => Node.isSpreadAssignment(property))) {
      verdict = { kind: "unreadable" };
    } else {
      const message = descriptorValue(object, "message");
      if (message !== undefined) {
        const texts = messageAlternatives(message);
        verdict = texts.every(({ segments }) => segments.length === 0) ? { kind: "unreadable" } : { kind: "override", texts };
      }
    }
  }
  return verdict;
}

/** Is this property one the runtime or the shared reporter reads a finding message from? */
export function isMessageProperty(property: PropertyAssignment): boolean {
  return MESSAGE_PROPERTY_NAMES.has(property.getName());
}

/** The innermost enclosing `test(…)` / `it(…)` call, the unit a family-test arm lives in. */
export function enclosingTestCall(node: MorphNode): CallExpression | undefined {
  const ancestor = node.getFirstAncestor((candidate) => {
    if (!Node.isCallExpression(candidate)) {
      return false;
    }
    const callee = candidate.getExpression();
    return Node.isIdentifier(callee) && (callee.getText() === "test" || callee.getText() === "it");
  });
  return ancestor !== undefined && Node.isCallExpression(ancestor) ? ancestor : undefined;
}

/** The repo root a delivered source file was loaded under, derived from its repo-relative path — the only
 *  root a policy may know (the context carries none), and the one `inspectGateContract` needs to re-anchor. */
export function rootOf(sourceFile: SourceFile, repoRelativePath: string): string {
  const absolute = sourceFile.getFilePath().replaceAll("\\", "/");
  if (!absolute.endsWith(`/${repoRelativePath}`)) {
    throw new Error(`source file ${absolute} does not end with its repo-relative path ${repoRelativePath}`);
  }
  return absolute.slice(0, absolute.length - repoRelativePath.length - 1);
}

/** The `create` hook's context parameter — the symbol every escape of the context or its sink roots at. */
export function contextParameterOf(descriptor: ObjectLiteralExpression): object | undefined {
  const property = descriptor.getProperty("create");
  let hook: MorphNode | undefined;
  if (Node.isPropertyAssignment(property)) {
    const initializer = property.getInitializer();
    hook = initializer === undefined ? undefined : unwrapExpression(initializer);
  } else if (Node.isMethodDeclaration(property)) {
    hook = property;
  }
  const parameter =
    hook !== undefined && (Node.isArrowFunction(hook) || Node.isFunctionExpression(hook) || Node.isMethodDeclaration(hook))
      ? hook.getParameters()[0]
      : undefined;
  const name = parameter?.getNameNode();
  return name !== undefined && Node.isIdentifier(name) ? name.getSymbol()?.compilerSymbol : undefined;
}

/** Is this expression the context parameter, a member chain on it, or a binding/const alias of either? */
export function isContextRooted(expression: MorphNode, contextSymbol: object, seen: Set<object> = new Set()): boolean {
  let node = unwrapExpression(expression);
  while (Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node)) {
    node = unwrapExpression(node.getExpression());
  }
  const symbol = Node.isIdentifier(node) ? node.getSymbol()?.compilerSymbol : undefined;
  let rooted = false;
  if (symbol !== undefined && !seen.has(symbol)) {
    seen.add(symbol);
    const declaration = Node.isIdentifier(node) ? node.getSymbol()?.getDeclarations()[0] : undefined;
    let initializer: MorphNode | undefined;
    if (Node.isBindingElement(declaration)) {
      initializer = declaration.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getInitializer();
    } else if (Node.isVariableDeclaration(declaration)) {
      initializer = declaration.getInitializer();
    }
    rooted = symbol === contextSymbol || (initializer !== undefined && isContextRooted(initializer, contextSymbol, seen));
  }
  return rooted;
}

/** Does the checker type this expression as a string (or a string literal)? The fence that keeps an escape
 *  call's non-string arguments (a Set, a fact, a node) out of the message census. */
export function isStringTyped(expression: MorphNode): boolean {
  const type = expression.getType();
  return type.isString() || type.isStringLiteral() || type.isTemplateLiteral();
}

/** Does this module bind `name` at MODULE SCOPE — a const/let/var, a function, a class, an enum, or an
 *  import (named, aliased, default or namespace)? The resolution test behind `expect.countFrom` (#2001): the
 *  named driver must exist in the module whose row cites it, or the declared exemption names nothing and the
 *  row is back to asserting only "at least one finding". Shared so the STATIC arm (`policy-proof-expectations`
 *  ARM C) and the RUNTIME runner (`ops/policy-conformance.ts`) ask the identical question. */
export function declaresModuleName(sourceFile: SourceFile, name: string): boolean {
  let declared =
    sourceFile.getVariableDeclaration(name) !== undefined ||
    sourceFile.getFunction(name) !== undefined ||
    sourceFile.getClass(name) !== undefined ||
    sourceFile.getEnum(name) !== undefined;
  for (const declaration of sourceFile.getImportDeclarations()) {
    declared ||=
      declaration.getNamedImports().some((specifier) => (specifier.getAliasNode() ?? specifier.getNameNode()).getText() === name) ||
      declaration.getDefaultImport()?.getText() === name ||
      declaration.getNamespaceImport()?.getText() === name;
  }
  return declared;
}

const GATES_DIR = "tooling/src/verify/gates/";
const TS_SUFFIX = ".ts";

/** The policy id a corpus path names — `id` equals the filename by contract (`lib/policy-validation.ts`). */
export function policyIdOfPath(repoRelativePath: string): string {
  if (!(repoRelativePath.startsWith(GATES_DIR) && repoRelativePath.endsWith(TS_SUFFIX))) {
    throw new Error(`not a gate corpus path: ${repoRelativePath}`);
  }
  return repoRelativePath.slice(GATES_DIR.length, -TS_SUFFIX.length);
}
