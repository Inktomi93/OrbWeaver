// The merged program proved against each world's own program: per world, the files only the world loads, every import
// that resolves to another file, and every declared type whose members differ; then every merged-program error is
// matched in a world that holds its file, explained by what the merged program sees differently at it, or unexplained.
//
// - Each world loads as the scans load it (worlds.ts bridgedConfigText), so the diff isolates the merge from the bridge.
// - Types never cross programs, so a member's type is compared by its printed text (typeToString), and both texts are
//   reported. Two declarations printed under one name compare equal; the import that picked the other declaration is
//   listed as a resolution difference.
// - A member difference's cause is proved from declaring files, never from the printed text: it is lib-merge when every
//   file only the merged side declares the member or its type in is a library (a default lib or a package's
//   declarations) the world does not load.
// - A world's types are read from its own files: a package world's files under its package's src, any other world's
//   root files outside every package's src, each file once, in the solution's world order.
// - An error is matched only by a world error with the same file, position, code and text. An unmatched one is
//   explained by the first of EXPLANATIONS that holds for a world holding its file.
// - The options explanation is proved by a program of the world's files on the merged options: the error shows there.
// - One compiler process at a time: the merged program, then each world, so the peak is one program's.
import { join, relative } from "node:path";
import type { Node, NoSubstitutionTemplateLiteral, SourceFile, StringLiteral } from "@typescript/native/ast";
import {
  getTouchingPropertyName,
  isClassDeclaration,
  isInterfaceDeclaration,
  isNoSubstitutionTemplateLiteral,
  isStringLiteral,
  isTypeAliasDeclaration,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Diagnostic, Symbol as NativeSymbol, Program } from "@typescript/native/sync";
import { API, all, DiagnosticCategory } from "@typescript/native/sync";
import { loadWorld } from "../../floor/testing/test-worlds.ts";
import { NativeWorld } from "../native.ts";
import { MERGED_CONFIG, mergedOptionsConfigText, mergedWorlds } from "../worlds.ts";

/** What a world loads or resolves apart from the merged program. */
export const LOAD_KINDS = ["file-only-in-world", "library-only-in-merged", "resolution", "option"] as const;
/** How a declared type's members differ between a world and the merged program. */
export const SHAPE_KINDS = ["type-only-in-world", "member-only-in-world", "member-only-in-merged", "member-type"] as const;
export type LoadKind = (typeof LOAD_KINDS)[number];
export type ShapeKind = (typeof SHAPE_KINDS)[number];

/** Why a shape differs: the merged program loads a library the world does not, or a cause the files do not prove. */
export const CAUSES = ["lib-merge", "unproven"] as const;
export type Cause = (typeof CAUSES)[number];

/** Why an unmatched merged-program error is not an error in the worlds, in the order they are tried. */
export const EXPLANATIONS = ["outside-worlds", "site-symbol", "site-type", "site-members", "resolution", "options"] as const;
export type Explanation = (typeof EXPLANATIONS)[number];

/** One difference, with what the world and the merged program each hold; an absent side is the empty string. */
interface DifferenceBase {
  readonly at: string;
  readonly subject: string;
  readonly world: string;
  readonly merged: string;
}

export interface LoadDifference extends DifferenceBase {
  readonly kind: LoadKind;
}

/** A shape difference with its cause and the files only the merged side declares the member or its type in. */
export interface ShapeDifference extends DifferenceBase {
  readonly kind: ShapeKind;
  readonly cause: Cause;
  readonly mergedOnly: readonly string[];
}

export type Difference = LoadDifference | ShapeDifference;

/** One world against the merged program: its types compared, and every difference. */
export interface WorldReport {
  readonly config: string;
  readonly types: number;
  readonly identical: number;
  readonly differing: number;
  readonly errors: number;
  readonly differences: readonly Difference[];
}

/** An error as one program reports it; `worlds` names the worlds that hold its file, or the world that reports it. */
export interface CheckedError {
  readonly at: string;
  readonly code: number;
  readonly text: string;
  readonly worlds: readonly string[];
}

/** An unmatched merged-program error with the world whose program sees its site differently, and what each sees. */
export interface ExplainedError extends CheckedError {
  readonly explanation: Explanation;
  readonly by: string;
  readonly inWorld: string;
  readonly inMerged: string;
}

