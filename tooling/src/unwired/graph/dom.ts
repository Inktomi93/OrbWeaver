// The DOM-hook pass: class names and data-* attributes link markup to sheets, selectors and tests with no symbol
// between them, so a sheet rule nothing writes, or a data-* hook nothing reads, is dead code no member bucket sees.
//
// - Sheets are read with css-tree: each class selector and each data-* attribute selector with its values. A data-*
//   name an at-rule prelude spells (`@custom-variant`) is a read, since the rule parse leaves preludes raw.
// - Every token of every product string is a class write, a superset that only adds writes; a static part a `${`
//   follows writes every class its last token heads.
// - A data-* write is a JSX attribute, a quoted or computed object key, a record's element assignment, `setAttribute`
//   or `toggleAttribute`, or a `dataset` assignment, in product code. A read is an attribute getter, `toggleAttribute`, `toHaveAttribute`, a
//   `dataset` read, a sheet selector, or a selector or Tailwind data variant a string spells. A read in tests or tooling
//   only annotates its row, as the graph's roles do (./state.ts header), except that a test's `getByTestId` or selector
//   reads a test id, since those hooks exist for tests, and that a snap read ({@link productReader}) counts as the product's.
// - Script source a string holds runs in a page or a frame, so an attribute call or a `dataset` use it spells is a
//   site of the string's world (SCRIPT_CALL, SCRIPT_DATASET).
// - A read by name of a house attribute model (ATTRIBUTE_MODELS) is an attribute read: snap's DOM snapshot and
//   ui-facts' parsed JSX element hold an element's attributes by name. The member's declaring file decides, so a
//   look-alike record is no model. A `MutationObserver`'s `attributeFilter` list, and a name compared with a mutation
//   record's `attributeName`, are reads: the observer exists to see that attribute change.
// - A computed key is an attribute claim only when its name resolves to a data-* name: most keys name no attribute. A
//   string in a key position (an object key, a destructured property, the left of `in`, an element access's key)
//   names a property, never a value a site could take.
// - A write whose name a wide part leaves open is listed unresolved; it writes every name its head starts once the head
//   holds a name part past the bare `data-` namespace, and none otherwise.
// - A name or value held away from its site is followed through the checker by ./held.ts: declarations, callers,
//   call returns, destructured places and the list methods that carry an element. A whole data-* string no site
//   reaches, and a site whose name no hop resolves, is listed as unresolved with its reason; a mention in a world
//   whose reads count keeps its name out of every bucket.
// - A name a sealed library stamps is the library's (SEALED_NAME). A selector name an installed direct dependency's
//   own code writes is that library's hook (streamdown's `data-streamdown`): a whole string, a whole class token or a
//   `dataset` member in its JS, never a name inside a longer word. A
//   `data-slot` value, a class or an attribute the owner-CSS surface publishes is read by CSS the owner writes, a
//   reader outside the program, so it is judged as published; only `data-testid` values are judged one by one.
import { globSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import type { CssNode } from "@eslint/css-tree";
import { ident, parse, walk } from "@eslint/css-tree";
import type {
  BinaryExpression,
  CallExpression,
  ElementAccessExpression,
  Expression,
  JsxAttribute,
  Node,
  NoSubstitutionTemplateLiteral,
  PropertyAccessExpression,
  PropertyAssignment,
  ShorthandPropertyAssignment,
  StringLiteral,
  TemplateExpression,
} from "@typescript/native/ast";
import {
  isArrayLiteralExpression,
  isBinaryExpression,
  isBindingElement,
  isCallExpression,
  isComputedPropertyName,
  isElementAccessExpression,
  isExportDeclaration,
  isIdentifier,
  isImportDeclaration,
  isInterfaceDeclaration,
  isJsxAttribute,
  isJsxExpression,
  isNoSubstitutionTemplateLiteral,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isShorthandPropertyAssignment,
  isStringLiteral,
  isTemplateExpression,
  isTypeAliasDeclaration,
  isTypeNode,
  isVariableDeclaration,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator } from "@typescript/native/sync";
import { kebab, SEALED_NAME } from "../../eslint/index.ts";
import { editorLineOf } from "../../floor/typescript/editor-lines.ts";
import type { NativeWorld } from "../native.ts";
import { isProduction } from "../worlds.ts";
import { OWNER_CSS_SURFACE, STRING } from "./css.ts";
import type { Text, Texts } from "./held.ts";
import { HeldTexts } from "./held.ts";
import { holds, meets, nameCount, selects } from "./patterns.ts";
import { sameNode } from "./roles.ts";
import { BARE_VARIANT_READ, DATA, NOT_SOURCE, SELECTOR_READ, SHEETS, VARIANT_READ } from "./selectors.ts";
import { productReader, testSource } from "./state.ts";

/** The DOM-hook buckets, in report order. */
export const DOM_BUCKETS = [
  "css-class-unwritten",
  "css-class-owner-css-only",
  "css-attr-unwritten",
  "css-attr-value-unwritten",
  "dom-attr-unread",
  "dom-attr-owner-css-only",
  "dom-value-unread",
] as const;
export type DomBucket = (typeof DOM_BUCKETS)[number];

/** Which code a site sits in: the product, snap, its tests, or the other tooling. */
export const WORLDS = ["product", "snap", "tests", "tooling"] as const;
export type World = (typeof WORLDS)[number];

// D357: snap drives the real app, so a hook only snap reads is used, as a dev-bridge global read is. Other tooling and
// the tests only annotate.
/** The worlds whose read of a data-* attribute counts; a test id counts its tests' reads too. */
const USES: ReadonlySet<World> = new Set<World>(["product", "snap"]);
const TEST_ID_USES: ReadonlySet<World> = new Set<World>([...USES, "tests"]);

/** A mention the checker cannot carry to an attribute site, at `file:line` in `world`. */
export interface Unresolved {
  readonly text: string;
  readonly at: string;
  readonly world: World;
  readonly why: string;
}

/** Each bucket's entries, the unresolved mentions, and what the pass read on the way. */
export interface DomReport {
  readonly buckets: { readonly [B in DomBucket]: readonly string[] };
  readonly unresolved: readonly Unresolved[];
  readonly counts: {
    readonly files: number;
    readonly sheets: number;
    readonly classSelectors: number;
    readonly attributeSelectors: number;
    readonly writtenNames: number;
    readonly readNames: number;
    readonly followed: number;
    /** The (node, position) answers the follow computed; its memo bounds them by the program, not by the routes. */
    readonly steps: number;
    readonly dependencyFiles: number;
  };
}

const HTML = "packages/*/src/**/*.html";
const DEPENDENCIES = "packages/*/node_modules";
const DEPENDENCY_CODE = /\.[cm]?js$/u;
const NODE_MODULES = "node_modules";
const TEST_ID = "data-testid";
/** A whole string that is one data-* name. */
const DATA_NAME = /^data-[a-z][\w-]*[a-z0-9]$/u;
/** A plain `data-testid` value: one a lookup can spell. */
const TEST_ID_VALUE = /^[\w:-]+$/u;
/** An open selector a template ends inside: `[data-appearance-${key}]` reads every name that head starts. */
const OPEN_SELECTOR = /\[(data-[a-z][\w-]*-)$/u;
const HTML_ATTRIBUTE = /\s(data-[a-z][\w-]*[a-z0-9])(?:=(["'])(.*?)\2)?/gu;
const WRITERS: ReadonlySet<string> = new Set(["setAttribute", "toggleAttribute"]);
const READERS: ReadonlySet<string> = new Set(["getAttribute", "hasAttribute", "removeAttribute", "toggleAttribute", "toHaveAttribute"]);
const TEST_ID_LOOKUP = "getByTestId";
const ATTRIBUTE = "Attribute";
/** An attribute call or a `dataset` use spelled inside script source a string holds. */
const SCRIPT_CALL = /\b(get|has|remove|toggle|set)Attribute\(\s*["'`](data-[a-z][\w-]*)/gu;
const SCRIPT_DATASET = /\.dataset\.([A-Za-z]\w*)(\s*=(?!=))?/gu;
/** The house models that hold an element's attributes by name, by the file that declares the member: snap's DOM
 *  snapshot and ui-facts' parsed JSX element. A read of one by name reads that attribute. */
const ATTRIBUTE_MODELS: readonly { readonly file: string; readonly member: string }[] = [
  { file: "tooling/src/snap/ops/appearance-invariant-dom.ts", member: "attributes" },
  { file: "tooling/src/eslint/ui-classes/source.ts", member: "attrs" },
];
const MODEL_MEMBERS: ReadonlySet<string> = new Set(ATTRIBUTE_MODELS.map(({ member }) => member));
const MODEL_LOOKUPS: ReadonlySet<string> = new Set(["get", "has"]);
const ATTRIBUTE_FILTER = "attributeFilter";
const RECORD_NAME = "attributeName";
const EQUALITY: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.EqualsEqualsEqualsToken,
  SyntaxKind.ExclamationEqualsEqualsToken,
  SyntaxKind.EqualsEqualsToken,
  SyntaxKind.ExclamationEqualsToken,
]);
const DATASET = "dataset";
/** React renders a valueless JSX attribute, and `true`, as the string "true". */
const PRESENT = "true";
/** Any value: one the checker holds only as a wide type. */
const ANY = "*";

// A data-* write or read site: its name, a fixed one or an expression to follow; a write's value likewise. A
// `dataset` site names the property, which maps to the attribute by kebab case.
interface Site {
  readonly at: string;
  readonly world: World;
  /** A computed object key: a claim only when its name resolves to a data-* name, since most keys are no attribute. */
  readonly key: boolean;
  readonly name: string | Expression;
  readonly dataset: boolean;
  readonly write: boolean;
  readonly read: boolean;
  readonly value: readonly string[] | Expression | null;
}

// The checker's answer for each followed expression.
type Answers = ReadonlyMap<Expression, Texts>;

interface Selectors {
  readonly classes: Map<string, string>;
  readonly attributes: Map<string, { readonly sheet: string; readonly values: Set<string> }>;
  readonly reads: Set<string>;
}

/** Every class and data-* hook of the tree at `root` with no partner, with `world`'s checker following the names held
 *  in constants. */
export function domPass(root: string, world: NativeWorld): DomReport {
  const sheets = globSync(SHEETS, { cwd: root, exclude: NOT_SOURCE });
  const selectors = readSheets(root, sheets);
  const hooks = new Hooks(world);
  for (const source of world.files) {
    hooks.walkFile(world.fileOfSource(source), source);
  }
  for (const file of globSync(HTML, { cwd: root, exclude: NOT_SOURCE })) {
    hooks.readHtml(file, readFileSync(join(root, file), "utf8"));
  }
  hooks.resolve();
  for (const name of selectors.reads) {
    hooks.read(name, undefined, "product");
  }
  return judge(root, selectors, hooks, { files: world.files.length, sheets: sheets.length });
}

function readSheets(root: string, sheets: readonly string[]): Selectors {
  const out: Selectors = { classes: new Map(), attributes: new Map(), reads: new Set() };
  for (const sheet of sheets) {
    const text = readFileSync(join(root, sheet), "utf8");
    walk(parse(text, { parseAtrulePrelude: false, parseValue: false }), {
      enter(node): void {
        selectorOf(out, sheet, node);
      },
    });
    for (const match of text.matchAll(SELECTOR_READ)) {
      out.reads.add(match[1] ?? "");
    }
  }
  return out;
}

function selectorOf(out: Selectors, sheet: string, node: CssNode): void {
  if (node.type === "ClassSelector") {
    const name = ident.decode(node.name);
    if (!out.classes.has(name)) {
      out.classes.set(name, sheet);
    }
    return;
  }
  if (node.type !== "AttributeSelector" || !node.name.name.startsWith(DATA)) {
    return;
  }
  const entry = out.attributes.get(node.name.name) ?? { sheet, values: new Set<string>() };
  if (node.value !== null) {
    entry.values.add(node.value.type === "String" ? node.value.value : node.value.name);
  }
  out.attributes.set(node.name.name, entry);
}

// Every hook site and string the walk meets, then the checker's answer for each held name.
class Hooks {
  readonly tokens = new Set<string>();
  readonly classHeads = new Set<string>();
  readonly writes = new Map<string, { readonly at: string; readonly values: Set<string> }>();
  readonly writeHeads = new Set<string>();
  /** Writes and reads of a template of finite lists, and the selector templates that spell one. */
  readonly writePatterns: { readonly pattern: Text; readonly at: string }[] = [];
  readonly readPatterns: { readonly pattern: Text; readonly world: World }[] = [];
  readonly selectorPatterns: { readonly pattern: Text; readonly world: World }[] = [];
  readonly testIdPatterns: { readonly pattern: Text; readonly world: World }[] = [];
  /** Each read name, and each name head a template leaves open, with the worlds that read it. */
  readonly reads = new Map<string, Set<World>>();
  readonly readHeads = new Map<string, Set<World>>();
  readonly valueReads = new Map<string, Map<string, Set<World>>>();
  /** Plain `data-testid` values a product file writes, with the first site. */
  readonly testIds = new Map<string, string>();
  readonly unresolved: Unresolved[] = [];
  #followed = 0;
  readonly #world: NativeWorld;
  readonly #sites: Site[] = [];
  readonly #selectorTemplates: { readonly node: Expression; readonly world: World; readonly at: string }[] = [];
  /** Reads of a house attribute model by name, kept once the member's declaration proves it is the model's. */
  readonly #modelReads: { readonly member: PropertyAccessExpression; readonly name: Expression; readonly at: string; readonly world: World }[] = [];
  /** The lists a `MutationObserver` filter names: each is an attribute the observer reads. */
  readonly #filterReads: { readonly node: Node; readonly at: string; readonly world: World }[] = [];
  readonly #testIdLookups: { readonly node: Expression; readonly world: World }[] = [];
  /** Every whole data-* string in a value position, and every string equal to a plain test id candidate. */
  readonly #whole: { readonly node: StringLiteral | NoSubstitutionTemplateLiteral; readonly at: string; readonly world: World }[] = [];

  readonly #held: HeldTexts;

  constructor(world: NativeWorld) {
    this.#world = world;
    this.#held = new HeldTexts(world);
  }

  get followed(): number {
    return this.#followed;
  }

  get steps(): number {
    return this.#held.steps;
  }

  walkFile(file: string, source: Node): void {
    let world: World = "tooling";
    if (isProduction(file)) {
      world = "product";
    } else if (productReader(file)) {
      world = "snap";
    } else if (testSource(file)) {
      world = "tests";
    }
    const visit = (node: Node): void => {
      if (isTypeNode(node) || isInterfaceDeclaration(node) || isTypeAliasDeclaration(node) || isImportDeclaration(node) || isExportDeclaration(node)) {
        return;
      }
      this.#node(node, file, world);
      node.forEachChild(visit);
    };
    visit(source);
  }

  readHtml(file: string, text: string): void {
    for (const match of text.matchAll(STRING)) {
      this.#classTokens(match[1] ?? match[2] ?? match[3] ?? "", false);
    }
    for (const match of text.matchAll(HTML_ATTRIBUTE)) {
      this.#write(match[1] ?? "", file, [match[3] ?? ""]);
    }
  }

  #node(node: Node, file: string, world: World): void {
    if (isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node)) {
      this.#string(node, file, world);
    } else if (isTemplateExpression(node)) {
      this.#templateParts(node, file, world);
    } else if (isJsxAttribute(node)) {
      const name = attributeName(node);
      if (world === "product" && name.startsWith(DATA)) {
        this.#jsxWrite(name, node.initializer, file, node);
      }
    } else if (isPropertyAssignment(node) || isShorthandPropertyAssignment(node) || isBinaryExpression(node)) {
      this.#operand(node, file, world);
    } else if (isCallExpression(node)) {
      this.#call(node, file, world);
    } else {
      this.#access(node, file, world);
    }
  }

  // A template's static parts are strings of their own; one that spells a selector or a data-* name is followed too.
  #templateParts(node: TemplateExpression, file: string, world: World): void {
    const at = atOf(file, node);
    const parts = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
    for (const [index, part] of parts.entries()) {
      const open = index < parts.length - 1;
      if (world === "product") {
        this.#classTokens(part, open);
      }
      this.#stringText({ text: part, open }, world, at);
    }
    if (parts.some((part) => part.includes("[") || part.includes(DATA))) {
      this.#selectorTemplates.push({ node, world, at });
    }
  }

  #access(node: Node, file: string, world: World): void {
    if (isPropertyAccessExpression(node) && isDataset(node.expression)) {
      this.#dataset(node, kebab(node.name.text), file, world);
    } else if (isElementAccessExpression(node) && isDataset(node.expression)) {
      this.#dataset(node, node.argumentExpression, file, world);
    } else if (isElementAccessExpression(node) && isModelMember(node.expression)) {
      this.#modelReads.push({ member: node.expression, name: node.argumentExpression, at: atOf(file, node), world });
    } else if (isElementAccessExpression(node) && world === "product") {
      this.#recordWrite(node, file);
    }
  }

  // `attrs[key] = value`: a record of attributes the code builds, then spreads onto an element, as an object literal's
  // key writes one. A claim only when the key resolves to a data-* name.
  #recordWrite(node: ElementAccessExpression, file: string): void {
    const value = assignedValue(node);
    if (value !== undefined) {
      this.#sites.push({ at: atOf(file, node), world: "product", key: true, name: node.argumentExpression, dataset: false, write: true, read: false, value });
    }
  }

  #string(node: StringLiteral | NoSubstitutionTemplateLiteral, file: string, world: World): void {
    if (isKey(node)) {
      return;
    }
    if (world === "product") {
      this.#classTokens(node.text, false);
    }
    const at = atOf(file, node);
    this.#stringText({ text: node.text, open: false }, world, at);
    if (DATA_NAME.test(node.text) || TEST_ID_VALUE.test(node.text)) {
      this.#whole.push({ node, at, world });
    }
  }

  // A JSX data-* attribute: a valueless one renders "true", a string its text, an expression what it can hold.
  #jsxWrite(name: string, initializer: Node | undefined, file: string, node: Node): void {
    const at = atOf(file, node);
    if (initializer === undefined) {
      this.#write(name, at, [PRESENT]);
    } else if (isStringLiteral(initializer)) {
      this.#write(name, at, [initializer.text]);
      if (name === TEST_ID && !this.testIds.has(initializer.text)) {
        this.testIds.set(initializer.text, at);
      }
    } else if (isJsxExpression(initializer) && initializer.expression !== undefined) {
      this.#sites.push({ at, world: "product", key: false, name, dataset: false, write: true, read: false, value: initializer.expression });
    }
  }

  // An object key that names a data-* attribute: quoted (`{ "data-x": v }`) or computed (`{ [ATTR]: v }`).
  #key(key: Node, initializer: Expression, file: string): void {
    if (isStringLiteral(key) && key.text.startsWith(DATA)) {
      this.#sites.push({ at: atOf(file, key), world: "product", key: false, name: key.text, dataset: false, write: true, read: false, value: initializer });
      if (key.text === TEST_ID && isStringLiteral(initializer) && !this.testIds.has(initializer.text)) {
        this.testIds.set(initializer.text, atOf(file, key));
      }
    } else if (isComputedPropertyName(key)) {
      this.#sites.push({
        at: atOf(file, key),
        world: "product",
        key: true,
        name: key.expression,
        dataset: false,
        write: true,
        read: false,
        value: initializer,
      });
    }
  }

  // An attribute call in any world is followed, so the names it reaches are reached; only the product's writes count.
  // An object key, an observer's filter, or a mutation record's `attributeName` compared with a name: the observer
  // watches that name change.
  #operand(node: PropertyAssignment | ShorthandPropertyAssignment | BinaryExpression, file: string, world: World): void {
    if (isBinaryExpression(node)) {
      const named = isRecordName(node.left) ? node.right : node.left;
      if (EQUALITY.has(node.operatorToken.kind) && (isRecordName(node.left) || isRecordName(node.right))) {
        this.#sites.push({ at: atOf(file, node), world, key: false, name: named, dataset: false, write: false, read: true, value: null });
      }
    } else if (isIdentifier(node.name) && node.name.text === ATTRIBUTE_FILTER) {
      this.#filterReads.push({ node: isPropertyAssignment(node) ? node.initializer : node, at: atOf(file, node), world });
    } else if (isPropertyAssignment(node) && world === "product") {
      this.#key(node.name, node.initializer, file);
    }
  }

  #call(node: CallExpression, file: string, world: World): void {
    const callee = node.expression;
    const method = calleeName(callee);
    const [name, value] = node.arguments;
    if (method === null || name === undefined) {
      return;
    }
    const at = atOf(file, node);
    if (method === TEST_ID_LOOKUP) {
      this.read(TEST_ID, undefined, world);
      this.#testIdLookups.push({ node: name, world });
      return;
    }
    if (MODEL_LOOKUPS.has(method) && isPropertyAccessExpression(callee) && isModelMember(callee.expression)) {
      this.#modelReads.push({ member: callee.expression, name, at, world });
      return;
    }
    if (WRITERS.has(method) || READERS.has(method)) {
      const written = method === "toggleAttribute" ? [""] : (value ?? null);
      this.#sites.push({
        at,
        world,
        key: false,
        name,
        dataset: false,
        write: world === "product" && WRITERS.has(method),
        read: READERS.has(method),
        value: written,
      });
    }
  }

  // `el.dataset.fooBar` or `el.dataset[key]`: an assignment's target writes, any other use reads.
  #dataset(node: Expression, name: string | Expression, file: string, world: World): void {
    const assigned = assignedValue(node);
    const at = atOf(file, node);
    const attribute = typeof name === "string" ? `${DATA}${name}` : name;
    const dataset = typeof name !== "string";
    if (assigned !== undefined) {
      this.#sites.push({ at, world, key: false, name: attribute, dataset, write: world === "product", read: false, value: assigned });
      return;
    }
    this.#sites.push({ at, world, key: false, name: attribute, dataset, write: false, read: true, value: null });
  }

  #write(name: string, at: string, values: readonly string[]): void {
    const entry = this.writes.get(name) ?? { at, values: new Set<string>() };
    for (const value of values) {
      entry.values.add(value);
    }
    this.writes.set(name, entry);
  }

  #classTokens(text: string, open: boolean): void {
    const tokens = text.split(/\s+/u);
    for (const [index, token] of tokens.entries()) {
      if (token === "") {
        continue;
      }
      if (open && index === tokens.length - 1) {
        this.classHeads.add(token);
        continue;
      }
      this.tokens.add(token);
      this.tokens.add(token.slice(token.lastIndexOf(":") + 1).replace(/^!/u, ""));
    }
  }

  #stringText({ text, open }: Text, world: World, at: string): void {
    for (const match of text.matchAll(SELECTOR_READ)) {
      this.read(match[1] ?? "", match[2], world);
    }
    for (const match of text.matchAll(VARIANT_READ)) {
      this.read(`${DATA}${match[1] ?? ""}`, match[2], world);
    }
    for (const match of text.matchAll(BARE_VARIANT_READ)) {
      this.read(`${DATA}${match[1] ?? ""}`, undefined, world);
    }
    const head = open ? OPEN_SELECTOR.exec(text)?.[1] : undefined;
    if (head !== undefined) {
      addWorld(this.readHeads, head, world);
    }
    this.#scriptText(text, world, at);
  }

  // Script source a string holds, run in a page or a frame: its attribute calls and `dataset` uses are sites too.
  #scriptText(text: string, world: World, at: string): void {
    for (const match of text.matchAll(SCRIPT_CALL)) {
      const method = `${match[1] ?? ""}${ATTRIBUTE}`;
      const name = match[2] ?? "";
      if (world === "product" && WRITERS.has(method)) {
        this.#write(name, at, [ANY]);
      }
      if (READERS.has(method)) {
        this.read(name, undefined, world);
      }
    }
    for (const match of text.matchAll(SCRIPT_DATASET)) {
      const name = `${DATA}${kebab(match[1] ?? "")}`;
      if (match[2] === undefined) {
        this.read(name, undefined, world);
      } else if (world === "product") {
        this.#write(name, at, [ANY]);
      }
    }
  }

  /** A read of `name`, and of its `value` when the read spells one, by `world`. */
  read(name: string, value: string | undefined, world: World): void {
    addWorld(this.reads, name, world);
    if (value !== undefined) {
      const values = this.valueReads.get(name) ?? new Map<string, Set<World>>();
      addWorld(values, value, world);
      this.valueReads.set(name, values);
    }
  }

  /** Follow every held name and value through the checker, then list what no site reaches. */
  resolve(): void {
    const world = this.#world;
    this.#modelSites();
    const asks: Expression[] = [
      ...this.#selectorTemplates.map(({ node }) => node),
      ...this.#testIdLookups.map(({ node }) => node),
      ...this.#sites.flatMap((site) => [...(typeof site.name === "string" ? [] : [site.name]), ...(isExpression(site.value) ? [site.value] : [])]),
    ];
    const answers = world.batch(asks.map((node) => this.#held.texts(node)));
    const textsOf: Answers = new Map(asks.map((node, at) => [node, answers[at] ?? null]));
    this.#followed = asks.length;
    for (const { node, world: reader, at } of this.#selectorTemplates) {
      for (const text of textsOf.get(node) ?? []) {
        if (text.parts === undefined) {
          this.#stringText(text, reader, at);
        } else {
          this.selectorPatterns.push({ pattern: text, world: reader });
        }
      }
    }
    this.#testIdSites(textsOf);
    this.#filterSites();
    for (const site of this.#sites) {
      this.#site(site, textsOf);
    }
    this.#unreached();
  }

  // A site whose name stays wide is listed when it claims an attribute: a computed key claims one only by resolving to
  // a data-* name, and a write outside the product claims none.
  // A read of a house attribute model by name is a site once its member is the model's own.
  #modelSites(): void {
    const homes = this.#world.batch(this.#modelReads.map(({ member }) => this.#declaredIn(member)));
    for (const [index, { member, name, at, world: reader }] of this.#modelReads.entries()) {
      if (ATTRIBUTE_MODELS.some((model) => model.member === member.name.text && (homes[index] ?? []).includes(model.file))) {
        this.#sites.push({ at, world: reader, key: false, name, dataset: false, write: false, read: true, value: null });
      }
    }
  }

  #testIdSites(textsOf: Answers): void {
    for (const { node, world: reader } of this.#testIdLookups) {
      const texts = textsOf.get(node) ?? null;
      if (texts === null) {
        const at = atOf(this.#world.fileOfSource(node.getSourceFile()), node);
        this.unresolved.push({ text: printed(node), at, world: reader, why: "a getByTestId value no hop resolves" });
      }
      for (const text of texts ?? []) {
        if (text.parts === undefined) {
          this.read(TEST_ID, text.text, reader);
        } else {
          this.read(TEST_ID, undefined, reader);
          this.testIdPatterns.push({ pattern: text, world: reader });
        }
      }
    }
  }

  #filterSites(): void {
    const filters = this.#world.batch(this.#filterReads.map(({ node }) => this.#held.elements(node)));
    for (const [index, { node, at, world: reader }] of this.#filterReads.entries()) {
      const names = filters[index] ?? null;
      if (names === null) {
        this.unresolved.push({ text: printed(node), at, world: reader, why: "an attributeFilter list no hop resolves" });
      }
      for (const name of names ?? []) {
        this.#siteName({ at, world: reader, key: false, name: name.text, dataset: false, write: false, read: true, value: null }, name, []);
      }
    }
  }

  *#declaredIn(member: PropertyAccessExpression): APIRequestGenerator<readonly (string | null)[]> {
    const symbol = yield* this.#world.checker.getSymbolAtLocation.gen(member);
    return (symbol?.declarations ?? []).map((handle) => this.#world.fileOf(handle));
  }

  #site(site: Site, textsOf: Answers): void {
    const names = typeof site.name === "string" ? [{ text: site.name, open: false }] : (textsOf.get(site.name) ?? null);
    if (names === null) {
      if (!site.key && (site.write || site.read)) {
        const text = typeof site.name === "string" ? site.name : printed(site.name);
        this.unresolved.push({ text, at: site.at, world: site.world, why: `an attribute ${site.write ? "write" : "read"} whose name no hop resolves` });
      }
      return;
    }
    const values = writtenValues(site.value, textsOf);
    for (const name of names) {
      this.#siteName(site, name, values);
    }
    this.#openWrite(site, names);
  }

  // A write whose name a wide part leaves open is listed: the pass cannot say which names it writes.
  #openWrite(site: Site, names: readonly Text[]): void {
    const open = names.find((name) => name.open && (site.dataset || name.text.startsWith(DATA)));
    if (site.write && open !== undefined) {
      const text = typeof site.name === "string" ? site.name : printed(site.name);
      this.unresolved.push({
        text,
        at: site.at,
        world: site.world,
        why: `an attribute write a wide part leaves open after "${open.text}", so the pass cannot name what it writes`,
      });
    }
  }

  #siteName(site: Site, found: Text, values: readonly string[]): void {
    if (found.parts !== undefined) {
      this.#sitePattern(site, site.dataset ? prefixed(kebabbed(found)) : found);
      return;
    }
    const { text, open } = found;
    const name = site.dataset ? `${DATA}${kebab(text)}` : text;
    if (!name.startsWith(DATA)) {
      return;
    }
    // An open write is listed unresolved (#openWrite) and writes every name its head starts, once the head holds a name
    // part of its own: a bare `data-` head is only the namespace, so it writes none. An open read reads every name its
    // head starts.
    if (open) {
      if (site.write && name.length > DATA.length) {
        this.writeHeads.add(name);
      }
      if (site.read) {
        addWorld(this.readHeads, name, site.world);
      }
      return;
    }
    if (site.write) {
      this.#write(name, site.at, values);
    }
    if (site.read) {
      this.read(name, undefined, site.world);
    }
  }

  // A template of finite lists is kept whole: its names are the product of its lists, never built (./patterns.ts).
  #sitePattern(site: Site, pattern: Text): void {
    if (!meets(pattern, NAMESPACE)) {
      return;
    }
    if (site.write) {
      this.writePatterns.push({ pattern, at: site.at });
    }
    if (site.read) {
      this.readPatterns.push({ pattern, world: site.world });
    }
  }

  // A whole data-* string no site reached names a hook through code the checker cannot follow; a whole string equal to
  // a plain test id may be a lookup's. Each is listed with its holder.
  #unreached(): void {
    const testIdReads = this.valueReads.get(TEST_ID);
    for (const { node, at, world } of this.#whole) {
      if (this.#held.reached(node)) {
        continue;
      }
      if (DATA_NAME.test(node.text)) {
        this.unresolved.push({ text: node.text, at, world, why: holderOf(node) });
      } else if (this.testIds.has(node.text) && this.testIds.get(node.text) !== at && testIdReads?.has(node.text) !== true) {
        this.unresolved.push({ text: node.text, at, world, why: `a string equal to a data-testid value: ${holderOf(node)}` });
      }
    }
  }
}

