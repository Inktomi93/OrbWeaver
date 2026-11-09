// Area D: the copy strings per kind, as cohorts keyed on case, ellipsis and closing period.
import ts from "typescript";
import type { FileFacts } from "../eslint/index.ts";
import { attrString, childrenText, constInitializer, lineOf, unwrap, visit } from "../eslint/index.ts";
import type { Cohort, Member } from "../floor/verdict/cohort-compare.ts";
import { NOT_APPLICABLE } from "../floor/verdict/cohort-compare.ts";

const SMALL_WORDS = new Set(["a", "an", "the", "of", "to", "in", "on", "for", "and", "or", "with", "from", "by", "at", "as"]);

// Names of sections and products, capitalised inside a sentence. The first five are in docs/law/vocabulary-map.md; the rest
// are section and brand names that file does not list.
const PRODUCT_NOUNS = new Set([
  "Chats",
  "Jobs",
  "Looks",
  "Plugins",
  "Settings",
  "Chat",
  "Corpus",
  "Explore",
  "Refinery",
  "Score",
  "Memory",
  "Inherit",
  "OpenRouter",
  "GitHub",
]);

// A count leads its noun ("0 refs"): the number is the datum, and the noun after it is lower case by grammar.
const COUNT_FIRST = "count first";

function ellipsisOf(text: string): string {
  if (text.endsWith("…")) {
    return "…";
  }
  return text.endsWith("...") ? "..." : "none";
}

function singleWordCase(word: string): string {
  if (/^[A-Z]{2,}$/u.test(word)) {
    return "UPPER";
  }
  // One capitalised word is a sentence of one word.
  return word === word.toLowerCase() ? "lower" : "Sentence case";
}

/** The case form of a string: how a reader would name its capitalisation. */
function caseOf(text: string): string {
  // Only the first sentence sets the case; a later sentence opens with a capital by rule.
  const words = (text.split(/(?<=[a-z]{2})[.!?]\s/u)[0] ?? text)
    .replace(/(?<![….:?!])[….:?!]+$/u, "")
    .split(/\s+/u)
    .filter((word) => /[A-Za-z]/u.test(word));
  const first = words[0];
  if (text.startsWith("{")) {
    return "dynamic";
  }
  if (first === undefined) {
    return NOT_APPLICABLE;
  }
  if (/^\d/u.test(text)) {
    return COUNT_FIRST;
  }
  if (/^e\.g\./iu.test(first)) {
    return "example";
  }
  if (words.length === 1) {
    return singleWordCase(first);
  }
  if (first === first.toLowerCase()) {
    return "lower";
  }
  const rest = words.slice(1).filter((word) => !(SMALL_WORDS.has(word.toLowerCase()) || PRODUCT_NOUNS.has(word) || /^[A-Z]{2,}$/u.test(word)));
  if (rest.length > 0 && rest.every((word) => /^[A-Z]/u.test(word))) {
    return "Title Case";
  }
  return rest.some((word) => /^[A-Z]/u.test(word) && word !== word.toUpperCase()) ? "mixed" : "Sentence case";
}

// An expression shown in place of words has no case the syntax can read: it is compared as a source, not as a case.
function copyCells(text: string, line: number): Record<string, { readonly value: string; readonly line: number }> {
  const dynamic = text.startsWith("{");
  const read = (value: string): { readonly value: string; readonly line: number } => ({ value: dynamic ? NOT_APPLICABLE : value, line });
  return {
    case: read(caseOf(text)),
    ellipsis: read(ellipsisOf(text)),
    period: read(text.endsWith(".") && !text.endsWith("...") ? "yes" : "no"),
    source: { value: dynamic ? "expression" : "literal", line },
  };
}

const BUTTON_TAGS = new Set(["Button", "GlyphButton", "InlineAction", "PictureButton", "MenuItem", "DropdownMenuItem"]);
const CHIP_TAGS = new Set(["Badge", "RefineryChip", "InlineToken", "FloatingChip"]);
const DIALOG_TAGS = new Set([
  "FormDialog",
  "FormDialogPopup",
  "DismissDialog",
  "RequiredFormDialog",
  "ContentDialog",
  "ViewerDialog",
  "PickerDialog",
  "FlowDialog",
  "ConfirmDialog",
  "Dialog",
  "AlertDialog",
]);
// The verbs a search or filter box's placeholder opens with.
const SEARCH_LEAD = /^(?:Search|Filter|Find|Jump to)\b/u;
const LABEL_PROPS = ["confirmLabel", "cancelLabel", "dismissLabel"];
const WORD_MAP = /(?:WORD|LABEL|COPY)S?$/u;

interface Collected {
  readonly kind: string;
  readonly text: string;
  readonly path: string;
  readonly section: string;
  readonly line: number;
  /** How a chip gets its words, see `wireOf`. */
  readonly wire?: string;
}

