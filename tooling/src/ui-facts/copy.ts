// Area D: the copy strings per kind, as cohorts keyed on case, ellipsis and closing period.
import ts from "typescript";
import type { Cohort, Member } from "./compare.ts";
import { NOT_APPLICABLE } from "./compare.ts";
import type { FileFacts } from "./file-facts.ts";
import { attrString, childrenText, lineOf, visit } from "./source.ts";

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
    .replace(/(?:…|\.\.\.|[.:?!])+$/u, "")
    .split(/\s+/u)
    .filter((word) => /[A-Za-z]/u.test(word));
  const first = words[0];
  if (text.startsWith("{")) {
    return "dynamic";
  }
  if (first === undefined) {
    return NOT_APPLICABLE;
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
const DIALOG_TAGS = new Set(["FormDialog", "ContentDialog", "ViewerDialog", "PickerDialog", "FlowDialog", "ConfirmDialog", "Dialog", "AlertDialog"]);
const LABEL_PROPS = ["confirmLabel", "cancelLabel", "dismissLabel"];
const WORD_MAP = /(?:WORD|LABEL|COPY)S?$/u;

interface Collected {
  readonly kind: string;
  readonly text: string;
  readonly path: string;
  readonly section: string;
  readonly line: number;
}

// A chip that shows an expression: its case cannot be read from syntax, so it is listed as dynamic with its source.
function dynamicChild(sf: ts.SourceFile, element: ts.JsxElement | ts.JsxSelfClosingElement): string | null {
  if (ts.isJsxSelfClosingElement(element)) {
    return null;
  }
  const expression = element.children.find((child) => ts.isJsxExpression(child) && child.expression !== undefined);
  return expression === undefined ? null : `{${expression.getText(sf).replace(/^\{|\}$/gu, "")}}`;
}

function elementStrings(facts: FileFacts): readonly Collected[] {
  const sf = facts.source.sf;
  if (sf === null) {
    return [];
  }
  const out: Collected[] = [];
  const add = (kind: string, text: string | undefined | null, line: number): void => {
    if (text !== undefined && text !== null && text !== "") {
      out.push({ kind, text, path: facts.source.path, section: facts.source.section, line });
    }
  };
  for (const elem of facts.elems) {
    const placeholder = attrString(elem.attrs.get("placeholder"));
    add(placeholder?.startsWith("Search") === true ? "placeholder-search" : "placeholder", placeholder, elem.line);
    if (BUTTON_TAGS.has(elem.tag)) {
      add("button-label", childrenText(elem.element), elem.line);
    }
    if (CHIP_TAGS.has(elem.tag)) {
      add("chip", childrenText(elem.element) ?? dynamicChild(sf, elem.element), elem.line);
    }
    if (DIALOG_TAGS.has(elem.tag)) {
      add("dialog-title", attrString(elem.attrs.get("title")), elem.line);
    }
    for (const prop of LABEL_PROPS) {
      add("button-label", attrString(elem.attrs.get(prop)), elem.line);
    }
    if (elem.tag === "FormSubmitButton") {
      add("button-label", attrString(elem.attrs.get("label")), elem.line);
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
  chip: "chip and badge words written in place",
  "word-map": "values of the WORD, LABEL and COPY maps",
};

/** One cohort per copy kind; each member is a string with its case, ellipsis and closing period. */
export function buildCopyCohorts(all: readonly FileFacts[]): readonly Cohort[] {
  const collected = all.filter((facts) => facts.source.layer === "client").flatMap((facts) => [...elementStrings(facts), ...wordMapStrings(facts)]);
  return Object.entries(KIND_WHAT).map(([kind, what]) => ({
    name: `copy:${kind}`,
    what,
    columns: ["case", "ellipsis", "period", "source"],
    members: collected
      .filter((entry) => entry.kind === kind)
      .map((entry): Member => ({ path: entry.path, section: entry.section, label: entry.text, cells: copyCells(entry.text, entry.line) })),
  }));
}