function calleeName(callee: Expression): string | null {
  if (isPropertyAccessExpression(callee)) {
    return callee.name.text;
  }
  return isIdentifier(callee) ? callee.text : null;
}

// A string in a key position names a property, never a value a site could take: an object key, a destructured
// property, the left of `in`, an element access's key. A key that names a data-* attribute is judged where the record
// meets the DOM (a JSX attribute or a spread), or as a record write.
function isKey(node: Node): boolean {
  const { parent } = node;
  return (
    ((isPropertyAssignment(parent) || isBindingElement(parent)) && sameNode(isBindingElement(parent) ? parent.propertyName : parent.name, node)) ||
    (isBinaryExpression(parent) && parent.operatorToken.kind === SyntaxKind.InKeyword && sameNode(parent.left, node)) ||
    (isElementAccessExpression(parent) && sameNode(parent.argumentExpression, node))
  );
}

// The value a plain assignment stores into `node`, when `node` is its target.
function assignedValue(node: Node): Expression | undefined {
  const { parent } = node;
  return isBinaryExpression(parent) && sameNode(parent.left, node) && parent.operatorToken.kind === SyntaxKind.EqualsToken ? parent.right : undefined;
}

const isDataset = (node: Expression): boolean => isPropertyAccessExpression(node) && node.name.text === DATASET;

