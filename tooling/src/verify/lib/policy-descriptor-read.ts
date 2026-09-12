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
// resolve are joined, a dynamic span breaks the segment, and a conditional contributes BOTH branches — so a
// substring is only ever judged against text that can actually appear in one finding; (3) the report SINK is
// recognised through `resolveCallableMember`, so `ctx.report.node`, a destructured `report.node` and a const
// alias of the sink all read as the same site.
//
// A CALL is authored text or it is a value (#2040): a callee with ONE return expression is read THROUGH (its
// parameters stay dynamic, so the pieces are still certain); every other call — a method, a formatter such as
// `JSON.stringify`, a callee with statements — yields the empty incomplete read, which every consumer treats as
// UNREADABLE rather than as absent text. And because a HIT is certain while an ABSENCE is not, `complete` is
// load-bearing at the verdict: see `discriminationOf`.
//
// Segments, not values, on purpose: `readExpressionString` (config-static-read.ts) answers "what WHOLE strings
// does this expression contribute" and refuses a template with a dynamic span outright; this family needs
// the opposite answer — "which pieces of text are certain" — because a `messageIncludes` substring that sits
// inside a certain piece matches every finding that site emits, whatever the dynamic part says.
import type {
  ArrowFunction,
  CallExpression,
  FunctionDeclaration,
  FunctionExpression,
  Node as MorphNode,
  ObjectLiteralExpression,
  PropertyAssignment,
  SourceFile,
  TemplateExpression,
} from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { Discrimination, ProofRows, ReportSiteMessage, StaticSegments } from "../contract/policy-descriptor-read.ts";
import { isCanonicalDefineGate, resolveCallableMember } from "./gate-contract-origin.ts";
import { resolveStableExpression } from "./reference-fact.ts";

const REPORT_SINK = "report";
const REPORT_METHODS: ReadonlySet<string> = new Set(["node", "file"]);
/** The two property names the runtime and the one shared reporter read a finding message from:
 *  `report.*(_, { message })` (policy-pass-context.ts) and `text.unreadableMessage` (reviewed-grant-findings.ts:57). */
const MESSAGE_PROPERTY_NAMES: ReadonlySet<string> = new Set(["message", "unreadableMessage"]);
const WAIVE_OPENER = "@orb-waive ";
/** A marker-form line: a comment whose CONTENT BEGINS with the opener (guide §7 — a spelling later in prose,
 *  inside a string or a regex is a MENTION, never a marker). The id group is the contract's kebab-case. */
