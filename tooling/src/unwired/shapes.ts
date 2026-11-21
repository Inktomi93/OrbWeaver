// `pnpm unwired shapes`: named object types in different files with the same members that are assignable both ways
// (a second home for one concept), type aliases that only rename another type, and re-exports of re-exports.
import type { ExportSpecifier, Identifier, InterfaceDeclaration, Node, TypeAliasDeclaration, TypeReferenceNode } from "@typescript/native/ast";
import {
  isExportSpecifier,
  isIndexedAccessTypeNode,
  isInterfaceDeclaration,
  isTypeAliasDeclaration,
  isTypeLiteralNode,
  isTypeQueryNode,
  isTypeReferenceNode,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol, Type } from "@typescript/native/sync";
import { SignatureKind, SymbolFlags, TypeFlags } from "@typescript/native/sync";
import ts from "typescript";
import type { Site } from "./classify.ts";
import { nameAt } from "./classify.ts";
import type { DistinctRegistry } from "./distinct-lookalikes.ts";
import { DISTINCT_LOOKALIKES, isDistinctPair } from "./distinct-lookalikes.ts";
import { ServiceWorld } from "./language-service.ts";
import { declarationKeys, hasFlag, NativeWorld } from "./native.ts";
import type { DeliberateSide, ScanOptions } from "./scan.ts";
import { scanWorlds, sortDeliberate } from "./scan.ts";
import { isProduction } from "./worlds.ts";

const SHAPE_KINDS = ["restated", "synonym", "reexport-chain", "renamed-reexport"] as const;
/** `restated`: two named object types in different files with the same members, each assignable to the other.
 *  `synonym`: an alias that is a bare reference to another type. `reexport-chain`: an export that re-exports a
 *  re-export from another file. `renamed-reexport`: an export that gives a symbol a second name. */
type ShapeKind = (typeof SHAPE_KINDS)[number];

interface UnwiredShape {
  readonly key: string;
  readonly file: string;
  readonly line: number;
  /** The type, alias or export name. */
  readonly home: string;
  /** The other type, the aliased type, or the original export it reaches. */
  readonly member: string;
  readonly kind: ShapeKind;
  /** Where `member` lives (`file:line` for a type, the file of each hop for a chain); `external` outside the tree. */
  readonly at: readonly string[];
  /** A verb's `…Params` or `…Result` name (both sides of a restated pair), the per-verb names Core-0 §4 keeps. */
  readonly perVerb: boolean;
}

export interface ShapesReport {
  readonly scanned: number;
  readonly unwired: readonly UnwiredShape[];
  readonly deliberate: readonly (UnwiredShape & { readonly reason: string })[];
  /** Restated pairs `tooling/src/unwired/distinct-lookalikes.ts` judges two concepts: no review work. */
  readonly distinct: readonly UnwiredShape[];
  /** Findings engine one made that engine two's checker does not reproduce. */
  readonly disagreements: readonly string[];
  readonly limits: readonly string[];
}

/** What the shapes scan cannot see, printed with every run. */
const SHAPE_LIMITS: readonly string[] = [
  "Two homes are compared only inside one package world: a client type and a server type of the same shape are never paired, and test worlds are not scanned.",
  "A generic type, a callable type and a type with fewer than two in-tree members hold no home, so their restatements are not reported.",
  "A declaration whose text after its own name names the other type counts as derived from it, so a restatement that also mentions its twin by name is missed.",
  "A computed form (Pick, Omit, an indexed access, a mapped or conditional type) is derived, never a second home, even where it re-spells the same members.",
  "A re-export chain starts at an export specifier: an `export *` declaration names none, so a chain whose outer hop is `export *` is not reported, and a library's own re-exports are not chains.",
  "A shape read only inside a string (a JSON scenario, a template) or reached through a string-addressed registry is outside this scan: it compares declarations, not uses.",
];

// Below two members a matching shape is a coincidence, `{ id }` across a dozen verbs.
const MIN_MEMBERS = 2;
const MAX_HOPS = 16;
// Core-0 §4 names the per-verb homes by their type names (`params.ts`: every verb's *Params); no checker fact marks a verb.
const PER_VERB = /.(?:Params|Result)$/u;
const PER_VERB_REASON = "docs/law/Core-0-Architecture-and-Structure.md §4: every verb keeps its own *Params and *Result";
// Type operators whose result is computed from a schema or a value, so the type is the schema's own shape.
const INFERRED = new Set(["z.infer", "z.input", "z.output", "ReturnType", "Awaited", "Parameters", "InferSelectModel", "InferInsertModel"]);

