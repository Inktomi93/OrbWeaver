// Area D: the copy strings per kind, as cohorts keyed on case, ellipsis and closing period.
import ts from "typescript";
import type { FileFacts, Source } from "../eslint/index.ts";
import { attrString, childrenText, constInitializer, lineOf, unwrap, visit } from "../eslint/index.ts";
import type { Cell, Cohort, Member } from "../floor/verdict/cohort-compare.ts";
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
  /** What a chip shows: its written text, or the expression in its place. */
  readonly shown?: ts.Expression | string;
  readonly sf?: ts.SourceFile;
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
  readonly shown: ts.Expression | string;
}

// A chip that shows an expression: its case cannot be read from syntax, so it is listed as dynamic with its source.
function dynamicChild(sf: ts.SourceFile, element: ts.JsxElement | ts.JsxSelfClosingElement): ChipShown | null {
  if (ts.isJsxSelfClosingElement(element)) {
    return null;
  }
  const child = element.children.find((entry) => ts.isJsxExpression(entry) && entry.expression !== undefined);
  return child === undefined || !ts.isJsxExpression(child) || child.expression === undefined
    ? null
    : { text: `{${child.expression.getText(sf)}}`, wire: wireOf(child.expression, sf, 0), shown: child.expression };
}

function chipShown(sf: ts.SourceFile, element: ts.JsxElement | ts.JsxSelfClosingElement): ChipShown | null {
  const written = childrenText(element);
  return written === null ? dynamicChild(sf, element) : { text: written, wire: "literal", shown: written };
}

function elementStrings(facts: FileFacts): readonly Collected[] {
  const sf = facts.source.sf;
  if (sf === null) {
    return [];
  }
  const out: Collected[] = [];
  const add = (kind: string, text: string | undefined | null, line: number, chip?: ChipShown | null): void => {
    if (text !== undefined && text !== null && text !== "") {
      out.push({
        kind,
        text,
        path: facts.source.path,
        section: facts.source.section,
        line,
        ...(chip === undefined || chip === null ? {} : { wire: chip.wire, shown: chip.shown, sf }),
      });
    }
  };
  for (const elem of facts.elems) {
    const placeholder = attrString(elem.attrs.get("placeholder"));
    add(placeholder !== undefined && SEARCH_LEAD.test(placeholder) ? "placeholder-search" : "placeholder", placeholder, elem.line);
    if (BUTTON_TAGS.has(elem.tag)) {
      add("button-label", childrenText(elem.element), elem.line);
    }
    const chip = CHIP_TAGS.has(elem.tag) ? chipShown(sf, elem.element) : null;
    add("chip", chip?.text, elem.line, chip);
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

// The client's display words for wire values: each object map whose values are words, keyed by the wire spelling.
interface DisplayWords {
  /** Wire spelling to the word a map paints for it, for each key whose word differs from its spelling. */
  readonly spellings: ReadonlyMap<string, string>;
  /** The key type of each `Record<T, ...>` display map: a value of that type is a wire value with a word. */
  readonly wireTypes: ReadonlySet<string>;
  readonly mapNames: ReadonlySet<string>;
}

const WORD_FIELDS = new Set(["word", "label"]);

// A property's word: a string value, or the `word` or `label` string of an object value.
function propertyWord(value: ts.Expression): string | null {
  const node = unwrap(value);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (!ts.isObjectLiteralExpression(node)) {
    return null;
  }
  for (const field of node.properties) {
    if (ts.isPropertyAssignment(field) && ts.isIdentifier(field.name) && WORD_FIELDS.has(field.name.text) && ts.isStringLiteral(field.initializer)) {
      return field.initializer.text;
    }
  }
  return null;
}

// The `T` of a `Record<T, ...>` written as the declaration's type or its `satisfies` type.
function recordKeyType(declaration: ts.VariableDeclaration): string | null {
  const init = declaration.initializer;
  const written = declaration.type ?? (init !== undefined && ts.isSatisfiesExpression(init) ? init.type : undefined);
  if (written === undefined || !ts.isTypeReferenceNode(written) || written.typeName.getText() !== "Record") {
    return null;
  }
  const key = written.typeArguments?.[0];
  return key !== undefined && ts.isTypeReferenceNode(key) ? key.typeName.getText() : null;
}

interface DisplayMap {
  readonly name: string;
  readonly keyType: string | null;
  readonly words: readonly (readonly [string, string])[];
}

function displayMapOf(node: ts.Node): DisplayMap | null {
  if (!(ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined)) {
    return null;
  }
  const map = unwrap(node.initializer);
  const keyType = recordKeyType(node);
  if (!ts.isObjectLiteralExpression(map) || (keyType === null && !WORD_MAP.test(node.name.text))) {
    return null;
  }
  const words = map.properties.flatMap((property) => {
    if (!(ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)))) {
      return [];
    }
    const word = propertyWord(property.initializer);
    return word === null ? [] : [[property.name.text, word] as const];
  });
  return words.length === 0 ? null : { name: node.name.text, keyType, words };
}