const MARKER_LINE_RE = /^[ \t]*(?:\/\/|\/\*|\{\/\*)[ \t]*@orb-waive ([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\(/u;

function unwrapExpression(node: MorphNode): MorphNode {
  let current = node;
  while (Node.isParenthesizedExpression(current) || Node.isAsExpression(current) || Node.isSatisfiesExpression(current) || Node.isNonNullExpression(current)) {
    current = current.getExpression();
  }
  return current;
}

/** The FINAL descriptor literal of a gate module, or undefined: a `gate` variable whose initializer is a call
 *  whose callee resolves by import origin to `contract/policy.ts`, taking a direct object literal. A legacy
 *  descriptor object, a local lookalike and a non-literal argument all read as "not a final descriptor". */
export function finalDescriptorOf(sourceFile: SourceFile): ObjectLiteralExpression | undefined {
  const initializer = sourceFile.getVariableDeclaration("gate")?.getInitializer();
  let descriptor: ObjectLiteralExpression | undefined;
  if (initializer !== undefined) {
    const value = unwrapExpression(initializer);
    if (Node.isCallExpression(value)) {
      const callee = value.getExpression();
      const argument = value.getArguments()[0];
      if (Node.isIdentifier(callee) && argument !== undefined && Node.isObjectLiteralExpression(argument) && isCanonicalDefineGate(callee)) {
        descriptor = argument;
      }
    }
  }
  return descriptor;
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
export function descriptorProperty(object: ObjectLiteralExpression, name: string): PropertyAssignment | undefined {
  const property = object.getProperty(name);
  return Node.isPropertyAssignment(property) ? property : undefined;
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

function nonEmpty(segments: readonly string[]): readonly string[] {
  return segments.filter((segment) => segment.length > 0);
}

function templateSegments(node: TemplateExpression, seen: Set<object>): StaticSegments {
  const segments: string[] = [node.getHead().getLiteralText()];
  let complete = true;
  for (const span of node.getTemplateSpans()) {
    const part = staticSegments(span.getExpression(), seen);
    const tail = span.getLiteral().getLiteralText();
    const last = segments.length - 1;
    if (part.complete && part.segments.length === 1) {
      segments[last] = `${segments[last] ?? ""}${part.segments[0] ?? ""}${tail}`;
    } else {
      complete = false;
      segments.push(...part.segments, tail);
    }
  }
  return { segments: nonEmpty(segments), complete };
}

function concatSegments(left: StaticSegments, right: StaticSegments): StaticSegments {
  const segments = [...left.segments];
  const rest = [...right.segments];
  // The boundary is contiguous only when BOTH halves are whole; a dynamic edge on either side means the
  // two pieces are separated by text this reader cannot see.
  if (left.complete && right.complete && segments.length > 0 && rest.length > 0) {
    const last = segments.length - 1;
    segments[last] = `${segments[last] ?? ""}${rest.shift() ?? ""}`;
  }
  return { segments: nonEmpty([...segments, ...rest]), complete: left.complete && right.complete };
}

/** The function a callee names, through an import alias: a `function` declaration, or a const bound to an arrow
 *  or function expression. A method, a computed callee and an overloaded/ambiguous symbol all read as none. */
function textFunctionOf(callee: MorphNode): ArrowFunction | FunctionDeclaration | FunctionExpression | undefined {
  const symbol = Node.isIdentifier(callee) ? callee.getSymbol() : undefined;
  const declarations = (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? [];
  const declaration = declarations.length === 1 ? declarations[0] : undefined;
  const initializer = Node.isVariableDeclaration(declaration) ? declaration.getInitializer() : undefined;
  const value = initializer === undefined ? undefined : unwrapExpression(initializer);
  let fn: ArrowFunction | FunctionDeclaration | FunctionExpression | undefined;
  if (Node.isFunctionDeclaration(declaration)) {
    fn = declaration;
  } else if (value !== undefined && (Node.isArrowFunction(value) || Node.isFunctionExpression(value))) {
    fn = value;
  }
  return fn;
}

/** The ONE expression a text function always returns: an expression-bodied arrow, or a body whose single
 *  statement is a `return`. Several statements, a branch, or an ambient declaration with no body: none. */
function returnExpressionOf(fn: ArrowFunction | FunctionDeclaration | FunctionExpression): MorphNode | undefined {
  const body = fn.getBody();
  const statements = body !== undefined && Node.isBlock(body) ? body.getStatements() : [];
  const only = statements.length === 1 ? statements[0] : undefined;
  let returned: MorphNode | undefined;
  if (body !== undefined && !Node.isBlock(body)) {
    returned = body;
  } else if (Node.isReturnStatement(only)) {
    returned = only.getExpression();
  }
  return returned;
}

/** A call whose result is AUTHORED TEXT this reader can see whole (#2040): the callee's single return
 *  expression, read in place. ARGUMENTS ARE NOT SUBSTITUTED — a parameter identifier resolves to nothing and
 *  breaks the segment exactly like an inline `${value}` span — so every piece this yields is certain in EVERY
 *  result, which is the only property the family's substring judgements rest on. Anything else (a method, a
 *  value formatter like `JSON.stringify`, a callee with statements before its return, a cycle) yields the empty
 *  incomplete read: "I could not read this", which the census counts as an unreadable SOURCE, never as absence. */
function callSegments(call: CallExpression, seen: Set<object>): StaticSegments {
  const fn = textFunctionOf(unwrapExpression(call.getExpression()));
  const returned = fn === undefined ? undefined : returnExpressionOf(fn);
  const identity: object | undefined = fn?.compilerNode;
  let result: StaticSegments = { segments: [], complete: false };
  if (returned !== undefined && identity !== undefined && !seen.has(identity)) {
    seen.add(identity);
    result = staticSegments(returned, seen);
    seen.delete(identity);
  }
  return result;
}

/** Every contiguous piece of static text an expression can contribute to ONE string value. A conditional
 *  contributes both branches (each is possible text), marked incomplete because which one appears is dynamic.
 *  `seen` is the cycle fence for the call reader; callers never pass it. */
export function staticSegments(expression: MorphNode, seen: Set<object> = new Set()): StaticSegments {
  const node = unwrapExpression(expression);
  let result: StaticSegments = { segments: [], complete: false };
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    result = { segments: nonEmpty([node.getLiteralText()]), complete: true };
  } else if (Node.isTemplateExpression(node)) {
    result = templateSegments(node, seen);
  } else if (Node.isBinaryExpression(node) && node.getOperatorToken().getKind() === SyntaxKind.PlusToken) {
    result = concatSegments(staticSegments(node.getLeft(), seen), staticSegments(node.getRight(), seen));
  } else if (Node.isConditionalExpression(node)) {
    result = { segments: [...staticSegments(node.getWhenTrue(), seen).segments, ...staticSegments(node.getWhenFalse(), seen).segments], complete: false };
  } else if (Node.isCallExpression(node)) {
    result = callSegments(node, seen);
  } else if (Node.isIdentifier(node)) {
    const fact = resolveStableExpression(node);
    if (fact.kind === "resolved") {
      result = staticSegments(fact.value, seen);
    } else if (
      fact.reason === "dynamic" &&
      (Node.isTemplateExpression(fact.node) || Node.isBinaryExpression(fact.node) || Node.isConditionalExpression(fact.node))
    ) {
      result = staticSegments(fact.node, seen);
    }
  }
  return result;
}

/** The ONE whole static string an expression evaluates to, or undefined when any part is dynamic. */
export function staticText(expression: MorphNode | undefined): string | undefined {
  const read = expression === undefined ? undefined : staticSegments(expression);
  return read?.complete === true && read.segments.length === 1 ? read.segments[0] : undefined;
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

/** Every value expression of a proof row's `files` map, spreads resolved through their const one hop. */
export function filesContentsOf(filesExpression: MorphNode | undefined): readonly MorphNode[] {
  const out: MorphNode[] = [];
  const object = objectLiteralOf(filesExpression);
  for (const property of object?.getProperties() ?? []) {
    if (Node.isSpreadAssignment(property)) {
      out.push(...filesContentsOf(property.getExpression()));
    } else if (Node.isPropertyAssignment(property)) {
      const initializer = property.getInitializer();
      if (initializer !== undefined) {
        out.push(initializer);
      }
    } else if (Node.isShorthandPropertyAssignment(property)) {
      out.push(property.getNameNode());
    }
  }
  return out;
}

/** Does a piece of static text MENTION the waiver spelling for this policy id (`@orb-waive <id>(`)? The test
 *  a `fix` must pass — a mention is what an author needs to type, wherever in the sentence it sits. */
export function mentionsWaiverOf(segment: string, policyId: string): boolean {
  return segment.includes(`${WAIVE_OPENER}${policyId}(`);
}

/** The policy ids named by MARKER-FORM lines inside a piece of static text: a line whose comment content
 *  begins with the opener. Fixture text, so `\n`-separated; a mention mid-sentence names nothing here. */
export function markerFormIdsOf(segment: string): readonly string[] {
  const ids: string[] = [];
  for (const line of segment.split("\n")) {
    const match = MARKER_LINE_RE.exec(line);
    if (match?.[1] !== undefined) {
      ids.push(match[1]);
    }
  }
  return ids;
}

/** The TOPMOST string expression a literal belongs to — its template, concatenation or parenthesised
 *  parent chain — so one composed string is read once, whole, whichever piece the walk delivered. */
export function enclosingStringExpression(literal: MorphNode): MorphNode {
  let top = literal;
  for (let parent = top.getParent(); parent !== undefined; parent = top.getParent()) {
    const joins =
      Node.isTemplateSpan(parent) ||
      Node.isTemplateExpression(parent) ||
      Node.isParenthesizedExpression(parent) ||
      (Node.isBinaryExpression(parent) && parent.getOperatorToken().getKind() === SyntaxKind.PlusToken);
    if (!joins) {
      break;
    }
    top = parent;
  }
  return top;
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
        const text = staticSegments(message);
        verdict = text.segments.length === 0 ? { kind: "unreadable" } : { kind: "override", text };
      }
    }
  }
  return verdict;
}

/** Is this property one the runtime or the shared reporter reads a finding message from? */
export function isMessageProperty(property: PropertyAssignment): boolean {
  return MESSAGE_PROPERTY_NAMES.has(property.getName());
}

/** Judge one `messageIncludes` substring against the module's distinct message sources. `sources` is the set
 *  of texts a finding can carry; `unreadable` is how many sources could not be read at all.
 *
 *  A HIT is CERTAIN: a substring inside a certain piece appears in text that source really emits. An ABSENCE is
 *  NOT — and `discriminates` is precisely a claim of absence from every OTHER source (#2040). So a non-hitting
 *  source that was read only in part (a dynamic span, a call this reader refused, a conditional) leaves the row
 *  UNJUDGED rather than passed: the piece nobody could see may carry the substring, which would make it
 *  `shared`. `shared` and `tautology` — the two verdicts that FIND — rest on certain hits only and are unmoved. */
export function discriminationOf(substring: string, sources: readonly StaticSegments[], unreadable: number): Discrimination {
  const hits = sources.filter((source) => source.segments.some((segment) => segment.includes(substring)));
  const blindMiss = sources.some((source) => !(source.complete || hits.includes(source)));
  let verdict: Discrimination = "discriminates";
  if (unreadable > 0) {
    verdict = "unjudged";
  } else if (hits.length >= 2) {
    verdict = "shared";
  } else if (hits.length === 1 && sources.length === 1) {
    verdict = "tautology";
  } else if (hits.length === 0 || blindMiss) {
    verdict = "unjudged";
  }
  return verdict;
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

const GATES_DIR = "tooling/src/verify/gates/";
const TS_SUFFIX = ".ts";

/** The policy id a corpus path names — `id` equals the filename by contract (`lib/policy-validation.ts`). */
export function policyIdOfPath(repoRelativePath: string): string {
  if (!(repoRelativePath.startsWith(GATES_DIR) && repoRelativePath.endsWith(TS_SUFFIX))) {
    throw new Error(`not a gate corpus path: ${repoRelativePath}`);
  }
  return repoRelativePath.slice(GATES_DIR.length, -TS_SUFFIX.length);
}