const isRecordName = (node: Expression): boolean => isPropertyAccessExpression(node) && node.name.text === RECORD_NAME;

const isModelMember = (node: Expression): node is PropertyAccessExpression => isPropertyAccessExpression(node) && MODEL_MEMBERS.has(node.name.text);

// What a write site's value can be: its fixed values, else what the checker holds, any value when that is wide.
function writtenValues(value: Site["value"], textsOf: Answers): readonly string[] {
  if (value === null) {
    return [ANY];
  }
  if (!isExpression(value)) {
    return value;
  }
  const texts = textsOf.get(value) ?? null;
  // A template value is judged as any value: a sheet's few values are not worth a part-by-part match.
  return texts === null ? [ANY] : texts.map(({ text, open, parts }) => (open || parts !== undefined ? ANY : text));
}

function addWorld(map: Map<string, Set<World>>, key: string, world: World): void {
  const worlds = map.get(key) ?? new Set<World>();
  worlds.add(world);
  map.set(key, worlds);
}

const isExpression = (value: Site["value"]): value is Expression => value !== null && !Array.isArray(value);

function atOf(file: string, node: Node): string {
  const source = node.getSourceFile();
  return `${file}:${String(editorLineOf(source, node.getStart(source)))}`;
}

// A namespaced JSX name (`xlink:href`) is never a data-* attribute.
const attributeName = (node: JsxAttribute): string => (isIdentifier(node.name) ? node.name.text : "");