function displayWordsOf(sources: readonly Source[]): DisplayWords {
  const spellings = new Map<string, string>();
  const wireTypes = new Set<string>();
  const mapNames = new Set<string>();
  for (const sf of sources.flatMap((source) => (source.layer === "client" && source.sf !== null ? [source.sf] : []))) {
    visit(sf, (node) => {
      const map = displayMapOf(node);
      if (map === null) {
        return;
      }
      mapNames.add(map.name);
      if (map.keyType !== null) {
        wireTypes.add(map.keyType);
      }
      for (const [key, word] of map.words.filter(([spelling, shown]) => spelling !== shown)) {
        spellings.set(key, word);
      }
    });
  }
  return { spellings, wireTypes, mapNames };
}

// The reads a file itself declares as wire values: the key of a display-map lookup, and a name declared with a wire type.
interface FileWireReads {
  readonly lookedUp: ReadonlySet<string>;
  readonly typed: ReadonlySet<string>;
}

const FILE_WIRE_READS = new WeakMap<ts.SourceFile, FileWireReads>();

function fileWireReads(sf: ts.SourceFile, words: DisplayWords): FileWireReads {
  const cached = FILE_WIRE_READS.get(sf);
  if (cached !== undefined) {
    return cached;
  }
  const lookedUp = new Set<string>();
  const typed = new Set<string>();
  visit(sf, (node) => {
    if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && words.mapNames.has(node.expression.text)) {
      lookedUp.add(unwrap(node.argumentExpression).getText(sf));
    }
    const declared = ts.isParameter(node) || ts.isVariableDeclaration(node) || ts.isPropertySignature(node) || ts.isPropertyDeclaration(node) ? node : null;
    if (declared?.type !== undefined && ts.isTypeReferenceNode(declared.type) && words.wireTypes.has(declared.type.typeName.getText(sf))) {
      typed.add(declared.name.getText(sf));
    }
  });
  const reads = { lookedUp, typed };
  FILE_WIRE_READS.set(sf, reads);
  return reads;
}

const WIRE_SPELLING = "wire spelling";
const WIRE_READ = "wire read";
const NO_WIRE = "none";

// The arms of a conditional, `??` or `||`: the chip shows one of them.
function branchesOf(node: ts.Expression): readonly ts.Expression[] | null {
  if (ts.isConditionalExpression(node)) {
    return [node.whenTrue, node.whenFalse];
  }
  const either = ts.isBinaryExpression(node) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind);
  return either ? [node.left, node.right] : null;
}