const FORMS = ["literal", "inferred", "derived", "synonym"] as const;
/** How a named type is written: its own members, computed from a schema or value, computed from another named type,
 *  or a bare reference to one. Only `literal` and `inferred` types hold a home of their own. */
type Form = (typeof FORMS)[number];

type Named = (InterfaceDeclaration | TypeAliasDeclaration) & { readonly name: Identifier };

function formOf(node: Named): Form {
  if (isInterfaceDeclaration(node) || isTypeLiteralNode(node.type)) {
    return "literal";
  }
  const { type } = node;
  if (isTypeReferenceNode(type) && type.typeArguments === undefined) {
    return "synonym";
  }
  return computedForm(type);
}

// `typeof value` and an operator over it read a value's own shape; `(typeof value)["key"]` does too, while
// `Router["listRules"][number]` and `Awaited<ReturnType<Service["bounds"]>>` read another named type's.
function computedForm(type: Node): Form {
  if (isTypeQueryNode(type)) {
    return "inferred";
  }
  if (isIndexedAccessTypeNode(type)) {
    let object = type.objectType;
    while (isIndexedAccessTypeNode(object)) {
      object = object.objectType;
    }
    return isTypeQueryNode(object) ? "inferred" : "derived";
  }
  if (!(isTypeReferenceNode(type) && INFERRED.has(type.typeName.getText()))) {
    return "derived";
  }
  const [operand] = type.typeArguments ?? [];
  return operand !== undefined && (isIndexedAccessTypeNode(operand) || (isTypeReferenceNode(operand) && INFERRED.has(operand.typeName.getText())))
    ? computedForm(operand)
    : "inferred";
}

interface Declared {
  readonly node: Named;
  readonly site: Site;
  readonly line: number;
  readonly form: Form;
}

const lineOf = (node: Node): number => node.getSourceFile().getLineAndCharacterOfPosition(node.getStart(node.getSourceFile())).line + 1;

function eachProductionNode(world: NativeWorld, visit: (node: Node) => void): void {
  const step = (node: Node): void => {
    visit(node);
    node.forEachChild(step);
  };
  for (const file of world.files.filter((source) => isProduction(world.siteOf(source).file))) {
    file.forEachChild(step);
  }
}

function declared(world: NativeWorld): readonly Declared[] {
  const found: Declared[] = [];
  eachProductionNode(world, (node) => {
    if ((isInterfaceDeclaration(node) || isTypeAliasDeclaration(node)) && node.typeParameters === undefined) {
      found.push({ node, site: world.siteOf(node.name), line: lineOf(node.name), form: formOf(node) });
    }
  });
  return found;
}

// The declared type of a named object type and its member names, or null for anything that is not a plain object.
// Members a library declares do not count toward the minimum: two props types that each wrap a different library
// component with the same props, plus one member of their own, match by the library's shape, not by one concept.
function* shapeOf(world: NativeWorld, node: Named): APIRequestGenerator<Shape | null> {
  const { checker } = world;
  const symbol = yield* checker.getSymbolAtLocation.gen(node.name);
  if (symbol === undefined) {
    return null;
  }
  const type = yield* checker.getDeclaredTypeOfSymbol.gen(symbol);
  if (!hasFlag(type.flags, TypeFlags.Object) || (yield* checker.getSignaturesOfType.gen(type, SignatureKind.Call)).length > 0) {
    return null;
  }
  const properties = yield* checker.getPropertiesOfType.gen(type);
  const own = properties.filter((property) => property.declarations.some((handle) => world.fileOf(handle) !== null));
  const sorted = properties.toSorted((a, b) => a.name.localeCompare(b.name));
  return own.length < MIN_MEMBERS
    ? null
    : { type, names: sorted.map((property) => property.name), sources: sorted.map((property) => declarationKeys(property).toSorted().join(",")) };
}

interface Shape {
  readonly type: Type;
  readonly names: readonly string[];
  /** Each property's declaration keys, in `names` order; empty for a property the checker made with no declaration. */
  readonly sources: readonly string[];
}

// Two types whose every property resolves to the same declarations are two views of one source, as an
// `Awaited<ReturnType<typeof f>>` of a declared return type or two `Pick`s of one base, not two homes. A group holds one
// property-name set, so a side that adds a member of its own differs in that member's declarations and stays a candidate.
const oneSource = (a: Shape, b: Shape): boolean => a.sources.every((source, index) => source !== "" && source === b.sources[index]);

interface Pair {
  readonly key: string;
  readonly world: string;
  readonly first: Declared;
  readonly second: Declared;
  readonly names: readonly string[];
}

