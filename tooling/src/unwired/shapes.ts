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
import { ServiceWorld } from "./language-service.ts";
import { hasFlag, NativeWorld } from "./native.ts";
import type { ScanOptions } from "./scan.ts";
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
  /** A synonym in a domain's `contract/params.ts` or `contract/results.ts`, the per-verb names Core-0 §4 keeps. */
  readonly perVerb: boolean;
}

export interface ShapesReport {
  readonly scanned: number;
  readonly unwired: readonly UnwiredShape[];
  readonly deliberate: readonly (UnwiredShape & { readonly reason: string })[];
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
const PER_VERB = /^packages\/server\/src\/domain\/[^/]+\/contract\/(?:params|results)\.ts$/u;
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
  if (isTypeQueryNode(type)) {
    return "inferred";
  }
  // `(typeof value)["key"]` reads a value's own shape; `Router["listRules"][number]` reads another named type's.
  if (isIndexedAccessTypeNode(type)) {
    let object = type.objectType;
    while (isIndexedAccessTypeNode(object)) {
      object = object.objectType;
    }
    return isTypeQueryNode(object) ? "inferred" : "derived";
  }
  if (!isTypeReferenceNode(type)) {
    return "derived";
  }
  if (type.typeArguments === undefined) {
    return "synonym";
  }
  return INFERRED.has(type.typeName.getText()) ? "inferred" : "derived";
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
function* shapeOf(world: NativeWorld, node: Named): APIRequestGenerator<{ readonly type: Type; readonly names: readonly string[] } | null> {
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
  return own.length < MIN_MEMBERS ? null : { type, names: properties.map((property) => property.name).sort() };
}

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
// One declaration naming the other derives from it, not a second home.
const linked = (a: Declared, b: Declared): boolean =>
  new RegExp(`\\b${nameOf(b.node)}\\b`, "u").test(bodyOf(a.node)) || new RegExp(`\\b${nameOf(a.node)}\\b`, "u").test(bodyOf(b.node));

function restated(world: NativeWorld, types: readonly Declared[]): readonly Pair[] {
  const homes = types.filter((type) => type.form === "literal" || type.form === "inferred");
  const shapes = world.batch(homes.map(({ node }) => shapeOf(world, node)));
  const groups = new Map<string, { readonly declared: Declared; readonly type: Type }[]>();
  for (const [index, shape] of shapes.entries()) {
    const home = homes[index];
    if (shape !== null && home !== undefined) {
      const key = shape.names.join(",");
      groups.set(key, [...(groups.get(key) ?? []), { declared: home, type: shape.type }]);
    }
  }
  const candidates = [...groups.entries()].flatMap(([key, group]) =>
    group.flatMap((a, index) =>
      group
        .slice(index + 1)
        .filter((b) => a.declared.site.file !== b.declared.site.file && !linked(a.declared, b.declared))
        .map((b) => ({ a, b, names: key.split(",") })),
    ),
  );
  const { checker } = world;
  const equal = world.batch(
    candidates.map(function* ({ a, b }) {
      return (yield* checker.isTypeAssignableTo.gen(a.type, b.type)) && (yield* checker.isTypeAssignableTo.gen(b.type, a.type));
    }),
  );
  return candidates.flatMap(({ a, b, names: members }, index) =>
    equal[index] === true
      ? [
          {
            key: [a.declared, b.declared].map((side) => `${side.site.file}:${nameOf(side.node)}`).join("="),
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

// A synonym's target: its file, or `external` for a library type.
function synonyms(world: NativeWorld, types: readonly Declared[]): readonly Located[] {
  const aliases = types.filter(isSynonym);
  const targets = world.symbolsAt(aliases.map(({ node }) => node.type.typeName));
  return aliases.flatMap(({ node, site, line }, index): Located[] => {
    const target = targets[index];
    const handle = target?.declarations[0];
    if (target === undefined || handle === undefined) {
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
      perVerb: PER_VERB.test(site.file),
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
  perVerb: false,
});

/** Run both engines over the package worlds of `root` for second homes, synonyms and re-export chains. */
export function scanShapes(options: ScanOptions): ShapesReport {
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
  return { scanned, ...sortDeliberate(findings, options.deliberate), disagreements, limits: SHAPE_LIMITS };
}
