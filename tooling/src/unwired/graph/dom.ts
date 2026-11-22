// The DOM-hook pass: class names and data-* attributes link markup to sheets, selectors and tests with no symbol
// between them, so a sheet rule nothing writes, or a data-* hook nothing reads, is dead code no member bucket sees.
//
// - Sheets are read with css-tree: each class selector and each data-* attribute selector with its values. A data-*
//   name an at-rule prelude spells (`@custom-variant`) is a read, since the rule parse leaves preludes raw.
// - Every token of every product string is a class write, a superset that only adds writes; a static part a `${`
//   follows writes every class its last token heads.
// - A data-* write is a JSX attribute, a quoted or computed object key, `setAttribute` or `toggleAttribute`, or a
//   `dataset` assignment, in product code. A read is an attribute getter, `toggleAttribute`, `toHaveAttribute`, a
//   `dataset` read, a sheet selector, or a selector or Tailwind data variant a string spells. A read in tests or tooling
//   only annotates its row, as the graph's roles do (./state.ts header), except that a test's `getByTestId` or selector
//   reads a test id, since those hooks exist for tests, and that a snap read (SNAP) counts as the product's.
// - A computed key is an attribute claim only when its name resolves to a data-* name: most keys name no attribute.
// - A name or value held away from its site is followed through the checker: its literal type, then its symbol's
//   declarations (an initializer, a for-of's list, a parameter's callers' arguments). A whole data-* string no site
//   reaches, and a site whose name no hop resolves, is listed as unresolved with its reason; a mention in a world
//   whose reads count keeps its name out of every bucket.
// - A name a sealed library stamps is the library's (SEALED_NAME). A selector name an installed direct dependency's
//   own code spells is that library's hook (streamdown's `data-streamdown`), found by a literal search of its JS. A
//   `data-slot` value, a class or an attribute the owner-CSS surface publishes is read by CSS the owner writes, a
//   reader outside the program, so it is judged as published; only `data-testid` values are judged one by one.
import type { Dirent } from "node:fs";
import { globSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import type { CssNode } from "@eslint/css-tree";
import { ident, parse, walk } from "@eslint/css-tree";
import type { CallExpression, Expression, JsxAttribute, Node, NoSubstitutionTemplateLiteral, StringLiteral, TemplateExpression } from "@typescript/native/ast";
import {
  isArrayLiteralExpression,
  isArrowFunction,
  isAsExpression,
  isBinaryExpression,
  isCallExpression,
  isComputedPropertyName,
  isConditionalExpression,
  isElementAccessExpression,
  isEnumMember,
  isExportDeclaration,
  isForOfStatement,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isImportDeclaration,
  isInterfaceDeclaration,
  isJsxAttribute,
  isJsxExpression,
  isMethodDeclaration,
  isNonNullExpression,
  isNoSubstitutionTemplateLiteral,
  isParameterDeclaration,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isSatisfiesExpression,
  isStringLiteral,
  isTemplateExpression,
  isTypeAliasDeclaration,
  isTypeNode,
  isVariableDeclaration,
  isVariableDeclarationList,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol } from "@typescript/native/sync";
import { SymbolFlags } from "@typescript/native/sync";
import { kebab, SEALED_NAME } from "../../eslint/index.ts";
import { hasFlag } from "../native.ts";
import type { Graph } from "./build.ts";
import { NOT_SOURCE, OWNER_CSS_SURFACE, SHEETS, STRING } from "./css.ts";
import type { GraphState } from "./state.ts";

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

// Owner ruling: snap drives the real app, so a hook only snap reads is used, as a dev-bridge global read is. Other
// tooling and the tests only annotate.
const SNAP = "tooling/src/snap/";
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
    readonly dependencyFiles: number;
  };
}