const printed = (node: Node): string => node.getText(node.getSourceFile());

// Where an unreached string sits, as the reason no site reaches it.
function holderOf(node: Node): string {
  const { parent } = node;
  if (isCallExpression(parent)) {
    return `handed to ${printed(parent.expression)}(), which no attribute site follows`;
  }
  if (isVariableDeclaration(parent) || isPropertyAssignment(parent)) {
    return `held by ${printed(parent.name)}, which no attribute site reads`;
  }
  if (isArrayLiteralExpression(parent)) {
    return "an element of a list no attribute site reads";
  }
  if (isJsxAttribute(parent)) {
    return `the value of the ${attributeName(parent)} prop, which no attribute site follows`;
  }
  if (isBinaryExpression(parent)) {
    return `an operand of ${printed(parent)}, never handed to an attribute site`;
  }
  return "a string no attribute site reaches";
}

// The installed direct dependencies of every package, as real paths: a pnpm store keeps a package's own dependencies
// beside it, never inside it.
function dependencyDirs(root: string): readonly string[] {
  const dirs = new Set<string>();
  for (const modules of globSync(DEPENDENCIES, { cwd: root })) {
    for (const entry of readdirSync(join(root, modules), { withFileTypes: true })) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const at = join(root, modules, entry.name);
      const packages = entry.name.startsWith("@") ? readdirSync(at).map((name) => join(at, name)) : [at];
      for (const dir of packages) {
        dirs.add(realpathSync(dir));
      }
    }
  }
  return [...dirs];
}

