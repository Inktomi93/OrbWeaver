// The accessible-name census: every name or visible-text target a CT or e2e spec writes by hand, classified by
// where production keeps that text (Spine-Testing §9, labels come from their production home).
//
// A site is a string, template, regex, concatenation or `new RegExp` passed as the text argument of a text locator
// or assertion, as the `name`, `hasText` or `hasNotText` of a locator's options, as a `selectOption` label, or as the
// value a name attribute is asserted to hold. A conditional or a `??` in that position is read arm by arm, so
// `isMobile ? { name: "You" } : { name: "Me" }` is two sites. A constant the spec declares, a member of a local object
// or list, a `for…of` variable over a local list and a constant imported from a test file, by a relative path or
// through an `@orb/testkit` entry and its `export *` and `export { … } from` re-exports, are followed to their
// literal, and the site is counted once, where the literal is written. A call and a name imported from a production
// package or a `#<package>/*` path are bindings and not sites. A helper the spec declares or imports from a test file,
// whose plain parameter reaches a name position, makes each literal passed for it a site at the call; a destructured
// parameter, a method on an object and a callback a helper receives are not followed.
//
// A text a story the spec mounts authors is that story's. A text several production files hold is filed under the one
// in the spec's own feature, then one in a feature the spec imports from, then the first in path order.
//
// The class is a judgement on text alone, so `exported` means "a production .ts module exports this exact string and
// no other production file spells it", not "the component under test renders that export". A rewrite still reads
// the component before it trusts the class.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import ts from "typescript";
import { z } from "zod";
import { execNicedSync } from "../floor/process/proc.ts";

/** The text-target calls whose first argument is a name or visible text. */
const TEXT_CALLS = new Set([
  "getByText",
  "getByLabel",
  "getByPlaceholder",
  "getByTitle",
  "getByAltText",
  "toHaveText",
  "toContainText",
  "toHaveAccessibleName",
  "toHaveAccessibleDescription",
]);
const LOCATOR_OPTION_KEYS: ReadonlySet<string> = new Set(["name", "hasText", "hasNotText"]);
/** The calls whose options object carries a name or text filter, and the keys that hold it. */
const OPTION_CALLS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ...["getByRole", "filter", "locator", "getByLabel", "getByText", "getByTestId"].map((call) => [call, LOCATOR_OPTION_KEYS] as const),
  ["selectOption", new Set(["label"])],
]);
/** The attributes whose asserted value is a name or visible text: `toHaveAttribute(<attribute>, <text>)`. */
const NAME_ATTRIBUTES = new Set(["aria-label", "aria-description", "title", "placeholder", "alt"]);

