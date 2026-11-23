// Literal hits of a name across the tracked tree: one `git grep` for as many names as a pattern holds, each hit
// classified by where it sits, and the `pnpm unwired hits` verb that prints them.
//
// The exported API ({@link HIT_KINDS}, {@link HIT_SCOPES}, {@link LiteralHit}, {@link searchLiterals},
// {@link literalStage}, {@link gitGrep}, {@link runHits}) is stable: the reference graph reuses this module, so a shape
// changed here changes the graph's literal evidence too.
//
// Rulings:
// - TS and JS files are read on the graph program (D357): the caller hands in the NativeWorld it opened, the program's
//   own tree serves a file the program holds, and a file outside it is parsed alone through the same process. Every
//   other file is classified by its type. A literal search sees reads the compiler cannot: a JSON scenario, a
//   template, a plugin bundle, a script.
// - A code hit's read, write or call comes from occurrenceRoles in ./graph/roles.ts, so a hit and a graph site never
//   disagree on a role: an object literal key, a JSX attribute and a class member that supplies its value write, a
//   destructuring key reads, a type member's own name declares.
// - A generated file is the house markers' call alone (tooling/src/floor/paths/generated-file.ts).
// - A code hit (a read, write or call) in a file the program holds that the checker resolves to a declaration other
//   than the row's is another member of the same name, so it is no evidence for the row; an unresolved one stays.
// - Only a saving hit in what the product runs or loads can stand for a product read (productRead): product source,
//   the plugin bundles' included; a JSON file a product module imports; each showcase bundle's manifest, which the
//   release build packs into the shipped zip. A hit in a test, the tooling or any other config is evidence to list,
//   never to keep a row by.
import { existsSync, readFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import process from "node:process";
import { PLUGIN_MANIFEST_ENTRY } from "@orb/contracts/plugin";
import { SHOWCASE_PLUGIN_SLUGS } from "@orb/showcase-plugins";
import type {
  ClassDeclaration,
  ClassExpression,
  EnumDeclaration,
  FunctionDeclaration,
  FunctionExpression,
  InterfaceDeclaration,
  ModuleDeclaration,
  Node,
  ParameterDeclaration,
  SourceFile,
  TypeAliasDeclaration,
  TypeParameterDeclaration,
  VariableDeclaration,
} from "@typescript/native/ast";
import {
  getLeadingCommentRanges,
  getTokenAtPosition,
  getTrailingCommentRanges,
  isBindingElement,
  isClassDeclaration,
  isClassExpression,
  isElementAccessExpression,
  isEnumDeclaration,
  isExportDeclaration,
  isExpressionWithTypeArguments,
  isFunctionDeclaration,
  isFunctionExpression,
  isHeritageClause,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isInterfaceDeclaration,
  isJSDocNodeKind,
  isModuleDeclaration,
  isParameterDeclaration,
  isSourceFile,
  isTypeAliasDeclaration,
  isTypeNode,
  isTypeParameterDeclaration,
  isVariableDeclaration,
  SyntaxKind,
  skipTrivia,
} from "@typescript/native/ast";
import { EXIT } from "../floor/cli/exit-contract.ts";
import { UsageError } from "../floor/cli/run-tool.ts";
import { execGit, runGit } from "../floor/git/git.ts";
import { isGeneratedFile } from "../floor/paths/generated-file.ts";
import { looksLikeTestFilename } from "../floor/testing/test-kinds.ts";
import { moduleSpecifiers } from "../floor/typescript/import-graph.ts";
import { showcaseSourceDirectory } from "../plugin-author-showcase/index.ts";
import type { Verdict } from "./field-sort.ts";
import { openGraphWorld } from "./graph/build.ts";
import type { Role } from "./graph/roles.ts";
import { occurrenceRoles, sameNode } from "./graph/roles.ts";
import type { NativeWorld } from "./native.ts";
import { declarationKeys } from "./native.ts";
import { isProduction } from "./optional-population.ts";

const DEAD: Verdict = "dead";
const ASK: Verdict = "ask";

// A short name's word match spans the whole tree.
const GREP_BUFFER = 268_435_456;
// `s`: the text runs to the end of the line, a CRLF file's trailing `\r` and a U+2028 inside it included.
const HIT_LINE = /^([^:]+):(\d+):(.*)$/su;

/** One line `git grep -n` printed. */
export interface GrepLine {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/** `git grep -n` over `paths` at `rev`, or over the working tree's tracked files when `rev` is null. Exit 1 is no match,
 *  an answer; any other failure throws with its arguments and the child's error. */
export function gitGrep(root: string, rev: string | null, args: readonly string[], paths: readonly string[] = []): readonly GrepLine[] {
  const result = runGit(root, ["grep", "-n", ...args, ...(rev === null ? [] : [rev]), "--", ...paths], { maxBuffer: GREP_BUFFER });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`git grep ${args.join(" ")} failed (${result.errorCode ?? `exit ${String(result.status)}`}): ${result.stderr.trim()}`);
  }
  const prefix = rev === null ? 0 : rev.length + 1;
  return result.stdout
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const parsed = HIT_LINE.exec(line.slice(prefix));
      if (parsed === null) {
        throw new Error(`git grep printed a line that is not path:line:text: ${JSON.stringify(line)}`);
      }
      const [, file = "", number = "0", text = ""] = parsed;
      return { file, line: Number(number), text };
    });
}