// A dependency's own code files: a nested node_modules directory holds other packages, so the walk never enters one.
function codeFiles(dir: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== NODE_MODULES) {
      files.push(...codeFiles(join(dir, entry.name)));
    } else if (entry.isFile() && DEPENDENCY_CODE.test(entry.name)) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

// The names among `names` some installed dependency's own code writes, and how many of its files were read. A
// dependency writes a name only as a whole token: a whole string (an attribute call's argument, a JSX key, a class), a
// whole class in a class string, or a `dataset` member. A name inside a longer word is no spelling of it.
function dependencySpelled(root: string, names: readonly string[]): { readonly spelled: ReadonlySet<string>; readonly files: number } {
  const spelled = new Set<string>();
  if (names.length === 0) {
    return { spelled, files: 0 };
  }
  const wanted = new Set(names);
  const take = (token: string): void => {
    if (wanted.has(token)) {
      spelled.add(token);
    }
  };
  const files = dependencyDirs(root).flatMap(codeFiles);
  for (const path of files) {
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(STRING)) {
      const value = match[1] ?? match[2] ?? match[3] ?? "";
      take(value);
      for (const token of value.split(/\s+/u)) {
        if (!token.startsWith(DATA)) {
          take(token);
        }
      }
    }
    for (const match of text.matchAll(SCRIPT_DATASET)) {
      take(`${DATA}${kebab(match[1] ?? "")}`);
    }
  }
  return { spelled, files: files.length };
}

