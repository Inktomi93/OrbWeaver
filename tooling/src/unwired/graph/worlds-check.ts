// The merged program proved against each world's own program: per world, the files only the world loads, every import
// that resolves to another file, and every declared type whose members differ; then every merged-program error is
// matched in a world that holds its file, explained by what the merged program sees differently at it, or unexplained.
//
// - Each world loads as the scans load it (worlds.ts bridgedConfigText), so the diff isolates the merge from the bridge.
// - Types never cross programs, so a member's type is compared by its printed text (typeToString, never truncated, since
//   noErrorTruncation differs between worlds), and both texts are reported. Two declarations printed under one name
//   compare equal; the import that picked the other declaration is listed as a resolution difference.
// - A member difference's cause is proved from declaring files, never from the printed text: it is lib-merge when every
//   file only the merged side declares the member, or a symbol its type is built from, in is a library the world does
//   not load. A library is the program's answer (NativeWorld.libraryOf), never a path.
// - A site explanation names the error's own node or statement: an import explains an error only when the error's
//   statement uses one of its bindings.
// - A world's types are read from its own files: a package world's files under its package's src, any other world's
//   root files outside every package's src, each file once, in the solution's world order.
// - An error is matched only by a world error with the same file, position, code and text. An unmatched one is
//   explained by the first of EXPLANATIONS that holds for a world holding its file. declared-apart is proved by the
//   diagnostic's own related declarations: no world loads the error's file and all of theirs together.
// - The options explanation is proved by a program of the world's files on the merged options: the error shows there.
// - One compiler process at a time: the merged program, then each world, so the peak is one program's.
import { join, relative } from "node:path";
import type { Identifier, ImportClause, Node, NoSubstitutionTemplateLiteral, SourceFile, StringLiteral } from "@typescript/native/ast";
import {
  getTouchingPropertyName,
  isClassDeclaration,
  isIdentifier,
  isImportDeclaration,
  isInterfaceDeclaration,
  isNamespaceImport,
  isNoSubstitutionTemplateLiteral,
  isSourceFile,
  isStringLiteral,
  isTypeAliasDeclaration,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Checker, Diagnostic, Symbol as NativeSymbol, Program, Type } from "@typescript/native/sync";
import { API, all, DiagnosticCategory, isRemoteNode, SymbolFlags, TypeFormatFlags } from "@typescript/native/sync";
import { loadWorld } from "../../floor/testing/test-worlds.ts";
import { hasFlag, NativeWorld } from "../native.ts";
import { MERGED_CONFIG, mergedOptionsConfigText, mergedWorlds } from "../worlds.ts";

/** What a world loads or resolves apart from the merged program. */
const LOAD_KINDS = ["file-only-in-world", "library-only-in-merged", "resolution", "option"] as const;
/** How a declared type's members differ between a world and the merged program. */
const SHAPE_KINDS = ["type-only-in-world", "member-only-in-world", "member-only-in-merged", "member-type"] as const;
type LoadKind = (typeof LOAD_KINDS)[number];
type ShapeKind = (typeof SHAPE_KINDS)[number];

/** Why a shape differs: the merged program loads a library the world does not, or a cause the files do not prove. */
const CAUSES = ["lib-merge", "unproven"] as const;
type Cause = (typeof CAUSES)[number];

/** Why an unmatched merged-program error is not an error in the worlds, in the order they are tried. */
const EXPLANATIONS = ["outside-worlds", "declared-apart", "site-symbol", "site-type", "site-members", "resolution", "options"] as const;
type Explanation = (typeof EXPLANATIONS)[number];

/** One difference, with what the world and the merged program each hold; an absent side is the empty string. */
interface DifferenceBase {
  readonly at: string;
  readonly subject: string;
  readonly world: string;
  readonly merged: string;
}

interface LoadDifference extends DifferenceBase {
  readonly kind: LoadKind;
}

/** A shape difference with its cause and the files only the merged side declares the member or its type in. */
interface ShapeDifference extends DifferenceBase {
  readonly kind: ShapeKind;
  readonly cause: Cause;
  readonly mergedOnly: readonly string[];
}

type Difference = LoadDifference | ShapeDifference;

/** One world against the merged program: its types compared, and every difference. */
/** A package whose declaration files only the merged program loads, with how many files. */
interface LibraryPackage {
  readonly name: string;
  readonly files: number;
}

interface WorldReport {
  readonly config: string;
  readonly libraries: readonly LibraryPackage[];
  readonly types: number;
  readonly identical: number;
  readonly differing: number;
  readonly errors: number;
  readonly differences: readonly Difference[];
}