/** The trees the census reads, and the production roots it classifies against. */
export const CENSUS_TEST_ROOTS = ["tests/client", "tests/e2e", "tests/ui"] as const;
// Plain git pathspecs: `*` crosses directories, so one pattern also takes a file directly under the root.
const PRODUCTION_GLOBS = ["packages/*/src/*.ts", "packages/*/src/*.tsx"] as const;
const GUEST_ROOT = "packages/showcase-plugins/";
// Guest bundles build their markup as one string, so the text between tags is read from the source text.
const GUEST_GLOBS = ["packages/showcase-plugins/bundles/*.ts"] as const;
const MARKUP_TEXT = />([^<>{}$]+)</gu;
// Test files whose strings are the test's own content: stories, fixtures, the corpus and shared support.
const AUTHORED_FILE = /^tests\/support\/|\/_[^/]*stories|stories\.|fixture|corpus|_surface-scenarios/u;
// The testkit package, whose export map turns an `@orb/testkit/*` specifier into a test file.
const TESTKIT_ROOT = "tests/support";
// An import specifier that names a client feature's module, `#client/features/chat/lib/x.ts` or a relative path into it.
const IMPORTED_FEATURE = /from\s+"[^"]*features\/([^/"]+)\/[^"]*"/gu;
// A relative import of a stories module that sits beside the spec.
const STORIES_IMPORT = /from\s+"(\.{1,2}\/[^"]*stories[^"]*\.tsx)"/gu;
// A story named by its mount path, `tests/client/.../_row-stories/RowStory`: the module is the path before the story.
const STORY_PATH = /["'`](tests\/[^"'`]*stories)\/[A-Za-z]+["'`]/gu;
// A fragment shorter than this matches too much prose to name a home by substring.
const MIN_SUBSTRING_PIECE = 6;
// The tracked-file list of the whole tree outgrows execFileSync's default buffer.
const GIT_LIST_MAX_BUFFER = 67_108_864;

/**
 * What a site's text is, by where production keeps it.
 * `exported`: one or more production `.ts` modules export it and no other production file spells it.
 * `exported-also-inline`: exported, and also spelled inline elsewhere in production; the inline spelling moves onto the export.
 * `export-out-of-reach`: a `tests/ui` site whose only export is outside `@orb/ui`, which that tree cannot import.
 * `inline`, `inline-template`: production spells it, or the template's words, with no export.
 * `inline-also-authored`: production spells it and a story or fixture authors it too.
 * `authored`: only a story, fixture or corpus file spells it.
 * `guest`: only guest plugin markup spells it.
 * `unresolved`: no production or test file spells it.
 * `unresolved-template`: no production file spells every fixed word, or its only words are short ones several files spell.
 * `no-words`: a computed name with no fixed word in it.
 * `non-word`: a literal with fewer than two letters in a row, such as a count.
 */
export const CENSUS_CLASSES = [
  "exported",
  "exported-also-inline",
  "export-out-of-reach",
  "inline",
  "inline-template",
  "inline-also-authored",
  "authored",
  "guest",
  "unresolved",
  "unresolved-template",
  "no-words",
  "non-word",
] as const;
export type CensusClass = (typeof CENSUS_CLASSES)[number];

export interface CensusSource {
  readonly path: string;
  readonly text: string;
}

export interface NameSite {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  /** The site's source text, quotes included. */
  readonly text: string;
}

export interface CensusRow extends NameSite {
  readonly class: CensusClass;
  /** The production feature that owns the text, or the test directory when production does not. */
  readonly feature: string;
  /** The production files that export or spell it, sorted. */
  readonly homes: readonly string[];
}

const parse = ({ path, text }: CensusSource): ts.SourceFile =>
  ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

function calleeName(call: ts.CallExpression): string | undefined {
  const callee = call.expression;
  if (ts.isPropertyAccessExpression(callee)) {
    return callee.name.text;
  }
  return ts.isIdentifier(callee) ? callee.text : undefined;
}

function isNameExpression(node: ts.Expression): boolean {
  if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node) || ts.isRegularExpressionLiteral(node)) {
    return true;
  }
  if (ts.isNewExpression(node)) {
    return ts.isIdentifier(node.expression) && node.expression.text === "RegExp";
  }
  return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken && (isNameExpression(node.left) || isNameExpression(node.right));
}

// The values an argument can take where it meets the locator: each arm of a conditional or a fallback.
function arms(node: ts.Expression): ts.Expression[] {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
    return arms(node.expression);
  }
  if (ts.isConditionalExpression(node)) {
    return [...arms(node.whenTrue), ...arms(node.whenFalse)];
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    return [...arms(node.left), ...arms(node.right)];
  }
  return [node];
}

// The name and text filters of an options argument, each arm of a conditional options object included.
function optionValues(argument: ts.Expression, keys: ReadonlySet<string>): ts.Expression[] {
  return arms(argument)
    .filter((options) => ts.isObjectLiteralExpression(options))
    .flatMap((options) => options.properties.filter((property) => ts.isPropertyAssignment(property)))
    .filter((property) => ts.isIdentifier(property.name) && keys.has(property.name.text))
    .map((property) => property.initializer);
}

// The asserted value of `toHaveAttribute(<name attribute>, <text>)`.
function attributeValue(name: string, call: ts.CallExpression): ts.Expression[] {
  const [attribute, value] = call.arguments;
  return name === "toHaveAttribute" &&
    attribute !== undefined &&
    ts.isStringLiteralLike(attribute) &&
    NAME_ATTRIBUTES.has(attribute.text) &&
    value !== undefined
    ? [value]
    : [];
}

// The expressions of one call that hold a name, before they are split into arms.
function nameArguments(call: ts.CallExpression): ts.Expression[] {
  const name = calleeName(call);
  if (name === undefined) {
    return [];
  }
  const text = TEXT_CALLS.has(name) ? call.arguments.slice(0, 1) : [];
  const keys = OPTION_CALLS.get(name);
  const options = keys === undefined ? [] : call.arguments.flatMap((argument) => optionValues(argument, keys));
  return [...text, ...options, ...attributeValue(name, call)];
}

/** Reads a test file a spec imports; `undefined` when it is not a tracked test file. */
export type TestFileReader = (path: string) => CensusSource | undefined;

/** A bare specifier that names a test file, such as `@orb/testkit/ct`, and the path it resolves to. */
export type TestAliases = ReadonlyMap<string, string>;

// One parsed test file and its declarations: the value each const declares, and the `for…of` lists a loop variable walks.
interface ParsedTest {
  readonly source: CensusSource;
  readonly file: ts.SourceFile;
  /** name → its one declaration; a name declared twice in the file is shadowed somewhere and stays unresolved. */
  readonly declared: ReadonlyMap<string, ts.VariableDeclaration | null>;
  /** local or re-exported name → the test module and the name it exports. */
  readonly imported: ReadonlyMap<string, { readonly from: string; readonly name: string }>;
  /** The test modules an `export *` passes on. */
  readonly starFrom: readonly string[];
  /** name → the one function it declares, by a function declaration or a const holding an arrow or function. */
  readonly functions: ReadonlyMap<string, HelperFunction | null>;
}

type HelperFunction = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

// The function a declaration names, when it names one.
function declaredFunction(node: ts.Node): [string, HelperFunction] | undefined {
  if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
    return [node.name.text, node];
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
    const value = node.initializer;
    return ts.isArrowFunction(value) || ts.isFunctionExpression(value) ? [node.name.text, value] : undefined;
  }
  return undefined;
}

// The test file a module specifier names, or undefined for a production package or path.
function testModuleOf(specifier: ts.Expression | undefined, path: string, aliases: TestAliases): string | undefined {
  if (specifier === undefined || !ts.isStringLiteral(specifier)) {
    return undefined;
  }
  return specifier.text.startsWith(".") ? join(dirname(path), specifier.text) : aliases.get(specifier.text);
}

// Named bindings an import or a re-export carries: local or exported name → the name the module exports.
function namedBindings(statement: ts.Statement): readonly ts.ImportOrExportSpecifier[] {
  if (ts.isImportDeclaration(statement)) {
    const bindings = statement.importClause?.namedBindings;
    return bindings !== undefined && ts.isNamedImports(bindings) ? bindings.elements : [];
  }
  return ts.isExportDeclaration(statement) && statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)
    ? statement.exportClause.elements
    : [];
}

function parsedTest(source: CensusSource, aliases: TestAliases): ParsedTest {
  const file = parse(source);
  const declared = new Map<string, ts.VariableDeclaration | null>();
  const imported = new Map<string, { readonly from: string; readonly name: string }>();
  const starFrom: string[] = [];
  const functions = new Map<string, HelperFunction | null>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      declared.set(node.name.text, declared.has(node.name.text) ? null : node);
    }
    const helper = declaredFunction(node);
    if (helper !== undefined) {
      functions.set(helper[0], functions.has(helper[0]) ? null : helper[1]);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  for (const statement of file.statements) {
    const from =
      ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement) ? testModuleOf(statement.moduleSpecifier, source.path, aliases) : undefined;
    if (from === undefined) {
      continue;
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause === undefined) {
      starFrom.push(from);
    }
    for (const element of namedBindings(statement)) {
      imported.set(element.name.text, { from, name: (element.propertyName ?? element.name).text });
    }
  }
  return { source, file, declared, imported, starFrom, functions };
}

// A name expression and the file it is written in.
interface Located {
  readonly at: ParsedTest;
  readonly node: ts.Expression;
}

// Resolves spec-local constants to the text they hold, so a literal reaches the census at its declaration.
class NameResolver {
  readonly #read: TestFileReader;
  readonly #aliases: TestAliases;
  readonly #parsed = new Map<string, ParsedTest | undefined>();
  readonly #seen = new Set<ts.Node>();
  // `path\nname` pairs already looked up, so an `export *` cycle ends.
  readonly #followed = new Set<string>();
  readonly #flowing = new Map<HelperFunction, ReadonlySet<number>>();

  constructor(read: TestFileReader, aliases: TestAliases) {
    this.#read = read;
    this.#aliases = aliases;
  }

  parsed(path: string): ParsedTest | undefined {
    if (!this.#parsed.has(path)) {
      const source = this.#read(path);
      this.#parsed.set(path, source === undefined ? undefined : parsedTest(source, this.#aliases));
    }
    return this.#parsed.get(path);
  }

  // Every name expression an argument can hold: its arms, the elements of a list, and what a local constant declares.
  resolve(node: ts.Expression, at: ParsedTest): Located[] {
    return arms(node).flatMap((arm) => this.#resolveArm(arm, at));
  }

  #resolveArm(arm: ts.Expression, at: ParsedTest): Located[] {
    if (isNameExpression(arm)) {
      return [{ at, node: arm }];
    }
    if (ts.isArrayLiteralExpression(arm)) {
      return arm.elements.flatMap((element) => this.resolve(ts.isSpreadElement(element) ? element.expression : element, at));
    }
    if (ts.isIdentifier(arm)) {
      return this.#declaredValue(arm.text, at).flatMap(({ at: home, node }) => this.resolve(node, home));
    }
    if (ts.isPropertyAccessExpression(arm) || ts.isElementAccessExpression(arm)) {
      return this.#memberValue(arm, at);
    }
    return [];
  }

  // What a name declares: a const's initializer, the list a `for…of` variable walks, or an export of a test module.
  #declaredValue(name: string, at: ParsedTest): Located[] {
    const declaration = at.declared.get(name);
    if (declaration === undefined) {
      return this.#importedValue(name, at);
    }
    if (declaration === null || this.#seen.has(declaration)) {
      return [];
    }
    this.#seen.add(declaration);
    const loop = declaration.parent.parent;
    if (ts.isForOfStatement(loop)) {
      return [{ at, node: loop.expression }];
    }
    return declaration.initializer === undefined ? [] : [{ at, node: declaration.initializer }];
  }

  // A name the file imports or re-exports by name, else the first `export *` module that declares it.
  #importedValue(name: string, at: ParsedTest): Located[] {
    const key = `${at.source.path}\n${name}`;
    if (this.#followed.has(key)) {
      return [];
    }
    this.#followed.add(key);
    const link = at.imported.get(name);
    const links = link === undefined ? at.starFrom.map((from) => ({ from, name })) : [link];
    for (const { from, name: exported } of links) {
      const home = this.parsed(from);
      const found = home === undefined ? [] : this.#declaredValue(exported, home);
      if (found.length > 0) {
        return found;
      }
    }
    return [];
  }

  /** The arguments of a call to a test helper that hands them on to a name position. */
  helperArguments(call: ts.CallExpression, at: ParsedTest): ts.Expression[] {
    const target = ts.isIdentifier(call.expression) ? this.#helperNamed(call.expression.text, at) : undefined;
    if (target === undefined) {
      return [];
    }
    const flowing = this.#flowingParameters(target.helper, target.at);
    return call.arguments.filter((_, position) => flowing.has(position));
  }

  // The helper a name calls: one the file declares, else one a test module it imports by name declares.
  #helperNamed(name: string, at: ParsedTest): { readonly helper: HelperFunction; readonly at: ParsedTest } | undefined {
    const local = at.functions.get(name);
    if (local !== undefined) {
      return local === null ? undefined : { helper: local, at };
    }
    const link = at.imported.get(name);
    const home = link === undefined ? undefined : this.parsed(link.from);
    const imported = link === undefined ? undefined : home?.functions.get(link.name);
    return imported === undefined || imported === null || home === undefined ? undefined : { helper: imported, at: home };
  }

  // The positions of a helper's plain parameters that reach a name position in its body, directly or through another
  // helper it calls. A destructured parameter is not followed.
  #flowingParameters(helper: HelperFunction, at: ParsedTest): ReadonlySet<number> {
    const known = this.#flowing.get(helper);
    if (known !== undefined) {
      return known;
    }
    const flowing = new Set<number>();
    // Set before the walk, so a helper that calls itself reads what is known so far instead of recursing.
    this.#flowing.set(helper, flowing);
    const names = helper.parameters.map((parameter) => (ts.isIdentifier(parameter.name) ? parameter.name.text : undefined));
    const positions = (argument: ts.Expression): number[] =>
      arms(argument)
        .map((arm) => (ts.isIdentifier(arm) ? names.indexOf(arm.text) : -1))
        .filter((position) => position >= 0);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        for (const position of [...nameArguments(node), ...this.helperArguments(node, at)].flatMap(positions)) {
          flowing.add(position);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(helper.body ?? helper);
    return flowing;
  }

  // `LABELS.key` or `LABELS["key"]` of a local object literal, or any element of a local list.
  #memberValue(member: ts.PropertyAccessExpression | ts.ElementAccessExpression, at: ParsedTest): Located[] {
    const key = memberKey(member);
    const holders = ts.isIdentifier(member.expression) ? this.#declaredValue(member.expression.text, at) : [];
    return holders.flatMap(({ at: home, node }) =>
      arms(node).flatMap((holder) => {
        if (ts.isArrayLiteralExpression(holder)) {
          return this.resolve(holder, home);
        }
        if (!ts.isObjectLiteralExpression(holder) || key === undefined) {
          return [];
        }
        return holder.properties
          .filter((property) => ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === key)
          .flatMap((property) => (ts.isPropertyAssignment(property) ? this.resolve(property.initializer, home) : []));
      }),
    );
  }
}

const NO_TEST_FILES: TestFileReader = () => undefined;

// The property a member read names, when it names one by a literal.
function memberKey(member: ts.PropertyAccessExpression | ts.ElementAccessExpression): string | undefined {
  if (ts.isPropertyAccessExpression(member)) {
    return member.name.text;
  }
  return ts.isStringLiteralLike(member.argumentExpression) ? member.argumentExpression.text : undefined;
}

function siteOf({ at, node }: Located): NameSite {
  const position = at.file.getLineAndCharacterOfPosition(node.getStart(at.file));
  return { file: at.source.path, line: position.line + 1, column: position.character + 1, text: node.getText(at.file) };
}

/**
 * Every hand-written name site one test file reaches, in source order. A constant the spec declares, or imports from a
 * test file by a relative path, is followed to its literal and counted where that literal is written, so a site can
 * sit in another file and two specs can reach one site.
 */
export function nameSites(source: CensusSource, read: TestFileReader = NO_TEST_FILES, aliases: TestAliases = new Map()): NameSite[] {
  const resolver = new NameResolver((path) => (path === source.path ? source : read(path)), aliases);
  const at = resolver.parsed(source.path);
  if (at === undefined) {
    return [];
  }
  const found: Located[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      for (const argument of [...nameArguments(node), ...resolver.helperArguments(node, at)]) {
        found.push(...resolver.resolve(argument, at));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(at.file);
  const unique = new Map(found.map((located) => [`${located.at.source.path}\n${String(located.node.getStart(located.at.file))}`, located]));
  return [...unique.values()].map(siteOf);
}

/** Where production keeps its strings. */
export interface ProductionIndex {
  /** value → the `.ts` modules that export it from a top-level constant or return it from an exported function. */
  readonly exported: ReadonlyMap<string, ReadonlySet<string>>;
  /** value → every production file that spells it as a literal, JSX text or template fragment. */
  readonly spelled: ReadonlyMap<string, ReadonlySet<string>>;
  /** A template fragment without its edge spaces → the files whose templates hold it, for a computed name's fixed words. */
  readonly fragments: ReadonlyMap<string, ReadonlySet<string>>;
  readonly texts: readonly CensusSource[];
}

const hasExport = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);

function addTo(map: Map<string, Set<string>>, value: string, file: string): void {
  map.getOrInsertComputed(value, () => new Set()).add(file);
}

const jsxText = (node: ts.JsxText): string => node.text.replaceAll(/\s+/gu, " ").trim();

// Every string a file spells: literals, JSX text, template fragments, and the text between a guest's markup tags.
function spellings(source: CensusSource, file: ts.SourceFile): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node)) {
      found.push(node.text);
    } else if (ts.isJsxText(node)) {
      found.push(jsxText(node));
    } else if (ts.isTemplateExpression(node)) {
      found.push(node.head.text, ...node.templateSpans.map((span) => span.literal.text));
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (source.path.startsWith(GUEST_ROOT)) {
    found.push(...[...source.text.matchAll(MARKUP_TEXT)].map(([, text = ""]) => text.trim()));
  }
  return found.filter((value) => value !== "");
}

// Every string a `.ts` module's exported constants and functions hold.
function exportedValues(file: ts.SourceFile): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node)) {
      found.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  for (const statement of file.statements) {
    if ((ts.isVariableStatement(statement) || ts.isFunctionDeclaration(statement)) && hasExport(statement)) {
      visit(statement);
    }
  }
  return found;
}

// The fixed text of every template a file writes, each piece trimmed: `Add ${n} to this chat` holds "Add" and "to this chat".
function templateFragments(file: ts.SourceFile): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isTemplateExpression(node)) {
      found.push(node.head.text.trim(), ...node.templateSpans.map((span) => span.literal.text.trim()));
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found.filter((value) => value !== "");
}

/** Index production sources: what each `.ts` module exports, and where every string is spelled. */
export function productionIndex(sources: readonly CensusSource[]): ProductionIndex {
  const exported = new Map<string, Set<string>>();
  const spelled = new Map<string, Set<string>>();
  const fragments = new Map<string, Set<string>>();
  for (const source of sources) {
    const file = parse(source);
    for (const value of spellings(source, file)) {
      addTo(spelled, value, source.path);
    }
    for (const value of templateFragments(file)) {
      addTo(fragments, value, source.path);
    }
    if (source.path.endsWith(".ts")) {
      for (const value of exportedValues(file)) {
        addTo(exported, value, source.path);
      }
    }
  }
  return { exported, spelled, fragments, texts: sources };
}

/** The fixed words of a computed name: template text, regex text outside its operators, and concatenated strings. */
export function fixedWords(text: string): string[] {
  const hole = "\u0000";
  const stripped = text
    .replaceAll(/\$\{[^}]*\}/gu, hole)
    .replaceAll(/\\[dswbDSWB]|\\u\{?[0-9a-fA-F]+\}?/gu, hole)
    .replaceAll(/[\^$()|?*+.[\]{}]/gu, hole)
    .replaceAll(/\\(.)/gu, "$1");
  const quoted = [...stripped.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`|\/([^/]*)\/[a-z]*/gu)].map((match) => match[1] ?? match[2] ?? match[3] ?? match[4] ?? "");
  return (quoted.length > 0 ? quoted : [stripped])
    .flatMap((piece) => piece.split(hole))
    .map((piece) => piece.trim())
    .filter((piece) => /[A-Za-z]{3}/u.test(piece));
}