/** Where a hit sits. `read`, `write`, `call`: a code occurrence by the graph's role rules. `type`: a type position.
 *  `declaration`: a declaration's own name. `import-export`: an import or export declaration, its specifier included.
 *  `string`: a string, regular expression or JSX text. `template`: a template literal's text. `jsdoc`, `comment`: a doc
 *  comment or any other comment. `doc`: Markdown, plain text or a file under docs/. `config-key`, `config-value`: a JSON
 *  or YAML key or value. `generated`: any hit in a generated file. `other`: a file of another type, such as a script or a
 *  stylesheet. */
export const HIT_KINDS = [
  "read",
  "write",
  "call",
  "type",
  "declaration",
  "import-export",
  "string",
  "template",
  "jsdoc",
  "comment",
  "doc",
  "config-key",
  "config-value",
  "generated",
  "other",
] as const;
export type HitKind = (typeof HIT_KINDS)[number];

/** Which side of the tree holds a hit: package source, a test, the tooling and root configuration, or documentation. */
export const HIT_SCOPES = ["product", "test", "tooling", "docs"] as const;
export type HitScope = (typeof HIT_SCOPES)[number];

/** One occurrence of a name. */
interface LiteralHit {
  readonly name: string;
  readonly file: string;
  readonly line: number;
  /** `file:line`. */
  readonly at: string;
  /** The parsed file's UTF-16 offset of the hit, or null in a file the parser does not read. */
  readonly offset: number | null;
  /** The graph program holds the file, so the graph sees this hit; false for a file outside every world. */
  readonly graph: boolean;
  readonly kind: HitKind;
  readonly scope: HitScope;
}

/** What one search over the tracked tree found. */
export interface LiteralSearch {
  /** Tracked files the search covered. */
  readonly files: number;
  /** Ignored paths `git ls-files` leaves out, directories counted once: node_modules, build output, reports. */
  readonly ignored: number;
  /** Each name's hits in `git grep` order, every occurrence on a line classified on its own. */
  readonly hits: ReadonlyMap<string, readonly LiteralHit[]>;
  /** The data files the product loads: each JSON file a product module imports and each showcase bundle's manifest. */
  readonly productData: ReadonlySet<string>;
  /** The declaration keys each resolved code hit in a held file goes to; a hit the checker resolves to nothing is absent. */
  readonly resolved: ReadonlyMap<LiteralHit, readonly string[]>;
}

const PARSED = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const CONFIG_FILES = new Set([".json", ".jsonc", ".json5", ".yaml", ".yml"]);
const DOC_FILES = new Set([".md", ".mdx", ".txt", ".rst"]);
const DOCS_TREE = "docs/";
const PACKAGES_TREE = "packages/";
const TESTS_TREE = "tests/";
const NESTED_TESTS = "/__tests__/";

const FILE_TYPES = ["parsed", "config", "doc", "other"] as const;
type FileType = (typeof FILE_TYPES)[number];

function fileType(file: string): FileType {
  const extension = extname(file);
  if (PARSED.has(extension)) {
    return "parsed";
  }
  if (CONFIG_FILES.has(extension)) {
    return "config";
  }
  return DOC_FILES.has(extension) || file.startsWith(DOCS_TREE) ? "doc" : "other";
}

function scopeOf(file: string, type: FileType): HitScope {
  if (type === "doc") {
    return "docs";
  }
  if (file.startsWith(TESTS_TREE) || file.includes(NESTED_TESTS) || looksLikeTestFilename(basename(file))) {
    return "test";
  }
  return file.startsWith(PACKAGES_TREE) ? "product" : "tooling";
}

const isGenerated = (root: string, file: string): boolean => isGeneratedFile(file, () => readFileSync(join(root, file), "utf8"));

