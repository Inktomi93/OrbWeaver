// The accessible-name census: every name or visible-text target a CT or e2e spec writes by hand, classified by
// where production keeps that text (Spine-Testing §9, labels come from their production home).
//
// A site is a string, template, regex, concatenation or `new RegExp` passed as the text argument of a text locator
// or assertion, or as the `name`, `hasText` or `hasNotText` of a locator's options. A conditional or a `??` in that
// position is read arm by arm, so `isMobile ? { name: "You" } : { name: "Me" }` is two sites. An identifier or a call
// is already a binding and is not a site. A name a helper takes as a parameter and passes on is out of reach: the
// census reads the literal only where it meets the locator.
//
// The class is a judgement on text alone, so `exported` means "a production .ts module exports this exact string and
// no other production file spells it", not "the component under test renders that export". A rewrite still reads
// the component before it trusts the class.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
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
]);
/** The calls whose options object carries a name or text filter. */
const OPTION_CALLS = new Set(["getByRole", "filter", "locator", "getByLabel", "getByText", "getByTestId"]);
const OPTION_KEYS = new Set(["name", "hasText", "hasNotText"]);

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

// The name and text filters of a locator's options argument, each arm of a conditional options object included.
function optionValues(argument: ts.Expression): ts.Expression[] {
  return arms(argument)
    .filter((options) => ts.isObjectLiteralExpression(options))
    .flatMap((options) => options.properties.filter((property) => ts.isPropertyAssignment(property)))
    .filter((property) => ts.isIdentifier(property.name) && OPTION_KEYS.has(property.name.text))
    .map((property) => property.initializer);
}

// The expressions of one call that hold a name, before they are split into arms.
function nameArguments(call: ts.CallExpression): ts.Expression[] {
  const name = calleeName(call);
  if (name === undefined) {
    return [];
  }
  const text = TEXT_CALLS.has(name) ? call.arguments.slice(0, 1) : [];
  const options = OPTION_CALLS.has(name) ? call.arguments.flatMap(optionValues) : [];
  return [...text, ...options];
}

/** Every hand-written name site in one test file, in source order. */
export function nameSites(source: CensusSource): NameSite[] {
  const file = parse(source);
  const sites: NameSite[] = [];
  const take = (node: ts.Expression): void => {
    for (const arm of arms(node)) {
      if (ts.isArrayLiteralExpression(arm)) {
        for (const element of arm.elements) {
          take(element);
        }
      } else if (isNameExpression(arm)) {
        const at = file.getLineAndCharacterOfPosition(arm.getStart(file));
        sites.push({ file: source.path, line: at.line + 1, column: at.character + 1, text: arm.getText(file) });
      }
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      for (const argument of nameArguments(node)) {
        take(argument);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return sites;
}

/** Where production keeps its strings. */
export interface ProductionIndex {
  /** value → the `.ts` modules that export it from a top-level constant or return it from an exported function. */
  readonly exported: ReadonlyMap<string, ReadonlySet<string>>;
  /** value → every production file that spells it as a literal, JSX text or template fragment. */
  readonly spelled: ReadonlyMap<string, ReadonlySet<string>>;
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

/** Index production sources: what each `.ts` module exports, and where every string is spelled. */
export function productionIndex(sources: readonly CensusSource[]): ProductionIndex {
  const exported = new Map<string, Set<string>>();
  const spelled = new Map<string, Set<string>>();
  for (const source of sources) {
    const file = parse(source);
    for (const value of spellings(source, file)) {
      addTo(spelled, value, source.path);
    }
    if (source.path.endsWith(".ts")) {
      for (const value of exportedValues(file)) {
        addTo(exported, value, source.path);
      }
    }
  }
  return { exported, spelled, texts: sources };
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

/** The census evidence beside the production index: strings tests author, and guest markup text. */
export interface TestEvidence {
  readonly authored: ReadonlySet<string>;
}

/** Collect every string a story, fixture, corpus or support file spells. */
export function authoredStrings(sources: readonly CensusSource[]): Set<string> {
  const authored = new Set<string>();
  for (const source of sources) {
    if (!AUTHORED_FILE.test(source.path)) {
      continue;
    }
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteralLike(node)) {
        authored.add(node.text);
      } else if (ts.isJsxText(node)) {
        authored.add(jsxText(node));
      }
      ts.forEachChild(node, visit);
    };
    visit(parse(source));
  }
  return authored;
}

const sorted = (files: Iterable<string>): string[] => [...files].sort();

function classifyLiteral(site: NameSite, value: string, index: ProductionIndex, evidence: TestEvidence): CensusRow {
  if (!/[A-Za-z]{2}/u.test(value)) {
    return { ...site, class: "non-word", feature: testFeature(site.file), homes: [] };
  }
  const spelledIn = sorted(index.spelled.get(value) ?? []);
  const owners = index.exported.get(value);
  if (owners !== undefined) {
    const homes = sorted(owners);
    const elsewhere = spelledIn.filter((file) => !(owners.has(file) || file.startsWith(GUEST_ROOT)));
    const feature = productionFeature(homes[0] ?? "");
    if (site.file.startsWith("tests/ui/") && homes.every((file) => !file.startsWith("packages/ui/"))) {
      return { ...site, class: "export-out-of-reach", feature, homes };
    }
    return { ...site, class: elsewhere.length > 0 ? "exported-also-inline" : "exported", feature, homes: [...homes, ...elsewhere] };
  }
  const inline = spelledIn.filter((file) => !file.startsWith(GUEST_ROOT));
  if (inline.length > 0) {
    return { ...site, class: evidence.authored.has(value) ? "inline-also-authored" : "inline", feature: productionFeature(inline[0] ?? ""), homes: inline };
  }
  if (spelledIn.length > 0) {
    return { ...site, class: "guest", feature: testFeature(site.file), homes: spelledIn };
  }
  return { ...site, class: evidence.authored.has(value) ? "authored" : "unresolved", feature: testFeature(site.file), homes: [] };
}

// The production files that spell a fixed word: as a whole string or fragment, or, for a long word, inside one.
function homesOfPiece(piece: string, index: ProductionIndex): Set<string> {
  const homes = new Set(index.spelled.get(piece) ?? []);
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
    return { ...site, class: "inline-template", feature: productionFeature(homes[0] ?? ""), homes };
  }
  return { ...site, class: words.some((word) => evidence.authored.has(word)) ? "authored" : "unresolved-template", feature: testFeature(site.file), homes: [] };
}

function trackedFiles(repoRoot: string, globs: readonly string[]): CensusSource[] {
  return execNicedSync("git", ["ls-files", "--", ...globs], { cwd: repoRoot, maxBuffer: GIT_LIST_MAX_BUFFER })
    .split("\n")
    .filter((path) => path !== "")
    .map((path) => ({ path, text: readFileSync(join(repoRoot, path), "utf8") }));
}

/** Run the census over the checkout's tracked files, sorted by file, line and column. */
export function runCensus(repoRoot: string): CensusRow[] {
  const tests = trackedFiles(
    repoRoot,
    CENSUS_TEST_ROOTS.flatMap((root) => [`${root}/*.ts`, `${root}/*.tsx`]),
  );
  const index = productionIndex(trackedFiles(repoRoot, [...PRODUCTION_GLOBS, ...GUEST_GLOBS]));
  const evidence: TestEvidence = { authored: authoredStrings(trackedFiles(repoRoot, ["tests/*.ts", "tests/*.tsx"])) };
  return tests
    .flatMap((source) => nameSites(source))
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