/** A plain literal's value, or undefined for a computed name. */
function literalValue(text: string): string | undefined {
  const node = ts.createSourceFile("value.ts", text, ts.ScriptTarget.Latest).statements[0];
  if (node !== undefined && ts.isExpressionStatement(node) && ts.isStringLiteralLike(node.expression)) {
    return node.expression.text;
  }
  return undefined;
}

/** The production feature a file belongs to: a client feature, a client or ui directory, or a package. */
export function productionFeature(path: string): string {
  return /^packages\/(client\/src\/features\/[^/]+|client\/src\/[^/]+|ui\/src\/[^/]+(?:\/[^/.]+)?|[^/]+)/u.exec(path)?.[1] ?? path;
}

/** The test directory a site belongs to when production owns none of its text. */
export function testFeature(path: string): string {
  return /^tests\/(client\/features\/[^/]+|client\/[^/]+|ui\/[^/]+|e2e(?:\/support)?)/u.exec(path)?.[1] ?? path;
}

/** The census evidence beside the production index: strings tests author, and what each test file mounts and imports. */
export interface TestEvidence {
  readonly authored: ReadonlySet<string>;
  /** test file → the client features it imports from. */
  readonly features?: ReadonlyMap<string, readonly string[]>;
  /** test file → the strings the stories it mounts author. */
  readonly mounted?: ReadonlyMap<string, ReadonlySet<string>>;
}