const escaped = (name: string): string => name.replaceAll(/\$/gu, String.raw`\$`);
// ASCII, spelled out: git's PCRE reads a Greek or accented letter as a word character, JavaScript's `\w` does not.
const WORD_CHAR = "[A-Za-z0-9_$]";
/** A name the search takes: one word of {@link WORD_CHAR}, since the match boundaries assume one. */
const NAME = /^[A-Za-z0-9_$]+$/u;
// One pattern for both passes: git grep finds the lines and the JavaScript pass finds each hit on them, so the two
// agree on every boundary. `git grep -w -F` with many names rescans each candidate and is far slower than one PCRE
// alternation on a large tree.
const wordPattern = (names: readonly string[]): string => `(?<!${WORD_CHAR})(?:${names.map(escaped).join("|")})(?!${WORD_CHAR})`;
const wordsOf = (names: readonly string[]): RegExp => new RegExp(wordPattern(names), "gu");

// PCRE2 refuses a pattern whose compiled form passes 64 KiB, and git grep then exits with an error. A name compiles to
// two bytes for each byte of its text and three for its branch. The bound leaves half the limit spare.
const PATTERN_BUDGET = 32_768;
const BYTE_COST = 2;
const BRANCH_COST = 3;

// The names in runs that each fit one pattern, in their given order.
function patternParts(names: readonly string[]): readonly (readonly string[])[] {
  const parts: string[][] = [];
  let room = 0;
  for (const name of names) {
    const cost = BYTE_COST * Buffer.byteLength(name) + BRANCH_COST;
    const part = parts.at(-1);
    if (part === undefined || cost > room) {
      parts.push([name]);
      room = PATTERN_BUDGET - cost;
    } else {
      part.push(name);
      room -= cost;
    }
  }
  return parts;
}

// Files parsed per API batch: one round trip for the page, and the page's trees released before the next.
const PARSE_PAGE = 256;

const TEMPLATE_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateHead,
  SyntaxKind.TemplateMiddle,
  SyntaxKind.TemplateTail,
]);
const STRING_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.StringLiteral,
  SyntaxKind.RegularExpressionLiteral,
  SyntaxKind.JsxText,
  SyntaxKind.JsxTextAllWhiteSpaces,
]);
type PlainDeclaration =
  | VariableDeclaration
  | FunctionDeclaration
  | FunctionExpression
  | ClassDeclaration
  | ClassExpression
  | InterfaceDeclaration
  | TypeAliasDeclaration
  | EnumDeclaration
  | ModuleDeclaration
  | ParameterDeclaration
  | TypeParameterDeclaration;

// Declarations whose own name the graph's role rules judge: a key, a destructuring element, a member, a JSX attribute.
const ROLE_RULED: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.PropertyAssignment,
  SyntaxKind.ShorthandPropertyAssignment,
  SyntaxKind.BindingElement,
  SyntaxKind.PropertyDeclaration,
  SyntaxKind.PropertySignature,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.MethodSignature,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
  SyntaxKind.EnumMember,
  SyntaxKind.JsxAttribute,
]);

function ancestors(node: Node): Node[] {
  const chain: Node[] = [];
  for (let up: Node = node; !isSourceFile(up); up = up.parent) {
    chain.push(up);
  }
  return chain;
}

// One kind for the roles of a code occurrence: a call outranks a store, a store outranks a read, and a key names a type's
// member. No role is a name the occurrence only declares.
function roleKind(roles: readonly Role[]): HitKind {
  if (roles.length === 0) {
    return "declaration";
  }
  if (roles.includes("call")) {
    return "call";
  }
  if (roles.includes("write")) {
    return "write";
  }
  return roles.includes("key") ? "type" : "read";
}

// A token naming a declaration, or the key of an element access: the role rules where they judge it, else a declaration.
function namedKind(token: Node): HitKind | null {
  const { parent } = token;
  if (isElementAccessExpression(parent) && sameNode(parent.argumentExpression, token)) {
    return roleKind(occurrenceRoles(token));
  }
  // `{ a: b } = o`: `b` names a new local; the role rules read `a`.
  if (isBindingElement(parent) && parent.propertyName !== undefined && sameNode(parent.name, token)) {
    return "declaration";
  }
  // The role rules judge any occurrence under these, their own name or not: `{ a: zq }` reads `zq`.
  if (ROLE_RULED.has(parent.kind)) {
    return roleKind(occurrenceRoles(token));
  }
  return isPlainDeclaration(parent) && sameNode(parent.name, token) ? "declaration" : null;
}

// A declaration of a local, a parameter or a named type, whose own name the role rules leave to the declaration.
const isPlainDeclaration = (node: Node): node is PlainDeclaration =>
  isVariableDeclaration(node) ||
  isFunctionDeclaration(node) ||
  isFunctionExpression(node) ||
  isClassDeclaration(node) ||
  isClassExpression(node) ||
  isInterfaceDeclaration(node) ||
  isTypeAliasDeclaration(node) ||
  isEnumDeclaration(node) ||
  isModuleDeclaration(node) ||
  isParameterDeclaration(node) ||
  isTypeParameterDeclaration(node);

