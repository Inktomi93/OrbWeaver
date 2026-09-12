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
import type {
  ArrowFunction,
  CallExpression,
  FunctionDeclaration,
  FunctionExpression,
  Identifier,
  Node as MorphNode,
  ObjectLiteralExpression,
  PropertyAssignment,
  SourceFile,
  TemplateExpression,
} from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { Discrimination, FinalRegistration, ProofRows, ReportSiteMessage, StaticSegments } from "../contract/policy-descriptor-read.ts";
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
      if (Node.isIdentifier(callee) && isCanonicalDefineGate(callee)) {
        registration = { callee, argument, descriptor: argument !== undefined && Node.isObjectLiteralExpression(argument) ? argument : undefined };
      }
    }
  }
  return registration;
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

/** How many alternative texts one message expression may yield before this reader refuses. A conditional
 *  doubles the set and a template multiplies it, so the bound is a real one; past it the expression reads
 *  UNREADABLE rather than as a union, because a union of alternatives is exactly the false-TAUTOLOGY shape
 *  `messageAlternatives` exists to remove (#2055). */
const ALTERNATIVE_CAP = 32;
const UNREADABLE_ALTERNATIVE: StaticSegments = { segments: [], complete: false };

/** Every contiguous piece of static text an expression can contribute to ONE string value. A conditional
 *  contributes both branches (each is possible text), marked incomplete because which one appears is dynamic.
 *  `seen` is the cycle fence for the call reader; callers never pass it.
 *
 *  THIS IS THE "which pieces are certain" READ, and it is the right answer for a `fix` sentence or a
 *  diagnostic's text, where one expression is one subject. It is the WRONG answer for a message CENSUS —
 *  see `messageAlternatives`. */
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

/** One template span appended to one accumulated alternative, by `templateSegments`' own joining rule. */
function appendSpan(base: StaticSegments, part: StaticSegments, tail: string): StaticSegments {
  const segments = [...base.segments];
  const last = segments.length - 1;
  let complete = base.complete;
  if (part.complete && part.segments.length === 1) {
    segments[last] = `${segments[last] ?? ""}${part.segments[0] ?? ""}${tail}`;
  } else {
    complete = false;
    segments.push(...part.segments, tail);
  }
  return { segments, complete };
}

/** The template's alternatives: the cartesian product over its spans, each combination joined exactly as the
 *  single-read `templateSegments` joins one. `head ${a ? "x" : "y"} tail` is TWO texts, not one union. */
function templateAlternatives(node: TemplateExpression, seen: Set<object>): readonly StaticSegments[] {
  let accumulated: StaticSegments[] = [{ segments: [node.getHead().getLiteralText()], complete: true }];
  for (const span of node.getTemplateSpans()) {
    const parts = messageAlternatives(span.getExpression(), seen);
    if (accumulated.length * parts.length > ALTERNATIVE_CAP) {
      return [UNREADABLE_ALTERNATIVE];
    }
    const tail = span.getLiteral().getLiteralText();
    const next: StaticSegments[] = [];
    for (const base of accumulated) {
      for (const part of parts) {
        next.push(appendSpan(base, part, tail));
      }
    }
    accumulated = next;
  }
  return accumulated.map((alternative) => ({ segments: nonEmpty(alternative.segments), complete: alternative.complete }));
}

/** A call's alternatives: the callee's single return expression, read in place under the same cycle fence and
 *  the same "arguments are not substituted" rule `callSegments` uses. */
function callAlternatives(call: CallExpression, seen: Set<object>): readonly StaticSegments[] {
  const fn = textFunctionOf(unwrapExpression(call.getExpression()));
  const returned = fn === undefined ? undefined : returnExpressionOf(fn);
  const identity: object | undefined = fn?.compilerNode;
  let result: readonly StaticSegments[] = [UNREADABLE_ALTERNATIVE];
  if (returned !== undefined && identity !== undefined && !seen.has(identity)) {
    seen.add(identity);
    result = messageAlternatives(returned, seen);
    seen.delete(identity);
  }
  return result;
}

/** An alias's alternatives, through the same stable-binding resolver the single read uses. */
function identifierAlternatives(node: Identifier, seen: Set<object>): readonly StaticSegments[] {
  const fact = resolveStableExpression(node);
  let result: readonly StaticSegments[] = [UNREADABLE_ALTERNATIVE];
  if (fact.kind === "resolved") {
    result = messageAlternatives(fact.value, seen);
  } else if (
    fact.reason === "dynamic" &&
    (Node.isTemplateExpression(fact.node) || Node.isBinaryExpression(fact.node) || Node.isConditionalExpression(fact.node))
  ) {
    result = messageAlternatives(fact.node, seen);
  }
  return result;
}

/** EVERY DISTINCT TEXT one message expression can produce, one entry per alternative — the read a message
 *  CENSUS needs, and the one `staticSegments` cannot give (#2055).
 *
 *  `staticSegments` answers "which pieces of text are certain in this expression", and for a conditional it
 *  answers with the UNION of both branches in one record. That is correct for judging a substring against a
 *  single subject and WRONG as a census: a module whose one report site emits `found.unreadable ? A : B` has
 *  TWO message sources, and folding them made a substring living only in A read as matching the module's
 *  ONLY source — the TAUTOLOGY verdict, on three fail-closed `#2041` rows whose `messageIncludes` is the ONLY
 *  thing telling their arm from its sibling. Deleting it, which the finding's own remedy asked for, would
 *  have removed the discriminator from a HARD arm.
 *
 *  Every entry is certain in the branch it came from; an entry with no segments is a branch this reader could
 *  not read, and consumers count it as an unreadable SOURCE rather than as absent text. Past `ALTERNATIVE_CAP`
 *  the whole expression reads unreadable — the refusal, never a union. */
export function messageAlternatives(expression: MorphNode, seen: Set<object> = new Set()): readonly StaticSegments[] {
  const node = unwrapExpression(expression);
  let result: readonly StaticSegments[] = [staticSegments(node, seen)];
  if (Node.isTemplateExpression(node)) {
    result = templateAlternatives(node, seen);
  } else if (Node.isBinaryExpression(node) && node.getOperatorToken().getKind() === SyntaxKind.PlusToken) {
    const left = messageAlternatives(node.getLeft(), seen);
    const right = messageAlternatives(node.getRight(), seen);
    result = left.length * right.length > ALTERNATIVE_CAP ? [UNREADABLE_ALTERNATIVE] : left.flatMap((half) => right.map((rest) => concatSegments(half, rest)));
  } else if (Node.isConditionalExpression(node)) {
    const branches = [...messageAlternatives(node.getWhenTrue(), seen), ...messageAlternatives(node.getWhenFalse(), seen)];
    result = branches.length > ALTERNATIVE_CAP ? [UNREADABLE_ALTERNATIVE] : branches;
  } else if (Node.isCallExpression(node)) {
    result = callAlternatives(node, seen);
  } else if (Node.isIdentifier(node)) {
    result = identifierAlternatives(node, seen);
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
