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
import { readStaticAuthoredScalar, readStaticAuthoredValue, resolveAuthoredComposite } from "./static-authored-value.ts";

/** A header line OPENING a recorded conversion refusal. `[\s\S]*` rather than `.*` is deliberate: the line
 *  is already split, so the class only has to span the rest of one line. */
const REFUSAL_OPENER = /^\/\/ CONVERSION\b[^\n]*\b(?:REFUSED|BLOCKED)\b/;

/** One blocker as AUTHORED, with its anchor. Fields are optional because a malformed declaration must be
 *  REPORTABLE rather than unreadable — a reader that threw would turn an author's typo into a tool error. */
export interface AuthoredBlocker {
  readonly kind: string | undefined;
  /** `sole-consumer` only. Undefined on a `missing-kind` blocker, which owns no census scope. */
  readonly under: string | undefined;
  /** `missing-kind` only: the resource-kind name the refusal claims does not exist today. */
  readonly wouldBeKind: string | undefined;
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

/** THE MACHINE HALF OF A DECLARATION IS READ FIELD BY FIELD, AND THE PROSE HALF IS NEVER READ AT ALL
 *  (#2106). `readStaticAuthoredValue` is ATOMIC over an object literal: `readObject` returns the FIRST
 *  unresolved property's refusal for the WHOLE object, and `readStaticString` refuses a `BinaryExpression`.
 *  So one CONCATENATED prose string — the house spelling for any sentence past the line cap, and what
 *  biome's own formatter produces — made the entire declaration unreadable, and the accusing arms then
 *  fired on correct code. Two effective findings on `no-blanket-suppression.ts` at `0c5bedfd7`, on a HARD
 *  policy, whose only author-side move would have been a waiver: a waived gate is a dead gate.
 *
 *  The shared reader's own header says this in advance, about the same class — a caller that needs the
 *  literal's own identity must not inherit a FIELD-level refusal as a provenance refusal, and that exact
 *  conflation "reported zero live definitions for four registry kinds while every path check stayed green"
 *  (#1584 registry family). This reader made it again.
 *
 *  So the split is by WHO CONSUMES THE FIELD. `gate`/`issue`/`rederived` and a blocker's
 *  `kind`/`under`/`spellings`/`consumers` are MACHINE fields: the policy dispatches on them, an unreadable
 *  one means the census cannot run, and that must be reported rather than pass as a refusal that still
 *  holds. `why` and `unheld` are PROSE: nothing machine-reads them, their presence is already held by
 *  `satisfies ConversionRefusal` at COMPILE time (constitution §2.2 rung 2, a strictly better enforcer than
 *  a gate), and a gate that re-read them could only ever add false accusations. The type holds the prose;
 *  the policy holds the census. */
const MACHINE_SCALARS = ["gate", "issue", "rederived"] as const;

/** The initializer of one named property of an object literal, or `undefined`. A direct structural read of
 *  the node's OWN properties — not a descendant walk, which the policy contract bans. */
function propertyNode(object: Node, key: string): Node | undefined {
  const assignment = TsNode.isObjectLiteralExpression(object)
    ? object.getProperties().find((entry) => TsNode.isPropertyAssignment(entry) && entry.getName() === key)
    : undefined;
  return assignment !== undefined && TsNode.isPropertyAssignment(assignment) ? assignment.getInitializer() : undefined;
}

/** One machine STRING field, through the shared scalar reader. `undefined` means "could not read", which
 *  every caller must distinguish from "read as something else" — that conflation is the whole defect. */
function machineString(object: Node, key: string): string | undefined {
  const node = propertyNode(object, key);
  const fact = node === undefined ? undefined : readStaticAuthoredScalar(node);
  return fact !== undefined && fact.kind === "resolved" && typeof fact.value === "string" ? fact.value : undefined;
}

/** One machine STRING-TUPLE field, through the shared value reader. */
function machineStringTuple(object: Node, key: string): readonly string[] {
  const node = propertyNode(object, key);
  if (node === undefined) {
    return [];
  }
  const fact = readStaticAuthoredValue(node);
  if (fact.kind !== "resolved" || fact.value.kind !== "tuple") {
    return [];
  }
  return fact.value.elements
    .map((element) => (element.kind === "scalar" && typeof element.value === "string" ? element.value : undefined))
    .filter((entry) => entry !== undefined);
}

function readBlocker(element: Node): AuthoredBlocker {
  return {
    kind: machineString(element, "kind"),
    under: machineString(element, "under"),
    wouldBeKind: machineString(element, "wouldBeKind"),
    spellings: machineStringTuple(element, "spellings"),
    consumers: machineStringTuple(element, "consumers"),
    node: element,
  };
}

/** Read one `CONVERSION_REFUSAL` declaration. `initializer` is the variable declaration's own initializer;
 *  `anchor` is its name node.
 *
 *  `resolveAuthoredComposite` answers only ROOT PROVENANCE — "which authored node is this value?" — which
 *  is the strictly weaker question this reader actually needs, and refuses only when the composite's own
 *  binding is mutated, cyclic or has an invoked member. Those ARE defects in a declaration and stay
 *  `malformed`. A field-level refusal no longer reaches this level at all. */
export function readAuthoredRefusal(anchor: Node, initializer: Node): AuthoredRefusal {
  const empty = { anchor, gate: undefined, issue: undefined, rederived: undefined, blockers: [] } as const;
  const composite = resolveAuthoredComposite(initializer);
  if (composite.kind !== "resolved") {
    return { ...empty, malformed: [`the declaration's own binding is not a readable authored value (${composite.reason}: ${composite.detail})`] };
  }
  const object = composite.value;
  if (!TsNode.isObjectLiteralExpression(object)) {
    return { ...empty, malformed: [`the declaration is a ${object.getKindName()}, not an object literal`] };
  }
  const blockersNode = propertyNode(object, "blockers");
  const blockerElements = blockersNode !== undefined && TsNode.isArrayLiteralExpression(blockersNode) ? blockersNode.getElements() : [];
  const blockers = blockerElements.filter((element) => TsNode.isObjectLiteralExpression(element)).map(readBlocker);
  const malformed = [
    ...MACHINE_SCALARS.filter((key) => machineString(object, key) === undefined).map(
      (key) => `\`${key}\` is not a statically readable string (it is a machine field — the policy dispatches on it)`,
    ),
    ...(blockers.length === 0 ? ["`blockers` is empty or not an authored tuple of object literals — a refusal with no checkable blocker is prose"] : []),
    ...(blockerElements.length !== blockers.length ? ["a `blockers` element is not an object literal, so its census cannot be read"] : []),
    ...blockers.filter((blocker) => blocker.kind === undefined).map(() => "a blocker has no statically readable `kind`"),
    // PER KIND. A `missing-kind` blocker owns no census, so demanding `under`/`spellings` from it would be
    // the mis-accusation shape #2106 was about, one field over.
    ...blockers
      .filter((blocker) => blocker.kind === "sole-consumer" && blocker.under === undefined)
      .map(() => "a `sole-consumer` blocker has no statically readable `under` scope"),
    ...blockers
      .filter((blocker) => blocker.kind === "sole-consumer" && blocker.spellings.length === 0)
      .map(() => "a `sole-consumer` blocker declares no readable `spellings`, so its census can only ever be empty"),
    ...blockers
      .filter((blocker) => blocker.kind === "missing-kind" && blocker.wouldBeKind === undefined)
      .map(() => "a `missing-kind` blocker has no statically readable `wouldBeKind`, so nothing can notice the capability being minted"),
  ];
  return {
    anchor,
    gate: machineString(object, "gate"),
    issue: machineString(object, "issue"),
    rederived: machineString(object, "rederived"),
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