// How an expression gets the words it shows, worst first. A `bare` read shows whatever the value is: a raw wire value when
// that value is an enum, a word when the caller already mapped it. Syntax cannot tell the two apart, so `bare` is a candidate.
const UNJUDGED_COUNT = "unjudged: named a count";
const UNJUDGED_WORD = "unjudged: named a word";
const UNJUDGED_USER = "unjudged: named a user value";
const WIRE_RANK = ["bare", "call", "template", "lookup", UNJUDGED_COUNT, UNJUDGED_WORD, UNJUDGED_USER, "literal", "other"] as const;

// What a bare read's own name, the last segment of `a.b.name`, suggests it holds. The name is no proof, so such a read is
// listed as unjudged rather than cleared: a raw enum read named `key` or `label` still paints a wire word. A numeric
// field sorts with the counts and never as a word; every other bare read stays the candidate.
const BARE_BY_NAME: readonly (readonly [RegExp, string])[] = [
  [/^(?:count|length|depth|iteration|kept|discarded|behind|total|over)$/u, UNJUDGED_COUNT],
  [/(?:^(?:label|word|badge|chip|text)$|Label$|Word$|_(?:BADGE|NAME|MARKER|LABEL|WORD)$)/u, UNJUDGED_WORD],
  [/^(?:name|tag|token|key|model|themeName)$/u, UNJUDGED_USER],
];

function bareRead(node: ts.Identifier | ts.PropertyAccessExpression): string {
  const name = ts.isIdentifier(node) ? node.text : node.name.text;
  return BARE_BY_NAME.find(([pattern]) => pattern.test(name))?.[1] ?? "bare";
}
const MAX_WIRE_HOPS = 3;

const worstWire = (...kinds: readonly string[]): string => WIRE_RANK.find((kind) => kinds.includes(kind)) ?? "other";

function wireOfBinary(node: ts.BinaryExpression, sf: ts.SourceFile, hops: number): string {
  const op = node.operatorToken.kind;
  if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
    return worstWire(wireOf(node.left, sf, hops), wireOf(node.right, sf, hops));
  }
  return op === ts.SyntaxKind.AmpersandAmpersandToken ? wireOf(node.right, sf, hops) : "other";
}

function wireOf(expression: ts.Expression, sf: ts.SourceFile, hops: number): string {
  const node = unwrap(expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return "literal";
  }
  if (ts.isConditionalExpression(node)) {
    return worstWire(wireOf(node.whenTrue, sf, hops), wireOf(node.whenFalse, sf, hops));
  }
  if (ts.isBinaryExpression(node)) {
    return wireOfBinary(node, sf, hops);
  }
  if (ts.isElementAccessExpression(node)) {
    return "lookup";
  }
  if (ts.isCallExpression(node)) {
    return "call";
  }
  if (ts.isTemplateExpression(node)) {
    return "template";
  }
  if (ts.isIdentifier(node)) {
    const init = hops < MAX_WIRE_HOPS ? constInitializer(sf, node.text) : null;
    // The initializer says more than the name; the name speaks only for a read the initializer leaves bare.
    const followed = init === null ? "bare" : wireOf(init, sf, hops + 1);
    return followed === "bare" ? bareRead(node) : followed;
  }
  return ts.isPropertyAccessExpression(node) ? bareRead(node) : "other";
}

interface ChipShown {
  readonly text: string;
  readonly wire: string;
}

// A chip that shows an expression: its case cannot be read from syntax, so it is listed as dynamic with its source.
function dynamicChild(sf: ts.SourceFile, element: ts.JsxElement | ts.JsxSelfClosingElement): ChipShown | null {
  if (ts.isJsxSelfClosingElement(element)) {
    return null;
  }
  const child = element.children.find((entry) => ts.isJsxExpression(entry) && entry.expression !== undefined);
  return child === undefined || !ts.isJsxExpression(child) || child.expression === undefined
    ? null
    : { text: `{${child.expression.getText(sf)}}`, wire: wireOf(child.expression, sf, 0) };
}

function chipShown(sf: ts.SourceFile, element: ts.JsxElement | ts.JsxSelfClosingElement): ChipShown | null {
  const written = childrenText(element);
  return written === null ? dynamicChild(sf, element) : { text: written, wire: "literal" };
}

