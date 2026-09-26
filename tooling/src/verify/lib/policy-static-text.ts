// THE STATIC-TEXT READS of the `policy-soundness` family (#1971, #2040, #2055): which pieces of text are
// CERTAIN in an expression (`staticSegments`), every distinct text a message site can produce
// (`messageAlternatives`), the one whole string (`staticText`), the substring judgement against a module's
// sources (`discriminationOf`), and the waiver-spelling tests over a piece of text. Split out of
// `policy-descriptor-read.ts` at the size cap (2026-09-18); that module's header states WHY there are two
// reads and why a hit is certain while an absence is not. `unwrapExpression` here unwraps NonNull as well,
// which `ast-read.ts`'s does not — the family's own spelling. One-way: this module imports nothing from
// `policy-descriptor-read.ts`.
import { resolveStableExpression } from "@orb/tooling/_shared/reference-fact";
import { resolveCallableDeclaration } from "@orb/tooling/_shared/reference-fact-call";
import type { ArrowFunction, CallExpression, FunctionDeclaration, FunctionExpression, Identifier, Node as MorphNode, TemplateExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { Discrimination, StaticSegments } from "../contract/policy-descriptor-read.ts";
import { staticDerivedText } from "./static-derived-text.ts";

const WAIVE_OPENER = "@orb-waive ";
const WAIVE_FILE_OPENER = "@orb-waive-file";
/** A marker-form line: a comment whose CONTENT BEGINS with the opener (guide §8 — a spelling later in prose,
 *  inside a string or a regex is a MENTION, never a marker). The id group is the contract's kebab-case.
 *  Recognises both `@orb-waive` (line-adjacent) and `@orb-waive-file` (file-scoped) grammars. */
/** THE OPENER SET MIRRORS THE ENGINE'S, not TypeScript's alone: `lib/ordinary-waiver.ts#commentBody` reads
 *  `//` or `/*` in syntax carriers and `<!-- -->` (Markdown) or `--` (SQL) in resource carriers, so a
 *  resource-only ordinary policy's identity arm is a Markdown/CSS fixture with its carrier's comment syntax.
 *  A recogniser that admitted only TS openers read a real Markdown arm as "no arm" (2026-09-18). */
const MARKER_LINE_RE = /^[ \t]*(?:\/\/|\/\*|\{\/\*|<!--|--)[ \t]*@orb-waive(?:-file)? ([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\(/u;

export function unwrapExpression(node: MorphNode): MorphNode {
  let current = node;
  while (Node.isParenthesizedExpression(current) || Node.isAsExpression(current) || Node.isSatisfiesExpression(current) || Node.isNonNullExpression(current)) {
    current = current.getExpression();
  }
  return current;
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
    if (part.complete && part.segments.length <= 1) {
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

/** Authored text only comes from a stable callable declaration. Shared resolution keeps imported
 *  arrows, local aliases and reassigned functions consistent with every other callable consumer. */
function textFunctionOf(callee: MorphNode): ArrowFunction | FunctionDeclaration | FunctionExpression | undefined {
  const fact = resolveCallableDeclaration(callee);
  const declaration = fact.kind === "resolved" ? fact.value.declaration : undefined;
  return Node.isFunctionDeclaration(declaration) || Node.isArrowFunction(declaration) || Node.isFunctionExpression(declaration) ? declaration : undefined;
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
  const derived = staticDerivedText(call);
  if (derived !== undefined) {
    return { segments: nonEmpty([derived]), complete: true };
  }
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
      (Node.isTemplateExpression(fact.node) ||
        Node.isBinaryExpression(fact.node) ||
        Node.isConditionalExpression(fact.node) ||
        Node.isCallExpression(fact.node))
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
  if (part.complete && part.segments.length <= 1) {
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
  const derived = staticDerivedText(call);
  if (derived !== undefined) {
    return [{ segments: nonEmpty([derived]), complete: true }];
  }
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
    (Node.isTemplateExpression(fact.node) || Node.isBinaryExpression(fact.node) || Node.isConditionalExpression(fact.node) || Node.isCallExpression(fact.node))
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
  return read?.complete === true && read.segments.length <= 1 ? (read.segments[0] ?? "") : undefined;
}

/** Does a piece of static text MENTION the waiver spelling for this policy id (`@orb-waive <id>(` or
 *  `@orb-waive-file <id>(`)? The test a `fix` must pass — a mention is what an author needs to type,
 *  wherever in the sentence it sits. Either form satisfies the requirement. */
export function mentionsWaiverOf(segment: string, policyId: string): boolean {
  return segment.includes(`${WAIVE_OPENER}${policyId}(`) || segment.includes(`${WAIVE_FILE_OPENER} ${policyId}(`);
}

/** The policy ids named by MARKER-FORM lines inside a piece of static text: a line whose comment content
 *  begins with the opener. Fixture text, so `\n`-separated; a mention mid-sentence names nothing here. */
export function markerFormIdsOf(segment: string): readonly string[] {
  const ids: string[] = [];
  for (const line of segment.split(/\r?\n/u)) {
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