/** An error as one program reports it; `worlds` names the worlds that hold its file, or the world that reports it. */
interface CheckedError {
  readonly at: string;
  readonly code: number;
  readonly text: string;
  readonly worlds: readonly string[];
}

/** An unmatched merged-program error with the world whose program sees its site differently, and what each sees. */
interface ExplainedError extends CheckedError {
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
  /** The files of the declarations the diagnostic names beside its own, as a duplicate declaration's other sites. */
  readonly related: readonly string[];
  readonly pos: number;
  readonly at: string;
  readonly code: number;
  readonly text: string;
}

// What a program sees at an error's position: the files declaring the symbol there, the printed type, the type's members
// with the files declaring each, and the imports the error's statement uses.
interface Site {
  readonly declarations: string;
  readonly type: string;
  readonly members: readonly string[];
  /** The module specifiers whose bindings the error's statement uses. */
  readonly imports: readonly string[];
}

interface Resolution {
  readonly at: string;
  readonly specifier: string;
  readonly target: string;
}

// A member's printed type, and the files declaring the member and every symbol its type is built from.
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
  /** Each library file the program loads, by the package it belongs to (NativeWorld.libraryOf). */
  readonly libraries: ReadonlyMap<string, string>;
}

// What the explanation step keeps of a world once its process is closed.
interface WorldTrace {
  readonly config: string;
  readonly files: ReadonlySet<string>;
  readonly errorKeys: ReadonlySet<string>;
  readonly sites: ReadonlyMap<string, Site>;
  /** Each file's imports that resolve to another file in the merged program. */
  readonly resolutions: ReadonlyMap<string, readonly LoadDifference[]>;
}

const UNRESOLVED = "(unresolved)";
// A diagnostic's category arrives as the number the enum holds.
const ERROR: number = DiagnosticCategory.Error;
// Options that name where a program's own config sits, or its aliases, which the resolution rows compare.
const OPTION_BOOKKEEPING: ReadonlySet<string> = new Set(["configFilePath", "pathsBasePath", "paths"]);
const GLOBAL = "(global)";
const DECLARATION_FILE = /\.d\.[cm]?ts$/u;
const PACKAGE_WORLD = /^(packages\/[^/]+)\/tsconfig\.json$/u;
const PACKAGE_SOURCE = /^packages\/[^/]+\/src\//u;
// Shapes are asked in pages of files, the remembered answers dropped after each.
const SHAPE_PAGE = 200;