const nameOf = (node: Named): string => node.name.text;
// A declaration's text after its own name, so a twin of the same name in another file is not read as naming it.
const bodyOf = (node: Named): string => node.getText().slice(node.name.end - node.getStart(node.getSourceFile()));
const sideKey = (side: Declared): string => `${side.site.file}:${nameOf(side.node)}`;
// One declaration naming the other derives from it, not a second home.
const linked = (a: Declared, b: Declared): boolean =>
  new RegExp(`\\b${nameOf(b.node)}\\b`, "u").test(bodyOf(a.node)) || new RegExp(`\\b${nameOf(a.node)}\\b`, "u").test(bodyOf(b.node));

function restated(world: NativeWorld, types: readonly Declared[]): readonly Pair[] {
  const homes = types.filter((type) => type.form === "literal" || type.form === "inferred");
  const shapes = world.batch(homes.map(({ node }) => shapeOf(world, node)));
  const groups = new Map<string, { readonly declared: Declared; readonly shape: Shape }[]>();
  for (const [index, shape] of shapes.entries()) {
    const home = homes[index];
    if (shape !== null && home !== undefined) {
      const key = shape.names.join(",");
      groups.set(key, [...(groups.get(key) ?? []), { declared: home, shape }]);
    }
  }
  const candidates = [...groups.entries()].flatMap(([key, group]) =>
    group.flatMap((a, index) =>
      group
        .slice(index + 1)
        .filter((b) => a.declared.site.file !== b.declared.site.file && !linked(a.declared, b.declared) && !oneSource(a.shape, b.shape))
        // One orientation per pair, so two worlds that list the files in opposite order key the same pair.
        .map((b) => ({ ...(sideKey(a.declared) <= sideKey(b.declared) ? { a, b } : { a: b, b: a }), names: key.split(",") })),
    ),
  );
  const { checker } = world;
  const equal = world.batch(
    candidates.map(function* ({ a, b }) {
      return (yield* checker.isTypeAssignableTo.gen(a.shape.type, b.shape.type)) && (yield* checker.isTypeAssignableTo.gen(b.shape.type, a.shape.type));
    }),
  );
  return candidates.flatMap(({ a, b, names: members }, index) =>
    equal[index] === true
      ? [
          {
            key: [a.declared, b.declared].map(sideKey).join("="),
            world: world.config,
            first: a.declared,
            second: b.declared,
            names: members,
          },
        ]
      : [],
  );
}

/** A named finding and the site of its name, for engine two to look up. */
interface Located {
  readonly finding: UnwiredShape;
  readonly site: Site;
}

type Synonym = Declared & { readonly node: TypeAliasDeclaration & { readonly type: TypeReferenceNode } };

const isSynonym = (type: Declared): type is Synonym => type.form === "synonym" && isTypeAliasDeclaration(type.node) && isTypeReferenceNode(type.node.type);

// Whether the module that declares `node` exports it, under any name. An alias the checker cannot place counts as
// exported, so a resolution gap keeps its row.
function* exportedByModule(world: NativeWorld, node: Named): APIRequestGenerator<boolean> {
  const { checker } = world;
  const own = yield* checker.getSymbolAtLocation.gen(node.name);
  const module = yield* checker.getSymbolAtLocation.gen(node.getSourceFile());
  if (own === undefined || module === undefined) {
    return true;
  }
  const key = declarationKeys(own).join(",");
  for (const symbol of yield* checker.getExportsOfModule.gen(module)) {
    const target = hasFlag(symbol.flags, SymbolFlags.Alias) ? yield* checker.getAliasedSymbol.gen(symbol) : symbol;
    if (declarationKeys(target).join(",") === key) {
      return true;
    }
  }
  return false;
}

// A synonym's target: its file, or `external` for a library type. A library type has no home in the tree, so an alias
// its own file keeps private is a local spelling of it, not a second home; an exported one gives the tree a second name.
function synonyms(world: NativeWorld, types: readonly Declared[]): readonly Located[] {
  const aliases = types.filter(isSynonym);
  const targets = world.symbolsAt(aliases.map(({ node }) => node.type.typeName));
  const external = aliases.map((_, index) => {
    const handle = targets[index]?.declarations[0];
    return handle !== undefined && world.fileOf(handle) === null;
  });
  const local = aliases.filter((_, index) => external[index] === true);
  const answers = world.batch(local.map(({ node }) => exportedByModule(world, node)));
  const localExported = new Map(local.map((alias, index) => [alias, answers[index]] as const));
  return aliases.flatMap((alias, index): Located[] => {
    const { node, site, line } = alias;
    const target = targets[index];
    const handle = target?.declarations[0];
    if (target === undefined || handle === undefined || localExported.get(alias) === false) {
      return [];
    }
    const finding: UnwiredShape = {
      key: `${site.file}:${nameOf(node)}`,
      file: site.file,
      line,
      home: nameOf(node),
      member: target.name,
      kind: "synonym",
      at: [world.fileOf(handle) ?? "external"],
      perVerb: PER_VERB.test(nameOf(node)),
    };
    return [{ finding, site }];
  });
}