const NAMESPACE: Text = { text: DATA, open: true };

// A `dataset` template's attribute: each fixed part and alternative in kebab case, which maps letter by letter, under
// the `data-` namespace.
function kebabbed(text: Text): Text {
  return {
    text: kebab(text.text),
    open: text.open,
    ...(text.parts === undefined ? {} : { parts: text.parts.map((part) => (typeof part === "string" ? kebab(part) : part.map(kebabbed))) }),
  };
}

function prefixed(text: Text): Text {
  const parts = text.parts ?? [text.text];
  const [first, ...rest] = parts;
  return {
    text: `${DATA}${text.text}`,
    open: text.open,
    parts: [typeof first === "string" ? `${DATA}${first}` : DATA, ...(typeof first === "string" ? [] : [first ?? []]), ...rest],
  };
}

const headed = (heads: ReadonlySet<string>, name: string): boolean => [...heads].some((head) => name.startsWith(head));

function ownerCssNames(root: string): ReadonlySet<string> {
  const text = readFileSync(join(root, OWNER_CSS_SURFACE), "utf8");
  return new Set([...text.matchAll(STRING)].map((match) => (match[1] ?? match[2] ?? match[3] ?? "").replace(/^\./u, "")));
}

// The worlds that read a name, by the name itself or by a head a template leaves open.
function readersOf(hooks: Hooks, name: string): ReadonlySet<World> {
  const worlds = new Set(hooks.reads.get(name));
  for (const [head, readers] of hooks.readHeads) {
    if (name.startsWith(head)) {
      for (const world of readers) {
        worlds.add(world);
      }
    }
  }
  const exact: Text = { text: name, open: false };
  for (const { pattern, world } of hooks.readPatterns) {
    if (holds(pattern, name)) {
      worlds.add(world);
    }
  }
  for (const { pattern, world } of hooks.selectorPatterns) {
    if (selects(pattern, exact)) {
      worlds.add(world);
    }
  }
  return worlds;
}