/** The whole check: each world's differences, and every merged-program error matched, explained or not. */
export interface WorldsCheck {
  readonly worlds: readonly WorldReport[];
  readonly mergedErrors: number;
  readonly matched: readonly CheckedError[];
  readonly explained: readonly ExplainedError[];
  readonly unexplained: readonly CheckedError[];
  readonly worldOnly: readonly CheckedError[];
}

interface ErrorFact {
  readonly key: string;
  readonly file: string | null;
  readonly pos: number;
  readonly at: string;
  readonly code: number;
  readonly text: string;
}

// What a program sees at an error's position: the files declaring the symbol there, the printed type, and the type's
// members with the files declaring each.
interface Site {
  readonly declarations: string;
  readonly type: string;
  readonly members: readonly string[];
}

interface Resolution {
  readonly at: string;
  readonly specifier: string;
  readonly target: string;
}

// A member's printed type and the files declaring the member and its type.
interface Member {
  readonly text: string;
  readonly files: readonly string[];
}

type Shape = ReadonlyMap<string, Member>;

interface Facts {
  readonly files: ReadonlySet<string>;
  readonly resolutions: ReadonlyMap<string, Resolution>;
  readonly shapes: ReadonlyMap<string, Shape>;
  readonly errors: readonly ErrorFact[];
  readonly options: ReadonlyMap<string, string>;
}

// What the explanation step keeps of a world once its process is closed.
interface WorldTrace {
  readonly config: string;
  readonly files: ReadonlySet<string>;
  readonly errorKeys: ReadonlySet<string>;
  readonly sites: ReadonlyMap<string, Site>;
  readonly resolutions: ReadonlyMap<string, LoadDifference>;
}

const UNRESOLVED = "(unresolved)";
// A diagnostic's category arrives as the number the enum holds.
const ERROR: number = DiagnosticCategory.Error;
// Options that name where a program's own config sits, or its aliases, which the resolution rows compare.
const OPTION_BOOKKEEPING: ReadonlySet<string> = new Set(["configFilePath", "pathsBasePath", "paths"]);
const GLOBAL = "(global)";
const NODE_MODULES_DIR = "node_modules/";
const NODE_MODULES = /(?:^|\/)node_modules\//u;
const DECLARATION_FILE = /\.d\.[cm]?ts$/u;
const PACKAGE_WORLD = /^(packages\/[^/]+)\/tsconfig\.json$/u;
const PACKAGE_SOURCE = /^packages\/[^/]+\/src\//u;
// Shapes are asked in pages of files, the remembered answers dropped after each.
const SHAPE_PAGE = 200;

