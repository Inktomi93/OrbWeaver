// Moves a primitive element carrying a use-specific attribute value to its named component, by an exact map read from
// the target directory (`<Button size="glyph-sm">` becomes `<GlyphButton glyph="sm">`). A spread, a computed matched
// value, or an unnamed axis whose default differs between the two components is refused and left for a hand edit.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { warn } from "codemod:runtime";
import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_MAP_FILE = "codemod-extractions.json";

/** `true` matches a bare attribute or `{true}`; any other value matches a string literal of that text. */
type MatchValue = string | true;

interface Extraction {
  /** The element name the source imports unaliased from `door`. */
  readonly element: string;
  /** The door segment the element's import names (`@orb/ui/<door>`, `#primitives/<door>` or a relative primitive path). */
  readonly door: string;
  /** Every attribute and its exact value; an element matches when it carries all of them. */
  readonly match: Readonly<Record<string, MatchValue>>;
  readonly to: string;
  /** The new component's door segment; it replaces `door` in the import source, so the source keeps its form. */
  readonly toDoor: string;
  /** The attributes written where the first matched attribute stood; a value in braces is a JSX expression. */
  readonly attributes: readonly (readonly [string, string])[];
  /** Axes the target paints over entirely, so the source's unnamed default for them draws nothing the move could change. */
  readonly overrides: readonly string[];
}

function isPair(value: unknown): value is readonly [string, string] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && typeof value[1] === "string";
}

const STRING_FIELDS = ["element", "door", "to", "toDoor"] as const;

function readMatch(entry: object, label: string): Readonly<Record<string, MatchValue>> {
  const raw = "match" in entry ? entry.match : undefined;
  if (raw === null || typeof raw !== "object") {
    throw new Error(`${label} needs a match object`);
  }
  const match: Record<string, MatchValue> = {};
  for (const [name, rawValue] of Object.entries(raw)) {
    // `Object.entries` of a bare `object` types its values `any`; take them as `unknown` so the checks below narrow.
    const value: unknown = rawValue;
    if (typeof value !== "string" && value !== true) {
      throw new Error(`${label} matches ${name} on a value that is neither a string nor true`);
    }
    match[name] = value;
  }
  if (Object.keys(match).length === 0) {
    throw new Error(`${label} matches no attribute`);
  }
  return match;
}

function readExtraction(entry: unknown, label: string): Extraction {
  if (entry === null || typeof entry !== "object") {
    throw new Error(`${label} is not an object`);
  }
  const fields = Object.fromEntries(STRING_FIELDS.map((field) => [field, field in entry ? (entry as Record<string, unknown>)[field] : undefined]));
  const attributes = "attributes" in entry ? entry.attributes : undefined;
  const overrides = "overrides" in entry ? entry.overrides : [];
  if (!(STRING_FIELDS.every((field) => typeof fields[field] === "string") && Array.isArray(attributes) && attributes.every(isPair))) {
    throw new Error(`${label} needs element, door, to, toDoor as strings and attributes as [name, value] pairs`);
  }
  if (!(Array.isArray(overrides) && overrides.every((axis) => typeof axis === "string"))) {
    throw new Error(`${label} needs overrides as an array of axis names`);
  }
  return {
    element: String(fields["element"]),
    door: String(fields["door"]),
    match: readMatch(entry, label),
    to: String(fields["to"]),
    toDoor: String(fields["toDoor"]),
    attributes,
    overrides,
  };
}

/** Component → axis → the value it resolves when the call site names none; `""` means the axis draws nothing. */
type Defaults = ReadonlyMap<string, Readonly<Record<string, string>>>;

interface ExtractionMap {
  readonly extractions: readonly Extraction[];
  readonly defaults: Defaults;
}

