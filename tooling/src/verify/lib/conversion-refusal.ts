// The reader behind `gates/conversion-refusal-liveness.ts` (#2017): a module's recorded #1584 conversion
// refusal, read as authored SOURCE SHAPE through the shared `readStaticAuthoredValue` reader rather than a
// private parser, plus the header-opener recogniser that finds a refusal written only as prose.
//
// THE OPENER IS A COMMENT-OPENER FENCE, which is the house rule for every marker vocabulary on this tree
// (`GATE-AUTHORING.md` §3's MENTION FENCE): the line's OWN text begins the grammar, so a quotation of the
// grammar inside a sentence, a string or a doc comment is an inert MENTION. Here that fence is what lets
// the policy scan the gate corpus — including the two modules whose headers narrate their own refusal at
// length — without the corpus's own prose self-flagging.
//
// THE PREDICATE IS CASE-SENSITIVE ON THE VERDICT WORD, and that is the whole discrimination. Measured
// 2026-09-12 across all 297 `tooling/src/verify/gates/*.ts`: four modules open a header line with
// `// CONVERSION`, and only the two that are actually refusing carry `REFUSED`/`BLOCKED` in caps —
// `runner-config-path-liveness.ts:26` narrates its COMPLETED conversion ("The legacy header refused
// conversion on a …", lowercase) and `no-raw-random.ts:18` opens `// CONVERSION FOUND TWO MORE DEAD ROWS`.
// Both are correctly rejected, and that rejection is what makes the population a measurement rather than a
// grep. The caps are a convention the header law already follows for its section openers, so the predicate
// rides an existing spelling rather than inventing one.
import type { Node, SourceFile } from "ts-morph";
import { Node as TsNode } from "ts-morph";
import type { StaticAuthoredValue } from "../contract/static-authored-value.ts";
import { readStaticAuthoredValue } from "./static-authored-value.ts";

/** A header line OPENING a recorded conversion refusal. `[\s\S]*` rather than `.*` is deliberate: the line
 *  is already split, so the class only has to span the rest of one line. */
const REFUSAL_OPENER = /^\/\/ CONVERSION\b[^\n]*\b(?:REFUSED|BLOCKED)\b/;

/** One blocker as AUTHORED, with its anchor. Fields are optional because a malformed declaration must be
 *  REPORTABLE rather than unreadable — a reader that threw would turn an author's typo into a tool error. */
export interface AuthoredBlocker {
  readonly kind: string | undefined;
  readonly under: string | undefined;
  readonly spellings: readonly string[];
  readonly consumers: readonly string[];
  readonly node: Node;
}

export interface AuthoredRefusal {
  /** The binding's NAME node — the anchor every finding about this declaration reports at. */
  readonly anchor: Node;
  readonly gate: string | undefined;
  readonly issue: string | undefined;
  readonly rederived: string | undefined;
  readonly blockers: readonly AuthoredBlocker[];
  /** Why the declaration could not be read as the contract's shape. Empty when it read cleanly. */
  readonly malformed: readonly string[];
}

/** The 1-based line of the refusal opener in this module's HEADER SPAN — everything before the first
 *  statement — or `undefined`. Scoping to the header span is the same rule the #2047 census was repaired
 *  with: a whole-file scan scores a module's own quotation of the grammar. */
export function refusalOpenerLine(sourceFile: SourceFile): number | undefined {
  const firstStatement = sourceFile.getStatements()[0];
  const headerEnd = firstStatement === undefined ? sourceFile.getFullText().length : firstStatement.getStart();
  const lines = sourceFile.getFullText().slice(0, headerEnd).split("\n");
  const index = lines.findIndex((line) => REFUSAL_OPENER.test(line));
  return index === -1 ? undefined : index + 1;
}

function property(value: StaticAuthoredValue, key: string): StaticAuthoredValue | undefined {
  return value.kind === "object" ? value.properties.find((entry) => entry.key === key)?.value : undefined;
}

function scalarString(value: StaticAuthoredValue | undefined): string | undefined {
  return value?.kind === "scalar" && typeof value.value === "string" ? value.value : undefined;
}

function stringTuple(value: StaticAuthoredValue | undefined): readonly string[] {
  return value?.kind === "tuple" ? value.elements.map((element) => scalarString(element)).filter((entry) => entry !== undefined) : [];
}

function readBlocker(value: StaticAuthoredValue): AuthoredBlocker {
  return {
    kind: scalarString(property(value, "kind")),
    under: scalarString(property(value, "under")),
    spellings: stringTuple(property(value, "spellings")),
    consumers: stringTuple(property(value, "consumers")),
    node: value.node,
  };
}

/** Read one `CONVERSION_REFUSAL` declaration. `initializer` is the variable declaration's own initializer;
 *  `anchor` is its name node. A reader REFUSAL (the shared reader could not resolve the expression) and a
 *  SHAPE miss are both reported as `malformed` rows rather than swallowed — a declaration nobody can read
 *  is exactly as unheld as no declaration at all, and must not read as a clean pass. */
export function readAuthoredRefusal(anchor: Node, initializer: Node): AuthoredRefusal {
  const fact = readStaticAuthoredValue(initializer);
  if (fact.kind !== "resolved") {
    return { anchor, gate: undefined, issue: undefined, rederived: undefined, blockers: [], malformed: [`${fact.reason}: ${fact.detail}`] };
  }
  const value = fact.value;
  if (value.kind !== "object") {
    return { anchor, gate: undefined, issue: undefined, rederived: undefined, blockers: [], malformed: [`the declaration is a ${value.kind}, not an object`] };
  }
  const blockersValue = property(value, "blockers");
  const blockers = blockersValue?.kind === "tuple" ? blockersValue.elements.map(readBlocker) : [];
  const malformed = [
    ...(scalarString(property(value, "gate")) === undefined ? ["`gate` is not an authored string"] : []),
    ...(scalarString(property(value, "issue")) === undefined ? ["`issue` is not an authored string"] : []),
    ...(scalarString(property(value, "rederived")) === undefined ? ["`rederived` is not an authored string"] : []),
    ...(blockers.length === 0 ? ["`blockers` is empty or not an authored tuple — a refusal with no checkable blocker is prose"] : []),
    ...blockers.filter((blocker) => blocker.kind === undefined).map(() => "a blocker has no authored `kind`"),
    ...blockers.filter((blocker) => blocker.under === undefined).map(() => "a blocker has no authored `under` scope"),
    ...blockers.filter((blocker) => blocker.spellings.length === 0).map(() => "a blocker declares no `spellings`, so its census can only ever be empty"),
  ];
  return {
    anchor,
    gate: scalarString(property(value, "gate")),
    issue: scalarString(property(value, "issue")),
    rederived: scalarString(property(value, "rederived")),
    blockers,
    malformed,
  };
}

/** The authored text of any string-position token, or `undefined` for a node that is not one. Template
 *  spans are INCLUDED — a consumer spelling a flag inside a TEMPLATE literal is still a consumer —
 *  while comments are structurally out of reach here, which is the whole point of censusing nodes. */
export function stringPositionText(node: Node): string | undefined {
  if (TsNode.isStringLiteral(node) || TsNode.isNoSubstitutionTemplateLiteral(node)) {
    return node.getLiteralText();
  }
  return TsNode.isTemplateHead(node) || TsNode.isTemplateMiddle(node) || TsNode.isTemplateTail(node) ? node.getLiteralText() : undefined;
}