const isSpecifier = (node: Node): node is StringLiteral | NoSubstitutionTemplateLiteral => isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node);
const lineOf = (source: SourceFile, node: Node): number => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
// The checker names a private member and a unique-symbol key with a per-program id; the id is not part of the shape.
const memberName = (name: string): string => name.replace(/@\d+$/u, "").replace(/^__#\d+@/u, "");
// A file outside the tree, as the compiler's own default libs are, is named from its package's node_modules path.
function pathIn(root: string, absolute: string): string {
  const inTree = relative(root, absolute);
  const library = absolute.lastIndexOf(NODE_MODULES_DIR);
  return !inTree.startsWith("..") || library < 0 ? inTree : absolute.slice(library);
}
const resolutionKey = (file: string, specifier: string): string => `${file}\n${specifier}`;

// Each merged world's own files, the files its types are read from.
function ownFiles(root: string, configs: readonly string[]): ReadonlyMap<string, readonly string[]> {
  const seen = new Set<string>();
  return new Map(
    configs.map((config) => {
      const pkg = PACKAGE_WORLD.exec(config)?.[1];
      const own = loadWorld(root, config)
        .fileNames.map((name) => relative(root, name))
        .filter((file) => !(DECLARATION_FILE.test(file) || NODE_MODULES.test(file) || seen.has(file)))
        .filter((file) => (pkg === undefined ? !PACKAGE_SOURCE.test(file) : file.startsWith(`${pkg}/src/`)));
      for (const file of own) {
        seen.add(file);
      }
      return [config, own];
    }),
  );
}

const declaringFiles = (root: string, world: NativeWorld, symbols: readonly (NativeSymbol | undefined)[]): readonly string[] =>
  [...new Set(symbols.flatMap((symbol) => symbol?.declarations ?? []).map((handle) => world.fileOf(handle) ?? pathIn(root, handle.path)))].sort();

function* memberOf(root: string, world: NativeWorld, member: NativeSymbol): APIRequestGenerator<Member> {
  const { checker } = world;
  const type = yield* checker.getTypeOfSymbol.gen(member);
  const [text, symbol, alias] = yield* all(checker.typeToString.gen(type), type.getSymbol.gen(), type.getAliasSymbol.gen());
  return { text, files: declaringFiles(root, world, [member, symbol, alias]) };
}

function* membersOf(root: string, world: NativeWorld, name: Node): APIRequestGenerator<Shape> {
  const { checker } = world;
  const symbol = yield* checker.getSymbolAtLocation.gen(name);
  if (symbol === undefined) {
    return new Map();
  }
  const type = yield* checker.getDeclaredTypeOfSymbol.gen(symbol);
  const members = yield* checker.getPropertiesOfType.gen(type);
  const found = yield* all(...members.map((member) => memberOf(root, world, member)));
  return new Map(members.map((member, at) => [memberName(member.name), found[at] ?? { text: "", files: [] }]));
}

function shapesOf(root: string, world: NativeWorld, files: readonly string[]): ReadonlyMap<string, Shape> {
  const shapes = new Map<string, Shape>();
  for (let start = 0; start < files.length; start += SHAPE_PAGE) {
    const declared: { readonly key: string; readonly name: Node }[] = [];
    for (const file of files.slice(start, start + SHAPE_PAGE)) {
      const source = world.source(file);
      if (source === undefined) {
        continue;
      }
      const visit = (node: Node): void => {
        if ((isInterfaceDeclaration(node) || isTypeAliasDeclaration(node) || isClassDeclaration(node)) && node.name !== undefined) {
          declared.push({ key: `${file}:${String(lineOf(source, node.name))} ${node.name.text}`, name: node.name });
        }
        node.forEachChild(visit);
      };
      source.forEachChild(visit);
    }
    const answers = world.batch(declared.map(({ name }) => membersOf(root, world, name)));
    for (const [at, { key }] of declared.entries()) {
      shapes.set(key, answers[at] ?? new Map());
    }
    world.releaseAnswers();
  }
  return shapes;
}

function resolutionsOf(root: string, world: NativeWorld): ReadonlyMap<string, Resolution> {
  const asks = world.files.flatMap((source) => source.imports.filter(isSpecifier).map((node) => ({ source, node })));
  const answers = world.batch(asks.map(({ source, node }) => world.program.getResolvedModuleFromModuleSpecifier.gen(node, source.fileName)));
  world.releaseAnswers();
  const resolutions = new Map<string, Resolution>();
  for (const [at, { source, node }] of asks.entries()) {
    const file = world.fileOfSource(source);
    const resolved = answers[at]?.resolvedFileName;
    resolutions.set(resolutionKey(file, node.text), {
      at: `${file}:${String(lineOf(source, node))}`,
      specifier: node.text,
      target: resolved === undefined ? UNRESOLVED : pathIn(root, resolved),
    });
  }
  return resolutions;
}

function errorsOf(root: string, program: Program, files?: readonly string[]): readonly ErrorFact[] {
  const semantic = files === undefined ? program.getSemanticDiagnostics() : program.getSemanticDiagnostics(files.map((file) => join(root, file)));
  const diagnostics: readonly Diagnostic[] = [...semantic, ...program.getGlobalDiagnostics()];
  const errors = new Map<string, ErrorFact>();
  for (const { fileName, pos, startPosition, code, text, category } of diagnostics) {
    if (category !== ERROR) {
      continue;
    }
    const file = fileName === undefined ? null : pathIn(root, fileName);
    const key = `${file ?? GLOBAL}:${String(pos)}:${String(code)}:${text}`;
    const at = file === null || startPosition === undefined ? GLOBAL : `${file}:${String(startPosition.line + 1)}`;
    errors.set(key, { key, file, pos, at, code, text });
  }
  return [...errors.values()];
}

// The keys of the errors a world's files have on the merged program's options (worlds.ts mergedOptionsConfigText).
function optionErrorKeys(root: string, config: string, files: readonly string[]): ReadonlySet<string> {
  using api = new API({ cwd: root });
  const path = join(root, MERGED_CONFIG);
  const snapshot = api.createSnapshot({ openProjects: [path], fileSystem: { kind: "layer", files: { [path]: mergedOptionsConfigText(root, config) } } });
  const project = snapshot.getConfiguredProject(path);
  if (project === undefined) {
    throw new Error(`${config}: the TypeScript 7.1 API loaded no project on the merged options`);
  }
  return new Set(errorsOf(root, project.program, files).map(({ key }) => key));
}

// Each compiler option the world sets apart from the merged program, by its JSON text.
function optionsOf(program: Program): ReadonlyMap<string, string> {
  return new Map(
    Object.entries(program.getCompilerOptions())
      .filter(([name]) => !OPTION_BOOKKEEPING.has(name))
      .map(([name, value]): [string, string] => [name, JSON.stringify(value)]),
  );
}

// What the program sees at each error's position, for the errors in files it parses.
function sitesAt(root: string, world: NativeWorld, errors: readonly ErrorFact[]): ReadonlyMap<string, Site> {
  const { checker } = world;
  const asks = errors.flatMap((error) => {
    const source = error.file === null ? undefined : world.source(error.file);
    return source === undefined ? [] : [{ error, node: getTouchingPropertyName(source, error.pos) }];
  });
  const nodes = asks.map(({ node }) => node);
  const symbols = world.symbolsAt(nodes);
  const types = world.typesAt(nodes);
  const texts = world.batch(types.map((type) => checker.typeToString.gen(type)));
  const members = world.batch(
    types.map(function* (type): APIRequestGenerator<readonly string[]> {
      const properties = yield* checker.getPropertiesOfType.gen(type);
      return properties.map((property) => `${memberName(property.name)} ${declaringFiles(root, world, [property]).join(",")}`).sort();
    }),
  );
  world.releaseAnswers();
  return new Map(
    asks.map(({ error }, at) => [
      error.key,
      { declarations: declaringFiles(root, world, [symbols[at]]).join(", "), type: texts[at] ?? "", members: members[at] ?? [] },
    ]),
  );
}

function factsOf(root: string, world: NativeWorld, own: readonly string[]): Facts {
  return {
    files: new Set(world.program.getSourceFileNames().map((name) => pathIn(root, name))),
    resolutions: resolutionsOf(root, world),
    shapes: shapesOf(root, world, own),
    errors: errorsOf(root, world.program),
    options: optionsOf(world.program),
  };
}

// The cause of one member's difference, from the files only the merged side declares it or its type in.
function causeOf(inWorld: Member | undefined, inMerged: Member | undefined, loaded: ReadonlySet<string>): Pick<ShapeDifference, "cause" | "mergedOnly"> {
  const own = new Set(inWorld?.files ?? []);
  const mergedOnly = (inMerged?.files ?? []).filter((file) => !own.has(file));
  const libMerge = mergedOnly.length > 0 && mergedOnly.every((file) => NODE_MODULES.test(file) && !loaded.has(file));
  return { cause: libMerge ? "lib-merge" : "unproven", mergedOnly };
}

function shapeDifferences(key: string, world: Shape, merged: Shape | undefined, loaded: ReadonlySet<string>): readonly ShapeDifference[] {
  const [at = key, name = ""] = key.split(" ");
  if (merged === undefined) {
    return [{ kind: "type-only-in-world", at, subject: name, world: [...world.keys()].join(", "), merged: "", cause: "unproven", mergedOnly: [] }];
  }
  const members = [...new Set([...world.keys(), ...merged.keys()])].sort();
  return members.flatMap((member): ShapeDifference[] => {
    const inWorld = world.get(member);
    const inMerged = merged.get(member);
    const row = { at, subject: `${name}.${member}`, world: inWorld?.text ?? "", merged: inMerged?.text ?? "", ...causeOf(inWorld, inMerged, loaded) };
    if (inMerged === undefined) {
      return [{ kind: "member-only-in-world", ...row }];
    }
    if (inWorld === undefined) {
      return [{ kind: "member-only-in-merged", ...row }];
    }
    return inWorld.text === inMerged.text ? [] : [{ kind: "member-type", ...row }];
  });
}

// The files a world loads that the merged program does not, and the libraries only the merged program loads.
function fileDifferences(world: Facts, merged: Facts): readonly LoadDifference[] {
  const onlyInWorld = [...world.files].filter((file) => !merged.files.has(file));
  const librariesOnlyInMerged = [...merged.files].filter((file) => NODE_MODULES.test(file) && !world.files.has(file));
  return [
    ...onlyInWorld.sort().map((file): LoadDifference => ({ kind: "file-only-in-world", at: file, subject: file, world: file, merged: "" })),
    ...librariesOnlyInMerged.sort().map((file): LoadDifference => ({ kind: "library-only-in-merged", at: file, subject: file, world: "", merged: file })),
  ];
}

// Every compiler option the world and the merged program set apart.
function optionDifferences(config: string, world: Facts, merged: Facts): readonly LoadDifference[] {
  const names = [...new Set([...world.options.keys(), ...merged.options.keys()])].sort();
  return names.flatMap((name): LoadDifference[] => {
    const own = world.options.get(name) ?? "";
    const other = merged.options.get(name) ?? "";
    return own === other ? [] : [{ kind: "option", at: config, subject: name, world: own, merged: other }];
  });
}

// Every import the merged program resolves to another file, keyed by the importing file.
function resolutionDifferences(world: Facts, merged: Facts): ReadonlyMap<string, readonly LoadDifference[]> {
  const byFile = new Map<string, LoadDifference[]>();
  for (const [key, own] of world.resolutions) {
    const other = merged.resolutions.get(key);
    if (other !== undefined && other.target !== own.target) {
      const file = key.slice(0, key.indexOf("\n"));
      byFile.set(file, [...(byFile.get(file) ?? []), { kind: "resolution", at: own.at, subject: own.specifier, world: own.target, merged: other.target }]);
    }
  }
  return byFile;
}

function compareWorld(
  config: string,
  world: Facts,
  merged: Facts,
): { readonly report: WorldReport; readonly resolutions: ReadonlyMap<string, LoadDifference> } {
  const resolved = resolutionDifferences(world, merged);
  const differences: Difference[] = [...fileDifferences(world, merged), ...optionDifferences(config, world, merged), ...[...resolved.values()].flat()];
  let identical = 0;
  for (const [key, shape] of world.shapes) {
    const found = shapeDifferences(key, shape, merged.shapes.get(key), world.files);
    differences.push(...found);
    identical += found.length === 0 ? 1 : 0;
  }
  const report = { config, types: world.shapes.size, identical, differing: world.shapes.size - identical, errors: world.errors.length, differences };
  // the first resolution difference in a file is the one an error there is explained by
  const resolutions = new Map([...resolved].flatMap(([file, [first]]) => (first === undefined ? [] : [[file, first] as const])));
  return { report, resolutions };
}

const checked = (error: ErrorFact, worlds: readonly string[]): CheckedError => ({ at: error.at, code: error.code, text: error.text, worlds });

// The first explanation that holds for a world holding the error's file, in EXPLANATIONS order.
function explain(error: ErrorFact, holders: readonly WorldTrace[], mergedSites: ReadonlyMap<string, Site>): ExplainedError | null {
  const worlds = holders.map(({ config }) => config);
  if (holders.length === 0) {
    return { ...checked(error, worlds), explanation: "outside-worlds", by: "", inWorld: "", inMerged: error.file ?? GLOBAL };
  }
  const merged = mergedSites.get(error.key);
  const ways: Readonly<Record<Exclude<Explanation, "outside-worlds" | "options">, (trace: WorldTrace) => readonly [string, string] | null>> = {
    "site-symbol": (trace) => {
      const own = trace.sites.get(error.key);
      return own !== undefined && merged !== undefined && own.declarations !== merged.declarations ? [own.declarations, merged.declarations] : null;
    },
    "site-type": (trace) => {
      const own = trace.sites.get(error.key);
      return own !== undefined && merged !== undefined && own.type !== merged.type ? [own.type, merged.type] : null;
    },
    "site-members": (trace) => {
      const own = trace.sites.get(error.key);
      if (own === undefined || merged === undefined) {
        return null;
      }
      const onlyOwn = own.members.filter((member) => !merged.members.includes(member));
      const onlyMerged = merged.members.filter((member) => !own.members.includes(member));
      return onlyOwn.length + onlyMerged.length === 0 ? null : [onlyOwn.join("; "), onlyMerged.join("; ")];
    },
    resolution: (trace) => {
      const found = error.file === null ? undefined : trace.resolutions.get(error.file);
      return found === undefined ? null : [`${found.at} ${found.subject} -> ${found.world}`, `${found.subject} -> ${found.merged}`];
    },
  };
  for (const explanation of EXPLANATIONS) {
    if (explanation === "outside-worlds" || explanation === "options") {
      continue;
    }
    for (const trace of holders) {
      const seen = ways[explanation](trace);
      if (seen !== null) {
        return { ...checked(error, worlds), explanation, by: trace.config, inWorld: seen[0], inMerged: seen[1] };
      }
    }
  }
  return null;
}

/** Check the merged program of the tree at `root` against each world's own program. */
export function checkWorlds(root: string, log: (line: string) => void): WorldsCheck {
  const configs = mergedWorlds(root);
  const own = ownFiles(root, configs);
  const repoDeclaration = (file: string): boolean => !NODE_MODULES.test(file);
  let merged: Facts;
  let mergedSites: ReadonlyMap<string, Site>;
  {
    using world = NativeWorld.openMerged(root, repoDeclaration);
    merged = factsOf(root, world, [...own.values()].flat());
    mergedSites = sitesAt(root, world, merged.errors);
  }
  log(`merged: files=${String(merged.files.size)} types=${String(merged.shapes.size)} errors=${String(merged.errors.length)}`);
  const declarations = new Set([...merged.files].filter((file) => DECLARATION_FILE.test(file) && repoDeclaration(file)));
  const mergedKeys = new Set(merged.errors.map(({ key }) => key));
  const reports: WorldReport[] = [];
  const traces: WorldTrace[] = [];
  const worldOnly: CheckedError[] = [];
  for (const config of configs) {
    using world = NativeWorld.open(root, config, declarations);
    const facts = factsOf(root, world, own.get(config) ?? []);
    const errorKeys = new Set(facts.errors.map(({ key }) => key));
    const asked = merged.errors.filter((error) => error.file !== null && facts.files.has(error.file) && !errorKeys.has(error.key));
    const { report, resolutions } = compareWorld(config, facts, merged);
    reports.push(report);
    traces.push({ config, files: facts.files, errorKeys, sites: sitesAt(root, world, asked), resolutions });
    worldOnly.push(...facts.errors.filter(({ key }) => !mergedKeys.has(key)).map((error) => checked(error, [config])));
    log(
      `${config}: types=${String(report.types)} differing=${String(report.differing)} differences=${String(report.differences.length)} errors=${String(report.errors)}`,
    );
  }
  return { worlds: reports, mergedErrors: merged.errors.length, worldOnly, ...judgeErrors(root, merged.errors, traces, mergedSites) };
}

const holdersOf = (error: ErrorFact, traces: readonly WorldTrace[]): readonly WorldTrace[] => {
  const { file } = error;
  return file === null ? traces : traces.filter(({ files }) => files.has(file));
};

// Each merged-program error matched in a world holding its file, else explained, else left unexplained. An error no site
// or resolution explains is asked of each holding world's files on the merged options, one program per world.
function judgeErrors(
  root: string,
  errors: readonly ErrorFact[],
  traces: readonly WorldTrace[],
  mergedSites: ReadonlyMap<string, Site>,
): Pick<WorldsCheck, "matched" | "explained" | "unexplained"> {
  const matched: CheckedError[] = [];
  const explained: ExplainedError[] = [];
  let pending: ErrorFact[] = [];
  for (const error of errors) {
    const holders = holdersOf(error, traces);
    const matching = holders.filter(({ errorKeys }) => errorKeys.has(error.key));
    const why = matching.length > 0 || error.file === null ? null : explain(error, holders, mergedSites);
    if (matching.length > 0) {
      matched.push(
        checked(
          error,
          matching.map(({ config }) => config),
        ),
      );
    } else if (why === null) {
      pending.push(error);
    } else {
      explained.push(why);
    }
  }
  for (const trace of traces) {
    const asked = pending.filter((error) => error.file !== null && trace.files.has(error.file));
    if (asked.length === 0) {
      continue;
    }
    const keys = optionErrorKeys(root, trace.config, [...new Set(asked.flatMap(({ file }) => file ?? []))]);
    const byOptions = asked.filter(({ key }) => keys.has(key));
    explained.push(
      ...byOptions.map(
        (error): ExplainedError => ({
          ...checked(
            error,
            holdersOf(error, traces).map(({ config }) => config),
          ),
          explanation: "options",
          by: trace.config,
          inWorld: "",
          inMerged: error.text,
        }),
      ),
    );
    pending = pending.filter((error) => !byOptions.includes(error));
  }
  return {
    matched,
    explained,
    unexplained: pending.map((error) =>
      checked(
        error,
        holdersOf(error, traces).map(({ config }) => config),
      ),
    ),
  };
}