interface Hop {
  readonly file: string;
  readonly reexport: boolean;
}

// The alias hops from an export specifier to the symbol it finally names.
function* hopsOf(world: NativeWorld, specifier: ExportSpecifier): APIRequestGenerator<{ readonly hops: readonly Hop[]; readonly target: string }> {
  const hops: Hop[] = [];
  let symbol: NativeSymbol | undefined = yield* world.checker.getSymbolAtLocation.gen(specifier.name);
  while (symbol !== undefined && hasFlag(symbol.flags, SymbolFlags.Alias) && hops.length < MAX_HOPS) {
    const handle = symbol.declarations[0];
    const file = handle === undefined ? null : world.fileOf(handle);
    // A library's own re-exports are not a chain the tree can shorten.
    hops.push({ file: file ?? "external", reexport: file !== null && handle?.kind === SyntaxKind.ExportSpecifier });
    symbol = yield* world.checker.getImmediateAliasedSymbol.gen(symbol);
  }
  return { hops, target: symbol?.name ?? "" };
}

function reexports(world: NativeWorld): readonly Located[] {
  const specifiers: ExportSpecifier[] = [];
  eachProductionNode(world, (node) => {
    if (isExportSpecifier(node)) {
      specifiers.push(node);
    }
  });
  const walked = world.batch(specifiers.map((specifier) => hopsOf(world, specifier)));
  return specifiers.flatMap((specifier, index): Located[] => {
    const walk = walked[index];
    if (walk === undefined) {
      return [];
    }
    const site = world.siteOf(specifier.name);
    const exported = specifier.name.getText();
    const files = [...new Set(walk.hops.filter((hop) => hop.reexport).map((hop) => hop.file))];
    const base = {
      key: `${site.file}:export ${exported}`,
      file: site.file,
      line: lineOf(specifier),
      home: exported,
      member: walk.target,
      at: files,
      perVerb: false,
    };
    if (files.length >= 2) {
      return [{ finding: { ...base, kind: "reexport-chain" }, site }];
    }
    const renamed = walk.target !== "" && walk.target !== exported && walk.target !== "default";
    return renamed ? [{ finding: { ...base, kind: "renamed-reexport" }, site }] : [];
  });
}

// Engine two's checks, each in the world engine one found the finding in.
function serviceType(world: ServiceWorld, site: Site): ts.Type | undefined {
  const source = world.source(site.file);
  const name = source === undefined ? undefined : nameAt(source, site.position);
  const symbol = name === undefined ? undefined : world.checker.getSymbolAtLocation(name);
  return symbol === undefined ? undefined : world.checker.getDeclaredTypeOfSymbol(symbol);
}

function serviceRestates(world: ServiceWorld, pair: Pair): boolean {
  const a = serviceType(world, pair.first.site);
  const b = serviceType(world, pair.second.site);
  return a !== undefined && b !== undefined && world.checker.isTypeAssignableTo(a, b) && world.checker.isTypeAssignableTo(b, a);
}

function serviceHops(world: ServiceWorld, start: ts.Symbol | undefined): { readonly files: readonly string[]; readonly target: string } {
  const files = new Set<string>();
  let symbol = start;
  for (let hop = 0; symbol !== undefined && hasFlag(symbol.flags, ts.SymbolFlags.Alias) && hop < MAX_HOPS; hop++) {
    const declaration = symbol.declarations?.[0];
    const file = declaration !== undefined && ts.isExportSpecifier(declaration) ? world.siteOf(declaration).file : null;
    if (file !== null && !file.includes("node_modules")) {
      files.add(file);
    }
    symbol = world.checker.getImmediateAliasedSymbol(symbol);
  }
  return { files: [...files], target: symbol?.name ?? "" };
}

function serviceSynonym(world: ServiceWorld, name: ts.Node, member: string): boolean {
  const alias = name.parent;
  if (!(ts.isTypeAliasDeclaration(alias) && ts.isTypeReferenceNode(alias.type) && alias.type.typeArguments === undefined)) {
    return false;
  }
  const symbol = world.checker.getSymbolAtLocation(alias.type.typeName);
  const target = symbol !== undefined && hasFlag(symbol.flags, ts.SymbolFlags.Alias) ? world.checker.getAliasedSymbol(symbol) : symbol;
  return target?.name === member;
}