function elementStrings(facts: FileFacts): readonly Collected[] {
  const sf = facts.source.sf;
  if (sf === null) {
    return [];
  }
  const out: Collected[] = [];
  const add = (kind: string, text: string | undefined | null, line: number, wire?: string): void => {
    if (text !== undefined && text !== null && text !== "") {
      out.push({ kind, text, path: facts.source.path, section: facts.source.section, line, ...(wire === undefined ? {} : { wire }) });
    }
  };
  for (const elem of facts.elems) {
    const placeholder = attrString(elem.attrs.get("placeholder"));
    add(placeholder !== undefined && SEARCH_LEAD.test(placeholder) ? "placeholder-search" : "placeholder", placeholder, elem.line);
    if (BUTTON_TAGS.has(elem.tag)) {
      add("button-label", childrenText(elem.element), elem.line);
    }
    const chip = CHIP_TAGS.has(elem.tag) ? chipShown(sf, elem.element) : null;
    add("chip", chip?.text, elem.line, chip?.wire);
    if (DIALOG_TAGS.has(elem.tag)) {
      add("dialog-title", attrString(elem.attrs.get("title")), elem.line);
    }
    for (const prop of LABEL_PROPS) {
      add("button-label", attrString(elem.attrs.get(prop)), elem.line);
    }
  }
  return out;
}

/** String values of the `*WORD`/`*LABEL`/`*COPY` maps: the words a chip or badge shows after a lookup. */
function wordMapStrings(facts: FileFacts): readonly Collected[] {
  const sf = facts.source.sf;
  if (sf === null) {
    return [];
  }
  const out: Collected[] = [];
  visit(sf, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      WORD_MAP.test(node.name.text) &&
      node.initializer !== undefined &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const property of node.initializer.properties) {
        if (ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)) {
          out.push({ kind: "word-map", text: property.initializer.text, path: facts.source.path, section: facts.source.section, line: lineOf(sf, property) });
        }
      }
    }
  });
  return out;
}

const KIND_WHAT: Readonly<Record<string, string>> = {
  placeholder: "placeholders (not search)",
  "placeholder-search": "search placeholders",
  "button-label": "button labels, dialog confirm, cancel and dismiss labels",
  "dialog-title": "dialog titles",
  chip: "chip and badge words written in place; wire is how a shown expression gets its words (bare is a candidate raw wire value; an unjudged read is one whose name alone suggests a count, a word or the user's own value)",
  "word-map": "values of the WORD, LABEL and COPY maps",
};

const CHIP_KIND = "chip";
const TAXONOMY_CHIP = "packages/client/src/features/preset/components/template-drill-in.tsx";
const TAXONOMY_RULING =
  "the raw template kind is the drill-in header's taxonomy chip (packages/client/src/features/preset/lib/template-rows.ts `TEMPLATE_KIND_LABEL`)";
const VOICE = "UI-Architecture-and-Layout.md §4.3, the voice table";
// The voice table rules the case of labels and chips only; a placeholder, a title or a map value has no case ruling.
const CASE_RULED = new Set(["button-label", CHIP_KIND]);

/** The columns a kind compares against its majority and the ones it only spreads, from what the voice table rules. */
function rulingsOf(kind: string): Pick<Cohort, "columns" | "info" | "defects" | "kept" | "keptSites" | "basis"> {
  const cased = CASE_RULED.has(kind);
  return {
    columns: cased ? ["case"] : [],
    info: [...(cased ? [] : ["case"]), "ellipsis", "period", "source", ...(kind === CHIP_KIND ? ["wire"] : [])],
    defects: {
      // One ellipsis character, never three dots, and a search placeholder ends in it.
      ellipsis: kind === "placeholder-search" ? ["...", "none"] : ["..."],
      ...(cased ? { case: ["lower", "Title Case", "mixed"] } : {}),
      ...(kind === CHIP_KIND ? { wire: ["bare"] } : {}),
    },
    kept: cased ? { case: { [COUNT_FIRST]: `a count leads its noun, and the noun after a number is lower case (${VOICE})` } } : {},
    ...(kind === CHIP_KIND ? { basis: { wire: "heuristic" as const }, keptSites: { wire: { [TAXONOMY_CHIP]: TAXONOMY_RULING } } } : {}),
  };
}

/** One cohort per copy kind; each member is a string with its case, ellipsis and closing period. A chip also carries its wire. */
export function buildCopyCohorts(all: readonly FileFacts[]): readonly Cohort[] {
  const collected = all.filter((facts) => facts.source.layer === "client").flatMap((facts) => [...elementStrings(facts), ...wordMapStrings(facts)]);
  return Object.entries(KIND_WHAT).map(([kind, what]) => ({
    name: `copy:${kind}`,
    what,
    ...rulingsOf(kind),
    members: collected
      .filter((entry) => entry.kind === kind)
      .map(
        (entry): Member => ({
          path: entry.path,
          section: entry.section,
          label: entry.text,
          cells: { ...copyCells(entry.text, entry.line), ...(entry.wire === undefined ? {} : { wire: { value: entry.wire, line: entry.line } }) },
        }),
      ),
  }));
}