// Every string literal and JSX text a file spells.
function fileStrings(source: CensusSource): Set<string> {
  const found = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node)) {
      found.add(node.text);
    } else if (ts.isJsxText(node)) {
      found.add(jsxText(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(source));
  return found;
}

/** Collect every string a story, fixture, corpus or support file spells. */
export function authoredStrings(sources: readonly CensusSource[]): Set<string> {
  return new Set(sources.filter((source) => AUTHORED_FILE.test(source.path)).flatMap((source) => [...fileStrings(source)]));
}

const sorted = (files: Iterable<string>): string[] => [...files].sort();

const CLIENT_FEATURE = /^packages\/client\/src\/features\/([^/]+)\//u;
const TEST_CLIENT_FEATURE = /^tests\/client\/features\/([^/]+)\//u;

// The home a row is filed under when several files hold its text: one in the test's own feature, then one in a feature
// the test imports from, then the first in path order.
function preferredFeature(homes: readonly string[], file: string, evidence: TestEvidence): string {
  const featureOf = (path: string): string | undefined => CLIENT_FEATURE.exec(path)?.[1];
  const own = TEST_CLIENT_FEATURE.exec(file)?.[1];
  const imported = evidence.features?.get(file) ?? [];
  const home =
    homes.find((path) => own !== undefined && featureOf(path) === own) ?? homes.find((path) => imported.includes(featureOf(path) ?? "")) ?? homes[0] ?? "";
  return productionFeature(home);
}

function classifyLiteral(site: NameSite, value: string, index: ProductionIndex, evidence: TestEvidence): CensusRow {
  if (!/[A-Za-z]{2}/u.test(value)) {
    return { ...site, class: "non-word", feature: testFeature(site.file), homes: [] };
  }
  // A story the test mounts wrote the text it locates, so the story is its home whatever production also spells.
  if (evidence.mounted?.get(site.file)?.has(value) === true) {
    return { ...site, class: "authored", feature: testFeature(site.file), homes: [] };
  }
  const spelledIn = sorted(index.spelled.get(value) ?? []);
  const owners = index.exported.get(value);
  if (owners !== undefined) {
    const homes = sorted(owners);
    const elsewhere = spelledIn.filter((file) => !(owners.has(file) || file.startsWith(GUEST_ROOT)));
    const feature = preferredFeature(homes, site.file, evidence);
    if (site.file.startsWith("tests/ui/") && homes.every((file) => !file.startsWith("packages/ui/"))) {
      return { ...site, class: "export-out-of-reach", feature, homes };
    }
    return { ...site, class: elsewhere.length > 0 ? "exported-also-inline" : "exported", feature, homes: [...homes, ...elsewhere] };
  }
  const inline = spelledIn.filter((file) => !file.startsWith(GUEST_ROOT));
  if (inline.length > 0) {
    return {
      ...site,
      class: evidence.authored.has(value) ? "inline-also-authored" : "inline",
      feature: preferredFeature(inline, site.file, evidence),
      homes: inline,
    };
  }
  if (spelledIn.length > 0) {
    return { ...site, class: "guest", feature: testFeature(site.file), homes: spelledIn };
  }
  return { ...site, class: evidence.authored.has(value) ? "authored" : "unresolved", feature: testFeature(site.file), homes: [] };
}

// The production files that spell a fixed word: as a whole string or trimmed template fragment, or, for a long word,
// inside one.
function homesOfPiece(piece: string, index: ProductionIndex): Set<string> {
  const homes = new Set([...(index.spelled.get(piece) ?? []), ...(index.fragments.get(piece) ?? [])]);
  if (piece.length >= MIN_SUBSTRING_PIECE) {
    for (const [value, files] of index.spelled) {
      if (value.includes(piece)) {
        for (const file of files) {
          homes.add(file);
        }
      }
    }
  }
  return new Set([...homes].filter((file) => !file.startsWith(GUEST_ROOT)));
}

// A computed name's home is a file that spells every one of its fixed words; one word alone names no home.
function homesOfWords(words: readonly string[], index: ProductionIndex): string[] {
  const [first, ...rest] = words.map((word) => homesOfPiece(word, index));
  return sorted([...(first ?? [])].filter((file) => rest.every((homes) => homes.has(file))));
}

/** Classify one site against the production index. */
export function classifySite(site: NameSite, index: ProductionIndex, evidence: TestEvidence): CensusRow {
  const value = literalValue(site.text);
  if (value !== undefined) {
    return classifyLiteral(site, value, index, evidence);
  }
  const words = fixedWords(site.text);
  if (words.length === 0) {
    return { ...site, class: "no-words", feature: testFeature(site.file), homes: [] };
  }
  const homes = homesOfWords(words, index);
  const ambiguous = homes.length > 1 && words.every((word) => word.length < MIN_SUBSTRING_PIECE);
  if (homes.length > 0 && !ambiguous) {
    return { ...site, class: "inline-template", feature: preferredFeature(homes, site.file, evidence), homes };
  }
  return { ...site, class: words.some((word) => evidence.authored.has(word)) ? "authored" : "unresolved-template", feature: testFeature(site.file), homes: [] };
}

function trackedFiles(repoRoot: string, globs: readonly string[]): CensusSource[] {
  return execNicedSync("git", ["ls-files", "--", ...globs], { cwd: repoRoot, maxBuffer: GIT_LIST_MAX_BUFFER })
    .split("\n")
    .filter((path) => path !== "")
    .map((path) => ({ path, text: readFileSync(join(repoRoot, path), "utf8") }));
}

// Each `@orb/testkit` entry and the test file its export map points at.
function testkitAliases(repoRoot: string): TestAliases {
  const manifest = z
    .object({ name: z.string(), exports: z.record(z.string(), z.string()) })
    .parse(JSON.parse(readFileSync(join(repoRoot, TESTKIT_ROOT, "package.json"), "utf8")));
  return new Map(Object.entries(manifest.exports).map(([entry, target]) => [join(manifest.name, entry), join(TESTKIT_ROOT, target)]));
}

// The client features a test file imports a module from, by any import spelling that names `features/<feature>/`.
function importedFeatures(source: CensusSource): string[] {
  return [...new Set([...source.text.matchAll(IMPORTED_FEATURE)].map(([, feature = ""]) => feature))];
}

// The strings the stories a test file mounts author: a stories module it imports, or a story it names by path.
function mountedStrings(source: CensusSource, byPath: ReadonlyMap<string, CensusSource>): Set<string> {
  const imported = [...source.text.matchAll(STORIES_IMPORT)].map(([, specifier = ""]) => join(dirname(source.path), specifier));
  const named = [...source.text.matchAll(STORY_PATH)].map(([, module = ""]) => `${module}.tsx`);
  return new Set(
    [...imported, ...named].flatMap((path) => {
      const story = byPath.get(path);
      return story === undefined ? [] : [...fileStrings(story)];
    }),
  );
}

/** Run the census over the checkout's tracked files, sorted by file, line and column. */
export function runCensus(repoRoot: string): CensusRow[] {
  const tests = trackedFiles(
    repoRoot,
    CENSUS_TEST_ROOTS.flatMap((root) => [`${root}/*.ts`, `${root}/*.tsx`]),
  );
  const index = productionIndex(trackedFiles(repoRoot, [...PRODUCTION_GLOBS, ...GUEST_GLOBS]));
  const testFiles = trackedFiles(repoRoot, ["tests/*.ts", "tests/*.tsx"]);
  const byPath = new Map(testFiles.map((source) => [source.path, source]));
  const evidence: TestEvidence = {
    authored: authoredStrings(testFiles),
    features: new Map(testFiles.map((source) => [source.path, importedFeatures(source)])),
    mounted: new Map(testFiles.map((source) => [source.path, mountedStrings(source, byPath)])),
  };
  const read: TestFileReader = (path) => byPath.get(path);
  const aliases = testkitAliases(repoRoot);
  const sites = new Map(
    tests.flatMap((source) => nameSites(source, read, aliases)).map((site) => [`${site.file}:${String(site.line)}:${String(site.column)}`, site]),
  );
  return [...sites.values()]
    .map((site) => classifySite(site, index, evidence))
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
}

/** The rows whose feature starts with `prefix`. */
export function inFeature(rows: readonly CensusRow[], prefix: string | undefined): CensusRow[] {
  return prefix === undefined ? [...rows] : rows.filter((row) => row.feature.startsWith(prefix));
}

/** A per-feature, per-class count table: features by site count, then by name; classes in {@link CENSUS_CLASSES} order. */
export function formatCensus(rows: readonly CensusRow[]): string {
  const present = CENSUS_CLASSES.filter((cls) => rows.some((row) => row.class === cls));
  const byFeature = Map.groupBy(rows, (row) => row.feature);
  const lines = [`feature | ${present.join(" | ")} | sites | files`];
  const ordered = [...byFeature].sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b));
  for (const [feature, group] of ordered) {
    const counts = present.map((cls) => String(group.filter((row) => row.class === cls).length));
    lines.push(`${feature} | ${counts.join(" | ")} | ${String(group.length)} | ${String(new Set(group.map((row) => row.file)).size)}`);
  }
  const totals = present.map((cls) => String(rows.filter((row) => row.class === cls).length));
  lines.push(`total | ${totals.join(" | ")} | ${String(rows.length)} | ${String(new Set(rows.map((row) => row.file)).size)}`);
  return lines.join("\n");
}