// The worlds that read any name a written template can be: matched part by part, never multiplied out.
function patternReaders(hooks: Hooks, pattern: Text): ReadonlySet<World> {
  const worlds = new Set<World>();
  const add = (readers: Iterable<World>): void => {
    for (const world of readers) {
      worlds.add(world);
    }
  };
  for (const [name, readers] of hooks.reads) {
    if (holds(pattern, name)) {
      add(readers);
    }
  }
  for (const [head, readers] of hooks.readHeads) {
    if (meets(pattern, { text: head, open: true })) {
      add(readers);
    }
  }
  for (const { pattern: read, world } of hooks.readPatterns) {
    if (meets(pattern, read)) {
      worlds.add(world);
    }
  }
  for (const { pattern: selector, world } of hooks.selectorPatterns) {
    if (selects(selector, pattern)) {
      worlds.add(world);
    }
  }
  return worlds;
}

// A read outside the product only annotates a row, as the graph's roles do (./state.ts header): a hook only tests or
// tooling read is still one the product never reads.
const annotated = (row: string, readers: ReadonlySet<World>): string =>
  readers.size === 0 ? row : `${row} read by ${WORLDS.filter((world) => readers.has(world)).join(", ")}`;

// What every verdict reads: the sheets, the hooks, the published names and the names judged elsewhere. A mention no
// hop resolves, in a world whose reads count, keeps a name out of the buckets.
interface Verdicts {
  readonly selectors: Selectors;
  readonly hooks: Hooks;
  readonly owner: ReadonlySet<string>;
  readonly unresolved: ReadonlySet<string>;
  readonly unresolvedTestIds: ReadonlySet<string>;
  readonly spelled: ReadonlySet<string>;
  readonly out: { readonly [B in DomBucket]: string[] };
}