// A class's `extends` names a value; every other heritage clause and type node is a type position.
const isClassExtends = (node: Node): boolean =>
  isExpressionWithTypeArguments(node) &&
  isHeritageClause(node.parent) &&
  node.parent.token === SyntaxKind.ExtendsKeyword &&
  (isClassDeclaration(node.parent.parent) || isClassExpression(node.parent.parent));

function inType(chain: readonly Node[]): boolean {
  for (const node of chain) {
    if (isClassExtends(node)) {
      return false;
    }
    if (isTypeNode(node) || isHeritageClause(node)) {
      return true;
    }
  }
  return false;
}

// The comment holding `position`, among the trivia before `token`: the previous token's trailing comments and the
// token's leading ones both start at its full start. Trivia that is no comment is a shebang.
function commentKind(text: string, token: Node, position: number): HitKind {
  const ranges = [...(getTrailingCommentRanges(text, token.pos) ?? []), ...(getLeadingCommentRanges(text, token.pos) ?? [])];
  const range = ranges.find((candidate) => position >= candidate.pos && position < candidate.end);
  return range !== undefined && text.startsWith("/**", range.pos) ? "jsdoc" : "comment";
}

function parsedKind(source: SourceFile, position: number): HitKind {
  const token = getTokenAtPosition(source, position);
  const chain = ancestors(token);
  if (chain.some((node) => isJSDocNodeKind(node.kind))) {
    return "jsdoc";
  }
  if (position < skipTrivia(source.text, token.pos)) {
    return commentKind(source.text, token, position);
  }
  if (chain.some((node) => isImportDeclaration(node) || isImportEqualsDeclaration(node) || isExportDeclaration(node))) {
    return "import-export";
  }
  const named = namedKind(token);
  if (named !== null) {
    return named;
  }
  if (inType(chain)) {
    return "type";
  }
  if (TEMPLATE_KINDS.has(token.kind)) {
    return "template";
  }
  return STRING_KINDS.has(token.kind) ? "string" : roleKind(occurrenceRoles(token));
}