function serviceConfirms(world: ServiceWorld, { finding, site }: Located): boolean {
  const source = world.source(site.file);
  const name = source === undefined ? undefined : nameAt(source, site.position);
  if (name === undefined) {
    return false;
  }
  if (finding.kind === "synonym") {
    return serviceSynonym(world, name, finding.member);
  }
  const walk = serviceHops(world, world.checker.getSymbolAtLocation(name));
  return finding.kind === "reexport-chain" ? walk.files.length >= 2 : walk.target === finding.member;
}

const restatement = ({ key, first, second }: Pair): UnwiredShape => ({
  key,
  file: first.site.file,
  line: first.line,
  home: nameOf(first.node),
  member: nameOf(second.node),
  kind: "restated",
  at: [`${second.site.file}:${second.line}`],
  perVerb: PER_VERB.test(nameOf(first.node)) && PER_VERB.test(nameOf(second.node)),
});

// The file and name of each side of a restated pair, so a deliberate entry or the distinct registry naming either
// side covers the pair.
const sidesOf = ({ first, second }: Pair): readonly [DeliberateSide, DeliberateSide] => [
  { file: first.site.file, home: nameOf(first.node), member: nameOf(second.node) },
  { file: second.site.file, home: nameOf(second.node), member: nameOf(first.node) },
];

// The deliberate list first, then Core-0 §4's per-verb names, then the judged look-alikes; the rest is unwired.
function bucket(
  findings: readonly UnwiredShape[],
  options: ScanOptions,
  sides: ReadonlyMap<string, readonly [DeliberateSide, DeliberateSide]>,
  registry: DistinctRegistry,
): Pick<ShapesReport, "unwired" | "deliberate" | "distinct"> {
  const sorted = sortDeliberate(findings, options.deliberate, (finding) => sides.get(finding.key) ?? [finding]);
  const deliberate = [...sorted.deliberate];
  const unwired: UnwiredShape[] = [];
  const distinct: UnwiredShape[] = [];
  for (const finding of sorted.unwired) {
    const pair = sides.get(finding.key);
    if (finding.perVerb) {
      deliberate.push({ ...finding, reason: PER_VERB_REASON });
    } else if (pair !== undefined && isDistinctPair(registry, `${pair[0].file}#${pair[0].home}`, `${pair[1].file}#${pair[1].home}`)) {
      distinct.push(finding);
    } else {
      unwired.push(finding);
    }
  }
  return { unwired, deliberate, distinct };
}

/** Run both engines over the package worlds of `root` for second homes, synonyms and re-export chains; a test passes
 *  its own distinct registry. */
export function scanShapes(options: ScanOptions, distinct: DistinctRegistry = DISTINCT_LOOKALIKES): ShapesReport {
  const { worlds } = scanWorlds(options);
  const pairs = new Map<string, Pair>();
  const named = new Map<string, Located & { readonly world: string }>();
  let scanned = 0;
  for (const config of worlds) {
    using world = NativeWorld.open(options.root, config);
    const types = declared(world);
    scanned += types.length;
    for (const pair of restated(world, types)) {
      pairs.set(pair.key, pairs.get(pair.key) ?? pair);
    }
    for (const located of [...synonyms(world, types), ...reexports(world)]) {
      named.set(located.finding.key, named.get(located.finding.key) ?? { ...located, world: config });
    }
    options.log(`${config}: ${types.length} named types`);
  }
  const findings: UnwiredShape[] = [];
  const disagreements: string[] = [];
  for (const config of new Set([...[...pairs.values()].map((pair) => pair.world), ...[...named.values()].map((entry) => entry.world)])) {
    const world = ServiceWorld.open(options.root, config);
    const checks = [
      ...[...pairs.values()].filter((pair) => pair.world === config).map((pair) => ({ finding: restatement(pair), holds: serviceRestates(world, pair) })),
      ...[...named.values()].filter((entry) => entry.world === config).map((entry) => ({ finding: entry.finding, holds: serviceConfirms(world, entry) })),
    ];
    for (const { finding, holds } of checks) {
      if (holds) {
        findings.push(finding);
      } else {
        disagreements.push(finding.key);
      }
    }
    options.log(`${config}: engine two checked ${checks.length} findings`);
  }
  const sides = new Map([...pairs.values()].map((pair) => [pair.key, sidesOf(pair)] as const));
  return { scanned, ...bucket(findings, options, sides, distinct), disagreements, limits: SHAPE_LIMITS };
}