// What a chip prints, judged against the display words: a written wire spelling, a read the file itself treats as a wire
// value, or neither. A read's name is matched only against what its own file declares, never a guess from the name.
function rawWireOf(shown: ts.Expression | string, sf: ts.SourceFile, words: DisplayWords, hops: number): string {
  if (typeof shown === "string") {
    return words.spellings.has(shown) ? WIRE_SPELLING : NO_WIRE;
  }
  const node = unwrap(shown);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return rawWireOf(node.text, sf, words, hops);
  }
  const branches = branchesOf(node);
  if (branches !== null) {
    return branches.map((branch) => rawWireOf(branch, sf, words, hops)).find((kind) => kind !== NO_WIRE) ?? NO_WIRE;
  }
  if (!(ts.isIdentifier(node) || ts.isPropertyAccessExpression(node))) {
    return NO_WIRE;
  }
  const init = ts.isIdentifier(node) && hops < MAX_WIRE_HOPS ? constInitializer(sf, node.text) : null;
  return init === null ? wireReadOf(node, sf, words) : rawWireOf(init, sf, words, hops + 1);
}

function wireReadOf(node: ts.Identifier | ts.PropertyAccessExpression, sf: ts.SourceFile, words: DisplayWords): string {
  const reads = fileWireReads(sf, words);
  const name = ts.isIdentifier(node) ? node.text : node.name.text;
  return reads.lookedUp.has(node.getText(sf)) || reads.typed.has(name) ? WIRE_READ : NO_WIRE;
}

const KIND_WHAT: Readonly<Record<string, string>> = {
  placeholder: "placeholders (not search)",
  "placeholder-search": "search placeholders",
  "button-label": "button labels, dialog confirm, cancel and dismiss labels",
  "dialog-title": "dialog titles",
  chip: "chip and badge words written in place; wire is how a shown expression gets its words (bare is a candidate raw wire value; an unjudged read is one whose name alone suggests a count, a word or the user's own value); rawWire is a chip printing a built-in wire spelling a client display map has a word for (a wire spelling written in place, or a wire read: a key the file looks up in such a map, or a name the file declares with the map's key type). An authored value, such as a custom schema's own enum, is in no display map and is never a wire.",
  "word-map": "values of the WORD, LABEL and COPY maps",
};

const CHIP_KIND = "chip";
const RAW_WIRE = "rawWire";
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
    info: [...(cased ? [] : ["case"]), "ellipsis", "period", "source", ...(kind === CHIP_KIND ? ["wire", RAW_WIRE] : [])],
    defects: {
      // One ellipsis character, never three dots, and a search placeholder ends in it.
      ellipsis: kind === "placeholder-search" ? ["...", "none"] : ["..."],
      ...(cased ? { case: ["lower", "Title Case", "mixed"] } : {}),
      ...(kind === CHIP_KIND ? { wire: ["bare"], [RAW_WIRE]: [WIRE_SPELLING, WIRE_READ] } : {}),
    },
    kept: cased ? { case: { [COUNT_FIRST]: `a count leads its noun, and the noun after a number is lower case (${VOICE})` } } : {},
    ...(kind === CHIP_KIND
      ? {
          basis: { wire: "heuristic" as const, [RAW_WIRE]: "measured" as const },
          keptSites: { wire: { [TAXONOMY_CHIP]: { value: "bare", reason: TAXONOMY_RULING } } },
        }
      : {}),
  };
}

/** One cohort per copy kind; each member is a string with its case, ellipsis and closing period. A chip also carries its wire. */
export function buildCopyCohorts(all: readonly FileFacts[], sources: readonly Source[]): readonly Cohort[] {
  const collected = all.filter((facts) => facts.source.layer === "client").flatMap((facts) => [...elementStrings(facts), ...wordMapStrings(facts)]);
  const words = displayWordsOf(sources);
  const wireCells = (entry: Collected): Record<string, Cell> =>
    entry.wire === undefined || entry.shown === undefined || entry.sf === undefined
      ? {}
      : { wire: { value: entry.wire, line: entry.line }, [RAW_WIRE]: { value: rawWireOf(entry.shown, entry.sf, words, 0), line: entry.line } };
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
          cells: { ...copyCells(entry.text, entry.line), ...wireCells(entry) },
        }),
      ),
  }));
}