// A JSON or YAML key is the word followed by its colon, quoted or not.
const configKind = (text: string, index: number, name: string): HitKind =>
  /^["']?\s*:/u.test(text.slice(index + name.length)) ? "config-key" : "config-value";

// One name's occurrence on a grepped line, before its kind is known.
interface Found {
  readonly name: string;
  readonly line: GrepLine;
  readonly index: number;
}

/** Search the working tree's tracked files for each name as a whole word, or null for a root with no git index. Parsed
 *  files are read on `world`, the graph program the caller owns. */
export function searchLiterals(root: string, world: NativeWorld, names: readonly string[]): LiteralSearch | null {
  if (!existsSync(join(root, ".git"))) {
    return null;
  }
  const wanted = [...new Set(names)].filter((name) => name !== "");
  const files = execGit(root, ["ls-files", "-z"]).split("\0").filter(Boolean).length;
  const ignored = execGit(root, ["ls-files", "-z", "--others", "--ignored", "--exclude-standard", "--directory"]).split("\0").filter(Boolean).length;
  const byFile = grepNames(root, wanted);
  const { classified, alone } = classifyHeld(root, world, byFile);
  for (let at = 0; at < alone.length; at += PARSE_PAGE) {
    parsePage(world, alone.slice(at, at + PARSE_PAGE), (file, source) => {
      classified.set(file, parsedHits(source, file, byFile.get(file) ?? [], false));
    });
  }
  const hits = new Map<string, LiteralHit[]>(wanted.map((name) => [name, []]));
  for (const file of byFile.keys()) {
    for (const hit of classified.get(file) ?? []) {
      hits.get(hit.name)?.push(hit);
    }
  }
  const all = [...hits.values()].flat();
  return { files, ignored, hits, productData: loadedData(root, world, all), resolved: resolvedHits(world, all) };
}

// The data files among the hits' files that the product loads: a JSON file the program holds that a product module
// imports (its import resolved by the program, so a JSON a test or a script imports stays out), and every showcase
// bundle's manifest under the source directory the release build packs from.
function loadedData(root: string, world: NativeWorld, hits: readonly LiteralHit[]): ReadonlySet<string> {
  const manifests = SHOWCASE_PLUGIN_SLUGS.map((slug) => relative(root, join(showcaseSourceDirectory(root), slug, PLUGIN_MANIFEST_ENTRY)));
  const held = new Set(hits.flatMap(({ file }) => (fileType(file) === "config" && world.has(file) ? [file] : [])));
  if (held.size === 0) {
    return new Set(manifests);
  }
  const specifiers = world.files
    .filter((source) => isProduction(world.fileOfSource(source)))
    .flatMap((source) => moduleSpecifiers(source).map((specifier) => ({ specifier, from: source.fileName })));
  const resolved = world.batch(specifiers.map(({ specifier, from }) => world.program.getResolvedModuleFromModuleSpecifier.gen(specifier, from)));
  const imported = resolved.flatMap((module) => (module?.resolvedFileName === undefined ? [] : [relative(root, module.resolvedFileName)]));
  return new Set([...manifests, ...imported.filter((file) => held.has(file))]);
}

const CODE_KINDS: ReadonlySet<HitKind> = new Set<HitKind>(["read", "write", "call"]);

// The node a held file's hit or known site starts, by its `file:offset`.
function heldNodeAt(world: NativeWorld, file: string, offset: number): Node | undefined {
  const source = world.source(file);
  return source === undefined ? undefined : getTokenAtPosition(source, offset);
}

// What each code hit in a held file resolves to, in one batched lookup.
function resolvedHits(world: NativeWorld, hits: readonly LiteralHit[]): ReadonlyMap<LiteralHit, readonly string[]> {
  const asked = hits.flatMap((hit) => {
    const node = hit.graph && hit.offset !== null && CODE_KINDS.has(hit.kind) ? heldNodeAt(world, hit.file, hit.offset) : undefined;
    return node === undefined ? [] : [{ hit, node }];
  });
  const symbols = world.symbolsAt(asked.map(({ node }) => node));
  return new Map(
    asked.flatMap(({ hit }, at) => {
      const symbol = symbols[at];
      return symbol === undefined ? [] : [[hit, declarationKeys(symbol)] as const];
    }),
  );
}

// The declaration keys each row's known sites resolve to in the held files: the row's own member, however many
// declarations it merges. An empty set (no known site the program holds resolves) drops no hit.
function rowDeclarations(world: NativeWorld, rows: readonly { readonly known: readonly string[] }[]): readonly ReadonlySet<string>[] {
  const asked = rows.flatMap((row, at) =>
    row.known.flatMap((key) => {
      const split = key.lastIndexOf(":");
      const node = heldNodeAt(world, key.slice(0, split), Number(key.slice(split + 1)));
      return node === undefined ? [] : [{ at, node }];
    }),
  );
  const symbols = world.symbolsAt(asked.map(({ node }) => node));
  const keys = rows.map(() => new Set<string>());
  for (const [index, { at }] of asked.entries()) {
    const symbol = symbols[index];
    for (const key of symbol === undefined ? [] : declarationKeys(symbol)) {
      keys[at]?.add(key);
    }
  }
  return keys;
}

// Every file's hits but those of the parsed files the program does not hold, which come back to be parsed alone.
function classifyHeld(
  root: string,
  world: NativeWorld,
  byFile: ReadonlyMap<string, readonly Found[]>,
): { readonly classified: Map<string, readonly LiteralHit[]>; readonly alone: readonly string[] } {
  const classified = new Map<string, readonly LiteralHit[]>();
  const alone: string[] = [];
  for (const [file, found] of byFile) {
    const type = fileType(file);
    const generated = isGenerated(root, file);
    const held = type === "parsed" && !generated ? world.source(file) : undefined;
    if (held !== undefined) {
      classified.set(file, parsedHits(held, file, found, true));
    } else if (type === "parsed" && !generated) {
      alone.push(file);
    } else {
      classified.set(file, unparsedHits(file, type, generated, found));
    }
  }
  return { classified, alone };
}

// Each part's lines are read for that part's names alone, so a line two parts find gives each name's hit once.
function grepNames(root: string, names: readonly string[]): ReadonlyMap<string, readonly Found[]> {
  const byFile = new Map<string, Found[]>();
  for (const part of patternParts(names)) {
    const words = wordsOf(part);
    for (const line of gitGrep(root, null, ["-I", "-P", "-e", wordPattern(part)])) {
      const found = byFile.get(line.file) ?? [];
      byFile.set(line.file, found);
      found.push(...[...line.text.matchAll(words)].map((match) => ({ name: match[0], line, index: match.index })));
    }
  }
  return byFile;
}

// One batch of files the program does not hold, each parsed alone and released once `read` has classified it.
function parsePage(world: NativeWorld, page: readonly string[], read: (file: string, source: SourceFile) => void): void {
  const retained = world.parseAlone(page);
  try {
    page.forEach((file, index) => {
      const source = retained[index]?.sourceFile;
      if (source === undefined) {
        throw new Error(`literal hits: the API returned no tree for ${file}`);
      }
      read(file, source);
    });
  } finally {
    for (const lease of retained) {
      lease.dispose();
    }
  }
}

function unparsedKind(type: FileType, generated: boolean, { name, line, index }: Found): HitKind {
  if (generated) {
    return "generated";
  }
  if (type === "config") {
    return configKind(line.text, index, name);
  }
  return type === "doc" ? "doc" : "other";
}

function unparsedHits(file: string, type: FileType, generated: boolean, found: readonly Found[]): readonly LiteralHit[] {
  const scope = scopeOf(file, type);
  return found.map((hit) => ({
    name: hit.name,
    file,
    line: hit.line.line,
    at: `${file}:${String(hit.line.line)}`,
    offset: null,
    graph: false,
    scope,
    kind: unparsedKind(type, generated, hit),
  }));
}

function parsedHits(source: SourceFile, file: string, found: readonly Found[], graph: boolean): readonly LiteralHit[] {
  const scope = scopeOf(file, "parsed");
  return found.map(({ name, line, index }) => {
    const offset = source.getPositionOfLineAndCharacter(line.line - 1, 0) + index;
    return { name, file, line: line.line, at: `${file}:${String(line.line)}`, offset, graph, scope, kind: parsedKind(source, offset) };
  });
}

// Whether a hit can be a real read: a code occurrence other than a declaration, a string or template, a data key, a
// generated file, a file of another type, or a type read in a test. A declaration, a comment, a doc or a data value only
// names the word.
const SAVING: ReadonlySet<HitKind> = new Set<HitKind>(["read", "write", "call", "import-export", "string", "template", "config-key", "generated", "other"]);
const savesRow = (hit: LiteralHit): boolean => SAVING.has(hit.kind) || (hit.kind === "type" && hit.scope === "test");

const offsetKey = (hit: LiteralHit): string | null => (hit.offset === null ? null : `${hit.file}:${String(hit.offset)}`);

// A common name hits thousands of lines; the row keeps every count and this many hits, the saving ones first.
const KEPT_HITS = 25;

/** One row's literal evidence. A dead row's hits that save nothing are stale mentions its deletion removes or repoints. */
export interface LiteralEvidence {
  /** `0 literal hits over N files` for a row with none; a never-written row with no saving hit adds `no writer`. */
  readonly note: string | null;
  /** Some hit can be a real read, so the row moved from dead to ask. */
  readonly saved: boolean;
  readonly counts: Readonly<Partial<Record<HitKind, number>>>;
  readonly hits: readonly { readonly at: string; readonly kind: HitKind; readonly scope: HitScope }[];
  /** For a never-written row, up to {@link KEPT_HITS} hits that write a key of its name: the writers a person checks. */
  readonly writers: readonly string[];
  /** Hits at the row's own known sites, left out: its declarations and the sites the scan already recorded. */
  readonly own: number;
  /** Code hits left out because the checker resolves them to another declaration of the same name. */
  readonly elsewhere: number;
  /** Some saving hit sits in product source, so it can stand for a product read; any other hit only annotates. */
  readonly productRead: boolean;
}

/** What the stage did over one run. */
export interface LiteralStage {
  readonly files: number;
  readonly ignored: number;
  /** A wired field's name through the same search: zero hits fails the run, since the search would be broken. */
  readonly control: { readonly key: string; readonly hits: number };
  readonly deadBefore: number;
  readonly deadAfter: number;
  /** Rows moved to ask, counted under each saving kind they hit. */
  readonly movedBy: Readonly<Partial<Record<HitKind, number>>>;
  /** Rows that stay dead with stale mentions to clean up. */
  readonly staleOnly: number;
  /** Hits left out across every searched row because they sit at the row's own known sites. */
  readonly ownHits: number;
  /** Never-written rows the stage searched, by where they ended. */
  readonly neverWritten: { readonly ask: number; readonly dead: number };
}

interface StageRow {
  readonly member: string;
  readonly verdict: Verdict;
  /** `file:offset` of the row's declarations and of every site the scan recorded for it, which are no new evidence. */
  readonly known: readonly string[];
  /** The question is a writer rather than a reader. */
  readonly neverWritten: boolean;
}

// One row's hits outside its known sites, and how many sat at them.
function searched(
  search: LiteralSearch,
  member: string,
  { known, declarations }: { readonly known: ReadonlySet<string>; readonly declarations: ReadonlySet<string> },
): { readonly hits: readonly LiteralHit[]; readonly own: number; readonly elsewhere: number } {
  const all = search.hits.get(member) ?? [];
  const outside = all.filter((hit) => {
    const key = offsetKey(hit);
    return key === null || !known.has(key);
  });
  const hits = outside.filter((hit) => {
    const goes = search.resolved.get(hit);
    return goes === undefined || declarations.size === 0 || goes.some((key) => declarations.has(key));
  });
  return { hits, own: all.length - outside.length, elsewhere: outside.length - hits.length };
}

// Each row's hits outside its known sites and off other declarations of its name, and the evidence they make.
function judged(
  search: LiteralSearch,
  world: NativeWorld,
  rows: readonly Omit<StageRow, "verdict">[],
): readonly { readonly hits: readonly LiteralHit[]; readonly literal: LiteralEvidence }[] {
  const declarations = rowDeclarations(world, rows);
  return rows.map((row, at) => {
    const { hits, own, elsewhere } = searched(search, row.member, { known: new Set(row.known), declarations: declarations[at] ?? new Set() });
    return { hits, literal: evidenceOf(row, hits, { own, elsewhere, productData: search.productData }, search.files) };
  });
}

/** Each row's evidence from a search that covered its member name: its hits outside its own known sites and off any
 *  other declaration of the name, the ones that can be a real read first, and whether any can, in the product or at
 *  all. The fields literal stage and the delete trial judge a row by it; `world` is the program the search read. */
export const rowsEvidence = (search: LiteralSearch, world: NativeWorld, rows: readonly Omit<StageRow, "verdict">[]): readonly LiteralEvidence[] =>
  judged(search, world, rows).map(({ literal }) => literal);

function evidenceOf(
  row: Omit<StageRow, "verdict">,
  hits: readonly LiteralHit[],
  { own, elsewhere, productData }: { readonly own: number; readonly elsewhere: number; readonly productData: ReadonlySet<string> },
  files: number,
): LiteralEvidence {
  const saving = hits.filter(savesRow);
  const empty = hits.length === 0 ? `0 literal hits over ${String(files)} files` : null;
  const unwritten = row.neverWritten && saving.length === 0 ? `no writer and 0 saving literal hits over ${String(files)} files` : null;
  return {
    note: unwritten ?? empty,
    saved: saving.length > 0,
    counts: countKinds(hits),
    hits: [...saving, ...hits.filter((hit) => !savesRow(hit))].slice(0, KEPT_HITS).map(({ at, kind, scope }) => ({ at, kind, scope })),
    writers: row.neverWritten
      ? hits
          .filter((hit) => hit.kind === "write")
          .slice(0, KEPT_HITS)
          .map((hit) => hit.at)
      : [],
    own,
    elsewhere,
    productRead: saving.some((hit) => isProduction(hit.file) || productData.has(hit.file)),
  };
}

function countKinds(hits: readonly LiteralHit[]): Partial<Record<HitKind, number>> {
  const counts: Partial<Record<HitKind, number>> = {};
  for (const { kind } of hits) {
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

/** Search every dead row's member name over the tracked tree and move a row with a hit that can be a read to ask. A
 *  row's own known sites are no hit: the stage looks for what the scan missed. Null stage for a root with no git index,
 *  which leaves every row as it was. */
export function literalStage<Row extends StageRow>(
  root: string,
  world: NativeWorld,
  rows: readonly Row[],
  control: { readonly key: string; readonly member: string; readonly known: readonly string[] },
): { readonly rows: readonly (Row & { readonly literal: LiteralEvidence | null })[]; readonly stage: LiteralStage | null } {
  const dead = rows.filter((row) => row.verdict === DEAD);
  const search = searchLiterals(root, world, [control.member, ...dead.map((row) => row.member)]);
  if (search === null) {
    return { rows: rows.map((row) => ({ ...row, literal: null })), stage: null };
  }
  const controlHits = searched(search, control.member, { known: new Set(control.known), declarations: new Set() }).hits.filter(savesRow).length;
  if (controlHits === 0) {
    throw new Error(`literal stage: the wired control ${control.key} has no hit outside its declaration, so the search is broken`);
  }
  const movedBy: Partial<Record<HitKind, number>> = {};
  let staleOnly = 0;
  let ownHits = 0;
  const verdicts = new Map(dead.map((row, at) => [row, at]));
  const judgedDead = judged(search, world, dead);
  const staged = rows.map((row) => {
    const at = verdicts.get(row);
    const found = at === undefined ? undefined : judgedDead[at];
    if (found === undefined) {
      return { ...row, literal: null };
    }
    const { hits, literal } = found;
    ownHits += literal.own;
    for (const kind of new Set(hits.filter(savesRow).map((hit) => hit.kind))) {
      movedBy[kind] = (movedBy[kind] ?? 0) + 1;
    }
    if (!literal.saved && hits.length > 0) {
      staleOnly++;
    }
    return { ...row, verdict: literal.saved ? ASK : row.verdict, literal };
  });
  const unwritten = staged.filter((row) => row.neverWritten && row.literal !== null);
  return {
    rows: staged,
    stage: {
      files: search.files,
      ignored: search.ignored,
      control: { key: control.key, hits: controlHits },
      deadBefore: dead.length,
      deadAfter: staged.filter((row) => row.verdict === DEAD).length,
      movedBy,
      staleOnly,
      ownHits,
      neverWritten: { ask: unwritten.filter((row) => row.verdict === ASK).length, dead: unwritten.filter((row) => row.verdict === DEAD).length },
    },
  };
}

const JSON_FLAG = "--json";
const ROOT_FLAG = /^--root=(.+)$/u;
/** The `hits` verb's usage line, which run.ts prints with the others. */
export const HITS_USAGE = "pnpm unwired hits <name...> [--root=<dir>] [--json]";

type KindCounts = Readonly<Record<HitKind, number>>;

/** One name's hits with its totals per kind, over the whole tree and per scope. */
interface NameHits {
  readonly name: string;
  readonly total: number;
  readonly kinds: KindCounts;
  readonly scopes: Readonly<Record<HitScope, KindCounts>>;
  readonly hits: readonly LiteralHit[];
}

/** What `pnpm unwired hits` reports. */
export interface HitsReport {
  /** Tracked files the search covered. */
  readonly scanned: number;
  readonly ignored: number;
  readonly names: readonly NameHits[];
}

function kindCounts(hits: readonly LiteralHit[]): KindCounts {
  const count = (kind: HitKind): number => hits.filter((hit) => hit.kind === kind).length;
  return {
    read: count("read"),
    write: count("write"),
    call: count("call"),
    type: count("type"),
    declaration: count("declaration"),
    "import-export": count("import-export"),
    string: count("string"),
    template: count("template"),
    jsdoc: count("jsdoc"),
    comment: count("comment"),
    doc: count("doc"),
    "config-key": count("config-key"),
    "config-value": count("config-value"),
    generated: count("generated"),
    other: count("other"),
  };
}

function scopeCounts(hits: readonly LiteralHit[]): Readonly<Record<HitScope, KindCounts>> {
  const of = (scope: HitScope): KindCounts => kindCounts(hits.filter((hit) => hit.scope === scope));
  return { product: of("product"), test: of("test"), tooling: of("tooling"), docs: of("docs") };
}

/** The hits report for `names` over `root`'s tracked tree, or null for a root with no git index. */
export function hitsReport(root: string, world: NativeWorld, names: readonly string[]): HitsReport | null {
  const search = searchLiterals(root, world, names);
  if (search === null) {
    return null;
  }
  return {
    scanned: search.files,
    ignored: search.ignored,
    names: [...search.hits].map(([name, hits]) => ({
      name,
      total: hits.length,
      kinds: kindCounts(hits),
      scopes: scopeCounts(hits),
      hits,
    })),
  };
}

const nonZero = (counts: KindCounts): string =>
  HIT_KINDS.filter((kind) => counts[kind] > 0)
    .map((kind) => `${kind}=${String(counts[kind])}`)
    .join(" ");

function parseHits(argv: readonly string[]): { readonly names: readonly string[]; readonly root: string; readonly json: boolean } {
  const names: string[] = [];
  let root = process.cwd();
  let json = false;
  for (const arg of argv) {
    const rooted = ROOT_FLAG.exec(arg)?.[1];
    if (arg === JSON_FLAG) {
      json = true;
    } else if (rooted !== undefined) {
      root = rooted;
    } else if (NAME.test(arg)) {
      names.push(arg);
    } else {
      throw new UsageError(`${arg}: not a name (one word of letters, digits, _ and $) or a flag\nusage: ${HITS_USAGE}`);
    }
  }
  if (names.length === 0) {
    throw new UsageError(`hits needs at least one name\nusage: ${HITS_USAGE}`);
  }
  return { names, root: resolve(root), json };
}

/** `pnpm unwired hits`: every hit of each name, one per line as kind, scope, `file:line` and name, then each name's totals
 *  per kind and per scope and the scanned-file count; `--json` writes the {@link HitsReport} instead. */
export function runHits(argv: readonly string[], log: (line: string) => void): number {
  const { names, root, json } = parseHits(argv);
  using world = openGraphWorld(root);
  const report = hitsReport(root, world, names);
  if (report === null) {
    throw new UsageError(`${root}: no git index, so there is no tracked tree to search`);
  }
  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 1)}\n`);
    return EXIT.clean;
  }
  for (const { hits } of report.names) {
    for (const hit of hits) {
      process.stdout.write(`${hit.kind}\t${hit.scope}\t${hit.at}\t${hit.name}\n`);
    }
  }
  for (const { name, total, kinds, scopes } of report.names) {
    process.stdout.write(`${name}: total=${String(total)} ${nonZero(kinds)}\n`);
    for (const scope of HIT_SCOPES) {
      const line = nonZero(scopes[scope]);
      if (line !== "") {
        process.stdout.write(`  ${scope}: ${line}\n`);
      }
    }
  }
  log(`scanned=${String(report.scanned)} tracked files ignored=${String(report.ignored)} names=${String(names.length)}`);
  return EXIT.clean;
}