function readDefaults(raw: unknown, mapFile: string): Defaults {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${mapFile}: expected "defaults": { "<Component>": { "<axis>": "<value>" } }`);
  }
  return new Map(
    Object.entries(raw).map(([component, axes]: [string, unknown]) => {
      if (axes === null || typeof axes !== "object" || !Object.values(axes).every((value) => typeof value === "string")) {
        throw new Error(`${mapFile}: defaults.${component} must map each axis to a string`);
      }
      return [component, axes as Readonly<Record<string, string>>] as const;
    }),
  );
}

function readMap(targetDir: string, mapFile: string): ExtractionMap {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, mapFile), "utf8"));
  if (parsed === null || typeof parsed !== "object" || !("extractions" in parsed) || !Array.isArray(parsed.extractions) || !("defaults" in parsed)) {
    throw new Error(`${mapFile}: expected { "defaults": {...}, "extractions": [...] }`);
  }
  const extractions = parsed.extractions.map((entry: unknown, index: number) => readExtraction(entry, `${mapFile}: extraction ${index}`));
  const defaults = readDefaults(parsed.defaults, mapFile);
  // Every component on either side states its defaults, so a move that would change an unnamed axis is caught.
  for (const name of new Set(extractions.flatMap((extraction) => [extraction.element, extraction.to]))) {
    if (!defaults.has(name)) {
      throw new Error(`${mapFile}: defaults has no entry for ${name}`);
    }
  }
  return { extractions, defaults };
}

const ELEMENT: RuleConfig<TSX> = { rule: { any: [{ kind: "jsx_opening_element" }, { kind: "jsx_self_closing_element" }] } };
const IMPORT: RuleConfig<TSX> = { rule: { kind: "import_statement" } };
const SPECIFIER: RuleConfig<TSX> = { rule: { kind: "import_specifier" } };
const NAMED_IMPORTS: RuleConfig<TSX> = { rule: { kind: "named_imports" } };
const REFERENCE: RuleConfig<TSX> = {
  rule: { any: [{ kind: "identifier" }, { kind: "type_identifier" }, { kind: "shorthand_property_identifier" }] },
};

export const getSelector: GetSelector<TSX> = () => ELEMENT;

const escapeRegex = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

function doorPattern(door: string): RegExp {
  return new RegExp(`(^@orb/ui/|#primitives/|/primitives/|/layout/|/art/)${escapeRegex(door)}(/index\\.ts)?$`, "u");
}

const isTypeOnly = (statement: SgNode<TSX>): boolean => statement.children().some((child) => child.kind() === "type");
const sourceOf = (statement: SgNode<TSX>): string => statement.field("source")?.text().slice(1, -1) ?? "";

/** One unaliased value import of an extracted element. */
interface ElementImport {
  readonly statement: SgNode<TSX>;
  readonly specifier: SgNode<TSX>;
  readonly source: string;
}

function elementImports(rootNode: SgNode<TSX>, extractions: readonly Extraction[]): ReadonlyMap<string, ElementImport> {
  const found = new Map<string, ElementImport>();
  for (const statement of rootNode.findAll(IMPORT)) {
    if (isTypeOnly(statement)) {
      continue;
    }
    const source = sourceOf(statement);
    for (const specifier of statement.findAll(SPECIFIER)) {
      const name = specifier.field("name")?.text() ?? "";
      const isTypeSpecifier = specifier.children().some((child) => child.kind() === "type");
      const owned = extractions.some((extraction) => extraction.element === name && doorPattern(extraction.door).test(source));
      if (owned && !isTypeSpecifier && specifier.field("alias") === null) {
        found.set(name, { statement, specifier, source });
      }
    }
  }
  return found;
}

/** The attribute's comparable value: a string's text, `true` for a bare or `{true}` attribute, else `null` (computed). */
function attributeValue(attribute: SgNode<TSX>): MatchValue | null {
  const value = attribute.child(2);
  if (value === null) {
    return true;
  }
  if (value.kind() === "string") {
    return value.text().slice(1, -1);
  }
  return value.text().replaceAll(/\s/gu, "") === "{true}" ? true : null;
}

const attributeName = (attribute: SgNode<TSX>): string => attribute.child(0)?.text() ?? "";

/**
 * The axes the move would silently repaint: an axis the element leaves to its default, that the extraction neither
 * consumes nor writes, and whose default differs between the source and the target component.
 */
function changedDefaults(attributes: readonly SgNode<TSX>[], extraction: Extraction, defaults: Defaults): string[] {
  const source = defaults.get(extraction.element) ?? {};
  const target = defaults.get(extraction.to) ?? {};
  const named = new Set([
    ...attributes.map(attributeName),
    ...Object.keys(extraction.match),
    ...extraction.attributes.map(([name]) => name),
    ...extraction.overrides,
  ]);
  return [...new Set([...Object.keys(source), ...Object.keys(target)])].filter((axis) => !named.has(axis) && (source[axis] ?? "") !== (target[axis] ?? ""));
}

/** The first extraction the element matches, or null; a spread or a computed matched value refuses the element. */
function extractionFor(element: SgNode<TSX>, candidates: readonly Extraction[], defaults: Defaults, file: string): Extraction | null {
  if (element.children().some((child) => child.kind() === "jsx_expression")) {
    return null;
  }
  const attributes = element.children().filter((child) => child.kind() === "jsx_attribute");
  const extraction = candidates.find((candidate) =>
    Object.entries(candidate.match).every(([name, expected]) => {
      const attribute = attributes.find((node) => attributeName(node) === name);
      return attribute !== undefined && attributeValue(attribute) === expected;
    }),
  );
  if (extraction === undefined) {
    return null;
  }
  const changed = changedDefaults(attributes, extraction, defaults);
  if (changed.length > 0) {
    // A refusal is reported, never rewritten: the hand edit names the axis so the emphasis stays a decision.
    warn(
      `use-specific-extraction: refused ${file}:${element.range().start.line + 1}: ${extraction.element} → ${extraction.to} changes the unnamed ${changed.join(", ")}`,
    );
    return null;
  }
  return extraction;
}

function renderAttribute([name, value]: readonly [string, string]): string {
  return `${name}=${value.startsWith("{") ? value : `"${value}"`}`;
}

/** The edits that move one element: both tag names, and the matched attributes replaced by the new ones. */
function elementEdits(element: SgNode<TSX>, extraction: Extraction): { readonly edits: Edit[]; readonly names: SgNode<TSX>[] } {
  const names: SgNode<TSX>[] = [];
  const openingName = element.field("name");
  if (openingName !== null) {
    names.push(openingName);
  }
  // The element's own closing tag is its parent's last child; a nested child's closing tag comes first in the tree.
  const closing =
    element.kind() === "jsx_opening_element"
      ? element
          .parent()
          ?.children()
          .findLast((child) => child.kind() === "jsx_closing_element")
      : undefined;
  const closingName = closing?.field("name");
  if (closingName !== null && closingName !== undefined) {
    names.push(closingName);
  }
  const edits: Edit[] = names.map((name) => name.replace(extraction.to));
  const matched = element.children().filter((child) => child.kind() === "jsx_attribute" && Object.hasOwn(extraction.match, attributeName(child)));
  const [first, ...rest] = matched;
  for (const attribute of rest) {
    edits.push({ startPos: attribute.prev()?.range().end.index ?? attribute.range().start.index, endPos: attribute.range().end.index, insertedText: "" });
  }
  if (first !== undefined) {
    const text = extraction.attributes.map(renderAttribute).join(" ");
    edits.push(
      text === ""
        ? { startPos: first.prev()?.range().end.index ?? first.range().start.index, endPos: first.range().end.index, insertedText: "" }
        : first.replace(text),
    );
  }
  return { edits, names };
}

/** True when an identifier of `name` outside the imports and the moved tags still refers to the old element. */
function stillReferenced(rootNode: SgNode<TSX>, name: string, moved: ReadonlySet<number>): boolean {
  return rootNode
    .findAll(REFERENCE)
    .some(
      (node) => node.text() === name && !moved.has(node.range().start.index) && !node.ancestors().some((ancestor) => ancestor.kind() === "import_statement"),
    );
}

const NEWLINE = 0x0a;

/** True when the statement imports nothing once `names` leave it. */
function emptiedBy(statement: SgNode<TSX>, names: ReadonlySet<string>): boolean {
  const hasDefault =
    statement
      .find({ rule: { kind: "import_clause" } })
      ?.children()
      .some((child) => child.kind() === "identifier") ?? false;
  return !hasDefault && statement.findAll(SPECIFIER).every((specifier) => names.has(specifier.field("name")?.text() ?? ""));
}

/** Deletes one specifier with its separating comma. */
function dropSpecifier(element: ElementImport): Edit {
  const specifiers = element.statement.findAll(SPECIFIER);
  const index = specifiers.findIndex((specifier) => specifier.id() === element.specifier.id());
  const next = specifiers[index + 1];
  if (next !== undefined) {
    return { startPos: element.specifier.range().start.index, endPos: next.range().start.index, insertedText: "" };
  }
  const previous = specifiers[index - 1];
  return { startPos: previous?.range().end.index ?? element.specifier.range().start.index, endPos: element.specifier.range().end.index, insertedText: "" };
}

/** A moved component and the import its element came through, so the new import keeps that source's form. */
interface Added {
  readonly to: string;
  readonly origin: ElementImport;
  readonly source: string;
}

interface Moves {
  readonly edits: Edit[];
  /** Start offsets of the tag names the moves rename: they no longer reference the old element. */
  readonly moved: Set<number>;
  readonly added: Added[];
}

function moveElements(rootNode: SgNode<TSX>, imports: ReadonlyMap<string, ElementImport>, map: ExtractionMap, file: string): Moves {
  const moves: Moves = { edits: [], moved: new Set(), added: [] };
  for (const element of rootNode.findAll(ELEMENT)) {
    const name = element.field("name")?.text() ?? "";
    const imported = imports.get(name);
    const extraction =
      imported === undefined
        ? null
        : extractionFor(
            element,
            map.extractions.filter((candidate) => candidate.element === name),
            map.defaults,
            file,
          );
    if (imported === undefined || extraction === null) {
      continue;
    }
    const { edits, names } = elementEdits(element, extraction);
    moves.edits.push(...edits);
    for (const node of names) {
      moves.moved.add(node.range().start.index);
    }
    const source = imported.source.replace(
      doorPattern(extraction.door),
      (_all, prefix: string, index: string | undefined) => `${prefix}${extraction.toDoor}${index ?? ""}`,
    );
    if (!moves.added.some((added) => added.to === extraction.to)) {
      moves.added.push({ to: extraction.to, origin: imported, source });
    }
  }
  return moves;
}

/** Adds each moved component to an import of its source, or writes that import beside the one it came through. */
function addImports(statements: readonly SgNode<TSX>[], moves: Moves, emptied: ReadonlySet<number>, replaced: Set<number>): Edit[] {
  const edits: Edit[] = [];
  for (const source of new Set(moves.added.map((added) => added.source))) {
    const names = moves.added.filter((added) => added.source === source).map((added) => added.to);
    const after = moves.added.find((added) => added.source === source)?.origin.statement;
    const existing = statements.find((statement) => !isTypeOnly(statement) && sourceOf(statement) === source && statement.find(NAMED_IMPORTS) !== null);
    const last = existing?.findAll(SPECIFIER).at(-1);
    if (existing !== undefined && last !== undefined) {
      const present = new Set(existing.findAll(SPECIFIER).map((specifier) => specifier.field("name")?.text() ?? ""));
      const missing = names.filter((name) => !present.has(name));
      edits.push(
        ...(missing.length === 0 ? [] : [{ startPos: last.range().end.index, endPos: last.range().end.index, insertedText: `, ${missing.join(", ")}` }]),
      );
      continue;
    }
    if (after === undefined) {
      continue;
    }
    const text = `import { ${names.toSorted().join(", ")} } from "${source}";`;
    // An import the move empties is replaced in place by the new one, so the import block keeps its line count.
    if (emptied.has(after.id()) && !replaced.has(after.id())) {
      replaced.add(after.id());
      edits.push({ startPos: after.range().start.index, endPos: after.range().end.index, insertedText: text });
    } else {
      edits.push({ startPos: after.range().end.index, endPos: after.range().end.index, insertedText: `\n${text}` });
    }
  }
  return edits;
}

/** The import edits: new doors added, and every old specifier no longer referenced dropped with its statement if emptied. */
function importEdits(rootNode: SgNode<TSX>, imports: ReadonlyMap<string, ElementImport>, moves: Moves): Edit[] {
  const unreferenced = new Set([...imports.keys()].filter((name) => !stillReferenced(rootNode, name, moves.moved)));
  const dropped = [...unreferenced].flatMap((name) => imports.get(name) ?? []);
  const emptied = new Set(dropped.filter((imported) => emptiedBy(imported.statement, unreferenced)).map((imported) => imported.statement.id()));
  const replaced = new Set<number>();
  const edits = addImports(rootNode.findAll(IMPORT), moves, emptied, replaced);
  const rootText = new TextEncoder().encode(rootNode.text());
  const deleted = new Set<number>();
  for (const imported of dropped) {
    const statement = imported.statement;
    if (replaced.has(statement.id()) || deleted.has(statement.id())) {
      continue;
    }
    if (emptied.has(statement.id())) {
      deleted.add(statement.id());
      const end = statement.range().end.index;
      edits.push({ startPos: statement.range().start.index, endPos: rootText[end] === NEWLINE ? end + 1 : end, insertedText: "" });
    } else {
      edits.push(dropSpecifier(imported));
    }
  }
  return edits;
}

const codemod: Codemod<TSX> = (root, options) => {
  const map = readMap(options.targetDir, options.params["map"] ?? DEFAULT_MAP_FILE);
  const rootNode = root.root();
  const imports = elementImports(rootNode, map.extractions);
  const moves = imports.size === 0 ? null : moveElements(rootNode, imports, map, root.filename());
  if (moves === null || moves.edits.length === 0) {
    return Promise.resolve(null);
  }
  return Promise.resolve(rootNode.commitEdits([...moves.edits, ...importEdits(rootNode, imports, moves)]));
};

export default codemod;