const isSpecifier = (node: Node): node is StringLiteral | NoSubstitutionTemplateLiteral => isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node);
const lineOf = (source: SourceFile, node: Node): number => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
// The checker names a private member and a unique-symbol key with a per-program id; the id is not part of the shape.
const memberName = (name: string): string => name.replace(/@\d+$/u, "").replace(/^__#\d+@/u, "");
// A program file by its repository path; a file outside the tree, as the compiler's own default libs can be, keeps its
// absolute path.
function pathIn(root: string, absolute: string): string {
  const inTree = relative(root, absolute);
  return inTree.startsWith("..") ? absolute : inTree;
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
        .filter((file) => !(DECLARATION_FILE.test(file) || seen.has(file)))
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

// One step of a type walk: the symbols a type names, and the types it is built from (its union or intersection members,
// its type arguments, and its signatures' parameter and return types). Properties are not followed: a member's own
// members are compared as members of their own declared type.
function* typeStep(
  checker: Checker,
  type: Type,
): APIRequestGenerator<{ readonly symbols: readonly (NativeSymbol | undefined)[]; readonly next: readonly Type[] }> {
  const [symbol, alias, calls, constructs] = yield* all(
    type.getSymbol.gen(),
    type.getAliasSymbol.gen(),
    type.getCallSignatures.gen(),
    type.getConstructSignatures.gen(),
  );
  const parts = type.isUnionType() || type.isIntersectionType() ? yield* type.getTypes.gen() : [];
  const typeArguments = type.isTypeReference() ? yield* checker.getTypeArguments.gen(type) : [];
  const signatures = [...calls, ...constructs];
  const parameters = (yield* all(...signatures.map((signature) => signature.getParameters.gen()))).flat();
  const parameterTypes = yield* all(...parameters.map((parameter) => checker.getTypeOfSymbol.gen(parameter)));
  const returns = yield* all(...signatures.map((signature) => signature.getReturnType.gen()));
  return { symbols: [symbol, alias, ...parameters], next: [...parts, ...typeArguments, ...parameterTypes, ...returns] };
}

// The files declaring every symbol a type walk reaches; the walk ends on a seen-set of type ids.
function* reachedFiles(root: string, world: NativeWorld, start: Type): APIRequestGenerator<readonly string[]> {
  const seen = new Set<number>();
  const symbols: (NativeSymbol | undefined)[] = [];
  let frontier: readonly Type[] = [start];
  while (frontier.length > 0) {
    const fresh = [...new Map(frontier.filter(({ id }) => !seen.has(id)).map((type) => [type.id, type])).values()];
    for (const { id } of fresh) {
      seen.add(id);
    }
    const steps = yield* all(...fresh.map((type) => typeStep(world.checker, type)));
    symbols.push(...steps.flatMap((step) => step.symbols));
    frontier = steps.flatMap((step) => step.next);
  }
  return declaringFiles(root, world, symbols);
}

function* memberOf(root: string, world: NativeWorld, member: NativeSymbol): APIRequestGenerator<Member> {
  const { checker } = world;
  const type = yield* checker.getTypeOfSymbol.gen(member);
  const [text, reached] = yield* all(checker.typeToString.gen(type, undefined, TypeFormatFlags.NoTruncation), reachedFiles(root, world, type));
  return { text, files: [...new Set([...declaringFiles(root, world, [member]), ...reached])].sort() };
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

// The semantic diagnostics of these files; an empty list asks for no file, where the API would answer for every file.
const semanticOf = (root: string, program: Program, files: readonly string[]): readonly Diagnostic[] =>
  files.length === 0 ? [] : program.getSemanticDiagnostics(files.map((file) => join(root, file)));

function errorsOf(root: string, program: Program, files?: readonly string[]): readonly ErrorFact[] {
  const semantic = files === undefined ? program.getSemanticDiagnostics() : semanticOf(root, program, files);
  const diagnostics: readonly Diagnostic[] = [...semantic, ...program.getGlobalDiagnostics()];
  const errors = new Map<string, ErrorFact>();
  for (const { fileName, pos, startPosition, code, text, category, relatedInformation = [] } of diagnostics) {
    if (category !== ERROR) {
      continue;
    }
    const file = fileName === undefined ? null : pathIn(root, fileName);
    const key = `${file ?? GLOBAL}:${String(pos)}:${String(code)}:${text}`;
    const at = file === null || startPosition === undefined ? GLOBAL : `${file}:${String(startPosition.line + 1)}`;
    const related = [...new Set(relatedInformation.flatMap((info) => (info.fileName === undefined ? [] : [pathIn(root, info.fileName)])))].sort();
    errors.set(key, { key, file, related, pos, at, code, text });
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

// The local names an import clause binds: its default, its namespace and each named import.
function clauseNames(clause: ImportClause): readonly Identifier[] {
  const named = clause.namedBindings;
  if (named === undefined) {
    return clause.name === undefined ? [] : [clause.name];
  }
  const bound = isNamespaceImport(named) ? [named.name] : named.elements.map((element) => element.name);
  return clause.name === undefined ? bound : [clause.name, ...bound];
}

// Each import binding of a file by its local name, with the module specifier it comes from.
function importBindings(source: SourceFile): ReadonlyMap<string, string> {
  const bindings = new Map<string, string>();
  for (const statement of source.statements) {
    if (!isImportDeclaration(statement) || statement.importClause === undefined || !isSpecifier(statement.moduleSpecifier)) {
      continue;
    }
    for (const name of clauseNames(statement.importClause)) {
      bindings.set(name.text, statement.moduleSpecifier.text);
    }
  }
  return bindings;
}

// The statement an error sits in: the top-level statement holding its node.
function statementOf(node: Node): Node {
  let at = node;
  while (!(isSourceFile(at) || isSourceFile(at.parent))) {
    at = at.parent;
  }
  return at;
}

// For each site, the specifiers whose import bindings its statement names: an identifier there whose own symbol is an
// import alias the site's file declares.
function statementImports(world: NativeWorld, asks: readonly { readonly node: Node }[]): readonly (readonly string[])[] {
  const names = asks.map(({ node }) => {
    const source = node.getSourceFile();
    const bindings = importBindings(source);
    const identifiers: Identifier[] = [];
    const visit = (child: Node): void => {
      if (isIdentifier(child) && bindings.has(child.text)) {
        identifiers.push(child);
      }
      child.forEachChild(visit);
    };
    visit(statementOf(node));
    return { source, bindings, identifiers };
  });
  const symbols = world.batch(names.flatMap(({ identifiers }) => identifiers.map((identifier) => world.checker.getSymbolAtLocation.gen(identifier))));
  let next = 0;
  return names.map(({ source, bindings, identifiers }) =>
    [
      ...new Set(
        identifiers.flatMap((identifier) => {
          const symbol = symbols[next++];
          const local = symbol !== undefined && hasFlag(symbol.flags, SymbolFlags.Alias) && symbol.declarations.some((handle) => handle.path === source.path);
          return local ? [bindings.get(identifier.text) ?? ""] : [];
        }),
      ),
    ].sort(),
  );
}

// What the program sees at each error's position, for the errors in files it parses.
function sitesAt(root: string, world: NativeWorld, errors: readonly ErrorFact[]): ReadonlyMap<string, Site> {
  const { checker } = world;
  const asks = errors.flatMap((error) => {
    const source = error.file === null ? undefined : world.source(error.file);
    if (source === undefined) {
      return [];
    }
    // a keyword the position touches (`import` in `import.meta`) is a client-side token the checker cannot take; its
    // parent is the node it names
    const touched = getTouchingPropertyName(source, error.pos);
    return [{ error, node: isRemoteNode(touched) ? touched : touched.parent }];
  });
  const nodes = asks.map(({ node }) => node);
  const symbols = world.symbolsAt(nodes);
  const types = world.typesAt(nodes);
  const texts = world.batch(types.map((type) => checker.typeToString.gen(type, undefined, TypeFormatFlags.NoTruncation)));
  const members = world.batch(
    types.map(function* (type): APIRequestGenerator<readonly string[]> {
      const properties = yield* checker.getPropertiesOfType.gen(type);
      return properties.map((property) => `${memberName(property.name)} ${declaringFiles(root, world, [property]).join(",")}`).sort();
    }),
  );
  const imports = statementImports(world, asks);
  world.releaseAnswers();
  return new Map(
    asks.map(({ error }, at) => [
      error.key,
      { declarations: declaringFiles(root, world, [symbols[at]]).join(", "), type: texts[at] ?? "", members: members[at] ?? [], imports: imports[at] ?? [] },
    ]),
  );
}

function factsOf(root: string, world: NativeWorld, own: readonly string[]): Facts {
  const names = world.program.getSourceFileNames();
  const packages = world.batch(names.map((name) => world.libraryOf(name)));
  world.releaseAnswers();
  return {
    files: new Set(names.map((name) => pathIn(root, name))),
    libraries: new Map(
      names.flatMap((name, at) => {
        const name_ = packages[at];
        return name_ === null || name_ === undefined ? [] : [[pathIn(root, name), name_] as const];
      }),
    ),
    resolutions: resolutionsOf(root, world),
    shapes: shapesOf(root, world, own),
    errors: errorsOf(root, world.program),
    options: optionsOf(world.program),
  };
}

// The cause of one member's difference, from the files only the merged side declares it or its type in.
function causeOf(
  inWorld: Member | undefined,
  inMerged: Member | undefined,
  loaded: ReadonlySet<string>,
  libraries: ReadonlyMap<string, string>,
): Pick<ShapeDifference, "cause" | "mergedOnly"> {
  const own = new Set(inWorld?.files ?? []);
  const mergedOnly = (inMerged?.files ?? []).filter((file) => !own.has(file));
  const libMerge = mergedOnly.length > 0 && mergedOnly.every((file) => libraries.has(file) && !loaded.has(file));
  return { cause: libMerge ? "lib-merge" : "unproven", mergedOnly };
}

function shapeDifferences(
  key: string,
  world: Shape,
  merged: Shape | undefined,
  { loaded, libraries }: { readonly loaded: ReadonlySet<string>; readonly libraries: ReadonlyMap<string, string> },
): readonly ShapeDifference[] {
  const [at = key, name = ""] = key.split(" ");
  if (merged === undefined) {
    return [{ kind: "type-only-in-world", at, subject: name, world: [...world.keys()].join(", "), merged: "", cause: "unproven", mergedOnly: [] }];
  }
  const members = [...new Set([...world.keys(), ...merged.keys()])].sort();
  return members.flatMap((member): ShapeDifference[] => {
    const inWorld = world.get(member);
    const inMerged = merged.get(member);
    const row = {
      at,
      subject: `${name}.${member}`,
      world: inWorld?.text ?? "",
      merged: inMerged?.text ?? "",
      ...causeOf(inWorld, inMerged, loaded, libraries),
    };
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
  const librariesOnlyInMerged = [...merged.libraries.keys()].filter((file) => !world.files.has(file));
  return [
    ...onlyInWorld.sort().map((file): LoadDifference => ({ kind: "file-only-in-world", at: file, subject: file, world: file, merged: "" })),
    ...librariesOnlyInMerged.sort().map((file): LoadDifference => ({ kind: "library-only-in-merged", at: file, subject: file, world: "", merged: file })),
  ];
}

function libraryPackages(files: readonly string[], libraries: ReadonlyMap<string, string>): readonly LibraryPackage[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    const name = libraries.get(file) ?? file;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => ({ name, files: count }));
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
): { readonly report: WorldReport; readonly resolutions: ReadonlyMap<string, readonly LoadDifference[]> } {
  const resolved = resolutionDifferences(world, merged);
  const differences: Difference[] = [...fileDifferences(world, merged), ...optionDifferences(config, world, merged), ...[...resolved.values()].flat()];
  let identical = 0;
  for (const [key, shape] of world.shapes) {
    const found = shapeDifferences(key, shape, merged.shapes.get(key), { loaded: world.files, libraries: merged.libraries });
    differences.push(...found);
    identical += found.length === 0 ? 1 : 0;
  }
  const libraries = libraryPackages(
    differences.flatMap(({ kind, subject }) => (kind === "library-only-in-merged" ? [subject] : [])),
    merged.libraries,
  );
  const report = { config, libraries, types: world.shapes.size, identical, differing: world.shapes.size - identical, errors: world.errors.length, differences };
  return { report, resolutions: resolved };
}

const checked = (error: ErrorFact, worlds: readonly string[]): CheckedError => ({ at: error.at, code: error.code, text: error.text, worlds });

// The files of a conflict no world loads together: the error's own file and the files its diagnostic names, when no world
// holding the error's file loads every one of them. Null when the diagnostic names none, or a world loads them all.
function declaredApart(error: ErrorFact, holders: readonly WorldTrace[]): readonly string[] | null {
  const { file, related } = error;
  if (file === null || related.length === 0) {
    return null;
  }
  const conflict = [...new Set([file, ...related])];
  return holders.some(({ files }) => conflict.every((name) => files.has(name))) ? null : conflict;
}

// The first explanation that holds for a world holding the error's file, in EXPLANATIONS order.
function explain(error: ErrorFact, holders: readonly WorldTrace[], mergedSites: ReadonlyMap<string, Site>): ExplainedError | null {
  const worlds = holders.map(({ config }) => config);
  if (holders.length === 0) {
    return { ...checked(error, worlds), explanation: "outside-worlds", by: "", inWorld: "", inMerged: error.file ?? GLOBAL };
  }
  const apart = declaredApart(error, holders);
  if (apart !== null) {
    return { ...checked(error, worlds), explanation: "declared-apart", by: "", inWorld: "", inMerged: apart.join(", ") };
  }
  const merged = mergedSites.get(error.key);
  const ways: Readonly<Record<Exclude<Explanation, "outside-worlds" | "declared-apart" | "options">, (trace: WorldTrace) => readonly [string, string] | null>> =
    {
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
        // only an import the error's own statement uses: another import of the same file explains nothing here
        const used = new Set(merged?.imports ?? []);
        const found = (error.file === null ? [] : (trace.resolutions.get(error.file) ?? [])).find(({ subject }) => used.has(subject));
        return found === undefined ? null : [`${found.at} ${found.subject} -> ${found.world}`, `${found.subject} -> ${found.merged}`];
      },
    };
  for (const explanation of EXPLANATIONS) {
    if (explanation === "outside-worlds" || explanation === "declared-apart" || explanation === "options") {
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
  // the program has already set every library apart, so each declaration file left is the tree's own and is kept
  const ownDeclaration = (): boolean => true;
  let merged: Facts;
  let mergedSites: ReadonlyMap<string, Site>;
  {
    using world = NativeWorld.openMerged(root, ownDeclaration);
    merged = factsOf(root, world, [...own.values()].flat());
    mergedSites = sitesAt(root, world, merged.errors);
  }
  log(`merged: files=${String(merged.files.size)} types=${String(merged.shapes.size)} errors=${String(merged.errors.length)}`);
  const declarations = new Set([...merged.files].filter((file) => DECLARATION_FILE.test(file) && !merged.libraries.has(file)));
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
    // a global error has no site, so only the options probe can explain it
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
    const asked = pending.filter((error) => error.file === null || trace.files.has(error.file));
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