const HTML = "packages/*/src/**/*.html";
const DEPENDENCIES = "packages/*/node_modules";
const DEPENDENCY_CODE = /\.[cm]?js$/u;
const DATA = "data-";
const TEST_ID = "data-testid";
/** A whole string that is one data-* name. */
const DATA_NAME = /^data-[a-z][\w-]*[a-z0-9]$/u;
/** A plain `data-testid` value: one a lookup can spell. */
const TEST_ID_VALUE = /^[\w:-]+$/u;
/** Selector reads a string spells: `[data-x]`, `[data-x="v"]`, Tailwind's `data-[x=v]:` and `data-x:`. */
const SELECTOR_READ = /\[(data-[a-z][\w-]*)(?:[~|^$*]?=["']?([\w:-]+))?/gu;
const VARIANT_READ = /(?:^|[\s:])(?:group-|peer-|in-|not-|has-)?data-\[([a-z][\w-]*)(?:=([\w-]+))?\]/gu;
const BARE_VARIANT_READ = /(?:^|[\s:])(?:group-|peer-|in-|not-|has-)?data-([a-z][\w-]*):/gu;
/** An open selector a template ends inside: `[data-appearance-${key}]` reads every name that head starts. */
const OPEN_SELECTOR = /\[(data-[a-z][\w-]*-)$/u;
const HTML_ATTRIBUTE = /\s(data-[a-z][\w-]*[a-z0-9])(?:=(["'])(.*?)\2)?/gu;
const WRITERS: ReadonlySet<string> = new Set(["setAttribute", "toggleAttribute"]);
const READERS: ReadonlySet<string> = new Set(["getAttribute", "hasAttribute", "removeAttribute", "toggleAttribute", "toHaveAttribute"]);
const TEST_ID_LOOKUP = "getByTestId";
const TESTS = "tests/";
const DATASET = "dataset";
/** React renders a valueless JSX attribute, and `true`, as the string "true". */
const PRESENT = "true";
/** Any value: one the checker holds only as a wide type. */
const ANY = "*";
// A hop is one declaration, list or caller followed from a use; a chain longer than this is a cycle or a hand-off no
// table holds.
const MAX_HOPS = 8;
// A template whose spans multiply past this many texts is a computed name, not a table of them.
const MAX_TEXTS = 64;

// A text a string expression can take; `open` when a span past it is wide, so the text is only a head.
interface Text {
  readonly text: string;
  readonly open: boolean;
}

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
type Answers = ReadonlyMap<Expression, readonly Text[] | null>;

interface Selectors {
  readonly classes: Map<string, string>;
  readonly attributes: Map<string, { readonly sheet: string; readonly values: Set<string> }>;
  readonly reads: Set<string>;
}

/** Every class and data-* hook of the tree at `root` with no partner, with `graph` deciding product files and its
 *  world's checker following the names held in constants. */
export function domPass(root: string, graph: Graph): DomReport {
  const sheets = globSync(SHEETS, { cwd: root, exclude: NOT_SOURCE });
  const selectors = readSheets(root, sheets);
  const hooks = new Hooks(graph.state);
  for (const source of graph.state.world.files) {
    hooks.walkFile(graph.state.world.fileOfSource(source), source);
  }
  for (const file of globSync(HTML, { cwd: root, exclude: NOT_SOURCE })) {
    hooks.readHtml(file, readFileSync(join(root, file), "utf8"));
  }
  hooks.resolve();
  for (const name of selectors.reads) {
    hooks.read(name, undefined, "product");
  }
  return judge(root, selectors, hooks, { files: graph.state.world.files.length, sheets: sheets.length });
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
  /** Each read name, and each name head a template leaves open, with the worlds that read it. */
  readonly reads = new Map<string, Set<World>>();
  readonly readHeads = new Map<string, Set<World>>();
  readonly valueReads = new Map<string, Map<string, Set<World>>>();
  /** Plain `data-testid` values a product file writes, with the first site. */
  readonly testIds = new Map<string, string>();
  readonly unresolved: Unresolved[] = [];
  #followed = 0;
  readonly #state: GraphState;
  readonly #sites: Site[] = [];
  readonly #selectorTemplates: { readonly node: Expression; readonly world: World }[] = [];
  readonly #testIdLookups: { readonly node: Expression; readonly world: World }[] = [];
  /** Every whole data-* string in a value position, and every string equal to a plain test id candidate. */
  readonly #whole: { readonly node: StringLiteral | NoSubstitutionTemplateLiteral; readonly at: string; readonly world: World }[] = [];
  readonly #reached = new Set<string>();

  constructor(state: GraphState) {
    this.#state = state;
  }

  get followed(): number {
    return this.#followed;
  }

  walkFile(file: string, source: Node): void {
    let world: World = "tooling";
    if (this.#state.product(file)) {
      world = "product";
    } else if (file.startsWith(SNAP)) {
      world = "snap";
    } else if (file.startsWith(TESTS)) {
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
      this.#templateParts(node, world);
    } else if (isJsxAttribute(node)) {
      const name = attributeName(node);
      if (world === "product" && name.startsWith(DATA)) {
        this.#jsxWrite(name, node.initializer, file, node);
      }
    } else if (isPropertyAssignment(node)) {
      if (world === "product") {
        this.#key(node.name, node.initializer, file);
      }
    } else if (isCallExpression(node)) {
      this.#call(node, file, world);
    } else {
      this.#datasetAccess(node, file, world);
    }
  }

  // A template's static parts are strings of their own; one that spells a selector or a data-* name is followed too.
  #templateParts(node: TemplateExpression, world: World): void {
    const parts = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
    for (const [index, part] of parts.entries()) {
      const open = index < parts.length - 1;
      if (world === "product") {
        this.#classTokens(part, open);
      }
      this.#selectorText({ text: part, open }, world);
    }
    if (parts.some((part) => part.includes("[") || part.includes(DATA))) {
      this.#selectorTemplates.push({ node, world });
    }
  }

  #datasetAccess(node: Node, file: string, world: World): void {
    if (isPropertyAccessExpression(node) && isDataset(node.expression)) {
      this.#dataset(node, kebab(node.name.text), file, world);
    } else if (isElementAccessExpression(node) && isDataset(node.expression)) {
      this.#dataset(node, node.argumentExpression, file, world);
    }
  }

  #string(node: StringLiteral | NoSubstitutionTemplateLiteral, file: string, world: World): void {
    const { parent } = node;
    if (isPropertyAssignment(parent) && parent.name === node) {
      return;
    }
    if (world === "product") {
      this.#classTokens(node.text, false);
    }
    this.#selectorText({ text: node.text, open: false }, world);
    if (DATA_NAME.test(node.text) || TEST_ID_VALUE.test(node.text)) {
      this.#whole.push({ node, at: atOf(file, node), world });
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
    const { parent } = node;
    const assigned = isBinaryExpression(parent) && parent.left === node && parent.operatorToken.kind === SyntaxKind.EqualsToken;
    const at = atOf(file, node);
    const attribute = typeof name === "string" ? `${DATA}${name}` : name;
    const dataset = typeof name !== "string";
    if (assigned) {
      this.#sites.push({ at, world, key: false, name: attribute, dataset, write: world === "product", read: false, value: parent.right });
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

  #selectorText({ text, open }: Text, world: World): void {
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
    const { world } = this.#state;
    const asks: Expression[] = [
      ...this.#selectorTemplates.map(({ node }) => node),
      ...this.#testIdLookups.map(({ node }) => node),
      ...this.#sites.flatMap((site) => [...(typeof site.name === "string" ? [] : [site.name]), ...(isExpression(site.value) ? [site.value] : [])]),
    ];
    const answers = world.batch(asks.map((node) => this.#texts(node, 0)));
    const textsOf: Answers = new Map(asks.map((node, at) => [node, answers[at] ?? null]));
    this.#followed = asks.length;
    for (const { node, world: reader } of this.#selectorTemplates) {
      for (const text of textsOf.get(node) ?? []) {
        this.#selectorText(text, reader);
      }
    }
    for (const { node, world: reader } of this.#testIdLookups) {
      const texts = textsOf.get(node) ?? null;
      if (texts === null) {
        const at = atOf(world.fileOfSource(node.getSourceFile()), node);
        this.unresolved.push({ text: printed(node), at, world: reader, why: "a getByTestId value no hop resolves" });
      }
      for (const { text } of texts ?? []) {
        this.read(TEST_ID, text, reader);
      }
    }
    for (const site of this.#sites) {
      this.#site(site, textsOf);
    }
    this.#unreached();
  }

  // A site whose name stays wide is listed when it claims an attribute: a computed key claims one only by resolving to
  // a data-* name, and a write outside the product claims none.
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
  }

  #siteName(site: Site, { text, open }: Text, values: readonly string[]): void {
    const name = site.dataset ? `${DATA}${kebab(text)}` : text;
    if (!name.startsWith(DATA)) {
      return;
    }
    if (open) {
      if (site.write) {
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

  // A whole data-* string no site reached names a hook through code the checker cannot follow; a whole string equal to
  // a plain test id may be a lookup's. Each is listed with its holder.
  #unreached(): void {
    const testIdReads = this.valueReads.get(TEST_ID);
    for (const { node, at, world } of this.#whole) {
      if (this.#reached.has(keyOf(this.#state, node))) {
        continue;
      }
      if (DATA_NAME.test(node.text)) {
        this.unresolved.push({ text: node.text, at, world, why: holderOf(node) });
      } else if (this.testIds.has(node.text) && this.testIds.get(node.text) !== at && testIdReads?.has(node.text) !== true) {
        this.unresolved.push({ text: node.text, at, world, why: `a string equal to a data-testid value: ${holderOf(node)}` });
      }
    }
  }

  // The texts an expression can take, or null when the checker holds it only as a wide type. Every literal a hop
  // reaches is marked reached, whether or not its type already answered.
  *#texts(node: Node, hops: number): APIRequestGenerator<readonly Text[] | null> {
    if (isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node)) {
      this.#reached.add(keyOf(this.#state, node));
      return [{ text: node.text, open: false }];
    }
    if (isParenthesizedExpression(node) || isAsExpression(node) || isSatisfiesExpression(node) || isNonNullExpression(node)) {
      return yield* this.#texts(node.expression, hops);
    }
    if (isTemplateExpression(node)) {
      return yield* this.#template(node, hops);
    }
    if (isConditionalExpression(node)) {
      return union([yield* this.#texts(node.whenTrue, hops), yield* this.#texts(node.whenFalse, hops)]);
    }
    if (isArrayLiteralExpression(node)) {
      const elements: (readonly Text[] | null)[] = [];
      for (const element of node.elements) {
        elements.push(yield* this.#texts(element, hops));
      }
      return union(elements);
    }
    const { checker } = this.#state.world;
    const typed = yield* this.#state.literalValues(yield* checker.getTypeAtLocation.gen(node));
    const held = hops < MAX_HOPS ? yield* this.#held(node, hops) : null;
    return typed === null ? held : typed.map((text) => ({ text, open: false }));
  }

  *#template(
    node: Node & {
      readonly head: { readonly text: string };
      readonly templateSpans: readonly { readonly expression: Expression; readonly literal: { readonly text: string } }[];
    },
    hops: number,
  ): APIRequestGenerator<readonly Text[] | null> {
    let texts: Text[] = [{ text: node.head.text, open: false }];
    for (const span of node.templateSpans) {
      const parts = yield* this.#texts(span.expression, hops);
      if (parts === null || parts.length * texts.length > MAX_TEXTS) {
        return texts.map(({ text }) => ({ text, open: true }));
      }
      texts = texts.flatMap((head) =>
        head.open ? [head] : parts.map((part) => ({ text: `${head.text}${part.text}${part.open ? "" : span.literal.text}`, open: part.open })),
      );
    }
    return texts;
  }

  // The texts the declarations of the symbol an expression names can hold: an initializer, the list a for-of walks,
  // a parameter's default and each caller's argument; an element access with no symbol of its own, its list's.
  *#held(node: Node, hops: number): APIRequestGenerator<readonly Text[] | null> {
    if (!(isIdentifier(node) || isPropertyAccessExpression(node) || isElementAccessExpression(node))) {
      return null;
    }
    const { world } = this.#state;
    const symbol = yield* this.#unalias(yield* world.checker.getSymbolAtLocation.gen(node));
    if (symbol === undefined) {
      return isElementAccessExpression(node) ? yield* this.#texts(node.expression, hops + 1) : null;
    }
    const found: (readonly Text[] | null)[] = [];
    for (const handle of symbol.declarations) {
      if (world.fileOf(handle) === null) {
        return null;
      }
      const declaration = yield* handle.resolve.gen();
      found.push(declaration === undefined ? null : yield* this.#declared(declaration, hops + 1));
    }
    return found.length === 0 ? null : union(found);
  }

  *#declared(declaration: Node, hops: number): APIRequestGenerator<readonly Text[] | null> {
    if ((isVariableDeclaration(declaration) || isPropertyAssignment(declaration) || isEnumMember(declaration)) && declaration.initializer !== undefined) {
      return yield* this.#texts(declaration.initializer, hops);
    }
    if (isVariableDeclaration(declaration) && isVariableDeclarationList(declaration.parent) && isForOfStatement(declaration.parent.parent)) {
      return yield* this.#texts(declaration.parent.parent.expression, hops);
    }
    if (isParameterDeclaration(declaration)) {
      return yield* this.#arguments(declaration, hops);
    }
    return null;
  }

  // A parameter holds what every caller hands it at its index, and its default.
  *#arguments(
    parameter: Node & { readonly parent: Node; readonly initializer?: Expression | undefined },
    hops: number,
  ): APIRequestGenerator<readonly Text[] | null> {
    const fn = parameter.parent;
    if (!(isFunctionDeclaration(fn) || isMethodDeclaration(fn) || isArrowFunction(fn) || isFunctionExpression(fn))) {
      return null;
    }
    const index = fn.parameters.indexOf(parameter as (typeof fn.parameters)[number]);
    const found: (readonly Text[] | null)[] = parameter.initializer === undefined ? [] : [yield* this.#texts(parameter.initializer, hops)];
    const target = (isArrowFunction(fn) || isFunctionExpression(fn)) && isVariableDeclaration(fn.parent) ? fn.parent : fn;
    for (const usage of yield* this.#state.world.signatureUsage(target)) {
      const call = usage.call === undefined ? undefined : yield* usage.call.resolve.gen();
      const argument = call !== undefined && isCallExpression(call) ? call.arguments[index] : undefined;
      found.push(argument === undefined ? null : yield* this.#texts(argument, hops));
    }
    return found.length === 0 ? null : union(found);
  }

  *#unalias(symbol: NativeSymbol | undefined): APIRequestGenerator<NativeSymbol | undefined> {
    if (symbol === undefined || !hasFlag(symbol.flags, SymbolFlags.Alias)) {
      return symbol;
    }
    return yield* this.#state.world.checker.getAliasedSymbol.gen(symbol);
  }
}

function calleeName(callee: Expression): string | null {
  if (isPropertyAccessExpression(callee)) {
    return callee.name.text;
  }
  return isIdentifier(callee) ? callee.text : null;
}

const isDataset = (node: Expression): boolean => isPropertyAccessExpression(node) && node.name.text === DATASET;

// What a write site's value can be: its fixed values, else what the checker holds, any value when that is wide.
function writtenValues(value: Site["value"], textsOf: Answers): readonly string[] {
  if (value === null) {
    return [ANY];
  }
  if (!isExpression(value)) {
    return value;
  }
  const texts = textsOf.get(value) ?? null;
  return texts === null ? [ANY] : texts.map(({ text, open }) => (open ? ANY : text));
}

function addWorld(map: Map<string, Set<World>>, key: string, world: World): void {
  const worlds = map.get(key) ?? new Set<World>();
  worlds.add(world);
  map.set(key, worlds);
}

const isExpression = (value: Site["value"]): value is Expression => value !== null && !Array.isArray(value);

// The union of several answers: null when any is wide, since a wide part can hold any name.
function union(parts: readonly (readonly Text[] | null)[]): readonly Text[] | null {
  if (parts.some((part) => part === null)) {
    return null;
  }
  const seen = new Map<string, Text>();
  for (const text of parts.flatMap((part) => part ?? [])) {
    seen.set(`${String(text.open)}:${text.text}`, text);
  }
  return [...seen.values()];
}

const keyOf = (state: GraphState, node: Node): string => `${state.world.fileOfSource(node.getSourceFile())}:${String(node.pos)}`;

function atOf(file: string, node: Node): string {
  const source = node.getSourceFile();
  return `${file}:${String(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1)}`;
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

// A dependency's own code files: its nested node_modules hold other packages.
function codeFiles(dir: string): readonly string[] {
  const entries: Dirent[] = readdirSync(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && DEPENDENCY_CODE.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => !path.slice(dir.length).includes("/node_modules/"));
}

// The names among `names` some installed dependency's own code spells, and how many of its files were read.
function dependencySpelled(root: string, names: readonly string[]): { readonly spelled: ReadonlySet<string>; readonly files: number } {
  const spelled = new Set<string>();
  if (names.length === 0) {
    return { spelled, files: 0 };
  }
  const files = dependencyDirs(root).flatMap(codeFiles);
  for (const path of files) {
    const text = readFileSync(path, "utf8");
    for (const name of names.filter((candidate) => !spelled.has(candidate) && text.includes(candidate))) {
      spelled.add(name);
    }
  }
  return { spelled, files: files.length };
}

function ownerCssNames(root: string): ReadonlySet<string> {
  const text = readFileSync(join(root, OWNER_CSS_SURFACE), "utf8");
  return new Set([...text.matchAll(STRING)].map((match) => (match[1] ?? match[2] ?? match[3] ?? "").replace(/^\./u, "")));
}

const headed = (heads: ReadonlySet<string>, name: string): boolean => [...heads].some((head) => name.startsWith(head));

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
}

// A test id is read by the product, snap or its tests; another tool's lookup only annotates it.
function judgeTestIds({ hooks, unresolvedTestIds, out }: Verdicts): void {
  for (const [value, at] of hooks.testIds) {
    const readers = hooks.valueReads.get(TEST_ID)?.get(value) ?? new Set<World>();
    if (!([...readers].some((world) => TEST_ID_USES.has(world)) || unresolvedTestIds.has(value))) {
      out["dom-value-unread"].push(annotated(`${TEST_ID}=${value} ${at}`, readers));
    }
  }
}

function judge(root: string, selectors: Selectors, hooks: Hooks, read: { readonly files: number; readonly sheets: number }): DomReport {
  const classWritten = (name: string): boolean => hooks.tokens.has(name) || [...hooks.classHeads].some((head) => head.length > 2 && name.startsWith(head));
  const unwrittenClasses = [...selectors.classes.keys()].filter((name) => !(SEALED_NAME.test(name) || classWritten(name)));
  const unwrittenAttributes = [...selectors.attributes.keys()].filter(
    (name) => !(SEALED_NAME.test(name) || hooks.writes.get(name)?.values.has(ANY) === true || headed(hooks.writeHeads, name)),
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
      writtenNames: hooks.writes.size,
      readNames: hooks.reads.size,
      followed: hooks.followed,
      dependencyFiles: dependency.files,
    },
  };
}