function judgeClasses({ selectors, owner, spelled, out }: Verdicts, unwritten: readonly string[]): void {
  for (const name of unwritten.filter((candidate) => !spelled.has(candidate))) {
    out[owner.has(name) ? "css-class-owner-css-only" : "css-class-unwritten"].push(`${selectors.classes.get(name) ?? ""}:.${name}`);
  }
}

function judgeAttributes({ selectors, hooks, unresolved, spelled, out }: Verdicts, unwritten: readonly string[]): void {
  for (const name of unwritten.filter((candidate) => !(spelled.has(candidate) || unresolved.has(candidate)))) {
    const { sheet, values } = selectors.attributes.get(name) ?? { sheet: "", values: new Set<string>() };
    const written = hooks.writes.get(name);
    if (written === undefined) {
      out["css-attr-unwritten"].push(`${sheet}:[${name}]`);
      continue;
    }
    const missing = [...values].filter((value) => !written.values.has(value));
    if (missing.length > 0) {
      out["css-attr-value-unwritten"].push(`${sheet}:[${name}=${missing.join("|")}]`);
    }
  }
}

function judgeWrites({ hooks, owner, unresolved, out }: Verdicts): void {
  for (const [name, { at }] of hooks.writes) {
    const readers = readersOf(hooks, name);
    if (!(SEALED_NAME.test(name) || [...readers].some((world) => USES.has(world)) || unresolved.has(name))) {
      out[owner.has(name) ? "dom-attr-owner-css-only" : "dom-attr-unread"].push(annotated(`${name} ${at}`, readers));
    }
  }
  // A template no read can match is one row: its spelling and how many names it can be.
  for (const { pattern, at } of hooks.writePatterns) {
    const readers = patternReaders(hooks, pattern);
    if (!(SEALED_NAME.test(pattern.text) || [...readers].some((world) => USES.has(world)))) {
      const published = [...owner].some((name) => holds(pattern, name));
      const row = `${pattern.text} (${String(nameCount(pattern))} names) ${at}`;
      out[published ? "dom-attr-owner-css-only" : "dom-attr-unread"].push(annotated(row, readers));
    }
  }
}

// A test id is read by the product, snap or its tests; another tool's lookup only annotates it.
function judgeTestIds({ hooks, unresolvedTestIds, out }: Verdicts): void {
  for (const [value, at] of hooks.testIds) {
    const readers = new Set(hooks.valueReads.get(TEST_ID)?.get(value));
    for (const { pattern, world } of hooks.testIdPatterns) {
      if (holds(pattern, value)) {
        readers.add(world);
      }
    }
    if (!([...readers].some((world) => TEST_ID_USES.has(world)) || unresolvedTestIds.has(value))) {
      out["dom-value-unread"].push(annotated(`${TEST_ID}=${value} ${at}`, readers));
    }
  }
}

function judge(root: string, selectors: Selectors, hooks: Hooks, read: { readonly files: number; readonly sheets: number }): DomReport {
  const classWritten = (name: string): boolean => hooks.tokens.has(name) || [...hooks.classHeads].some((head) => name.startsWith(head));
  const unwrittenClasses = [...selectors.classes.keys()].filter((name) => !(SEALED_NAME.test(name) || classWritten(name)));
  const unwrittenAttributes = [...selectors.attributes.keys()].filter(
    (name) =>
      !(
        SEALED_NAME.test(name) ||
        hooks.writes.get(name)?.values.has(ANY) === true ||
        headed(hooks.writeHeads, name) ||
        hooks.writePatterns.some(({ pattern }) => holds(pattern, name))
      ),
  );
  const dependency = dependencySpelled(root, [...unwrittenClasses, ...unwrittenAttributes]);
  const out: { readonly [B in DomBucket]: string[] } = {
    "css-class-unwritten": [],
    "css-class-owner-css-only": [],
    "css-attr-unwritten": [],
    "css-attr-value-unwritten": [],
    "dom-attr-unread": [],
    "dom-attr-owner-css-only": [],
    "dom-value-unread": [],
  };
  const verdicts: Verdicts = {
    selectors,
    hooks,
    owner: ownerCssNames(root),
    unresolved: new Set(hooks.unresolved.filter(({ world }) => USES.has(world)).map(({ text }) => text)),
    unresolvedTestIds: new Set(hooks.unresolved.filter(({ world }) => TEST_ID_USES.has(world)).map(({ text }) => text)),
    spelled: dependency.spelled,
    out,
  };
  judgeClasses(verdicts, unwrittenClasses);
  judgeAttributes(verdicts, unwrittenAttributes);
  judgeWrites(verdicts);
  judgeTestIds(verdicts);
  for (const bucket of DOM_BUCKETS) {
    out[bucket].sort();
  }
  return {
    buckets: out,
    unresolved: hooks.unresolved.toSorted((a, b) => a.at.localeCompare(b.at) || a.text.localeCompare(b.text)),
    counts: {
      files: read.files,
      sheets: read.sheets,
      classSelectors: selectors.classes.size,
      attributeSelectors: selectors.attributes.size,
      writtenNames: hooks.writes.size + hooks.writePatterns.length,
      readNames: hooks.reads.size,
      followed: hooks.followed,
      steps: hooks.steps,
      dependencyFiles: dependency.files,
    },
  };
}
