// `pnpm unwired ports`: every port member that hand-restates another member, grouped into chains of identical
// members, each chain given one owner and each restating member the rewrite the derive codemod applies. It also
// lists every cross-domain import, whose shape moves to packages/contracts (Core-0 §4: never a sideways import).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import ts from "typescript";
import type { PortMember, Restatement } from "./restated-port.ts";
import { effectiveMember, isHandTyped, memberLabel, placementOf, RELATION, restatementsAt, tierRank } from "./restated-port.ts";
import { createWorldProgram, isProduction, packageWorlds } from "./worlds.ts";

/** What a target asks its leg to do. The codemod applies `derive` and `concept`; the others are judgment or hand work. */
export const TARGET_KINDS = ["derive", "concept", "narrowed", "move-to-contracts", "blocked-node-only", "hand"] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

/** The disjoint rewrite legs, by the file a target edits. */
export const LEGS = ["B", "C", "D", "E", "F"] as const;
export type Leg = (typeof LEGS)[number];

export const TARGET_FORMS = ["member", "collapse", "import"] as const;
export type TargetForm = (typeof TARGET_FORMS)[number];

export interface TargetImport {
  readonly name: string;
  readonly from: string;
}

/** An export the derive needs: `from` re-exports `name` through a door; `null` adds `export` to its declaration. */
export interface TargetExport {
  readonly file: string;
  readonly name: string;
  readonly from: string | null;
}

/** One member rewrite, one whole port collapsed into `Pick<Owner, …>`, or one cross-domain import. Lines are 1-based. */
export interface PortTarget {
  readonly leg: Leg;
  readonly kind: TargetKind;
  readonly form: TargetForm;
  readonly file: string;
  readonly line: number;
  /** The member, every member of a collapsed port in source order, or the names a cross-domain import takes. */
  readonly members: readonly string[];
  readonly port: string;
  readonly owner: string;
  readonly ownerAt: string;
  /** The replacement type text: a member's type, or a collapsed port's `Pick`. */
  readonly type: string | null;
  readonly imports: readonly TargetImport[];
  readonly exports: readonly TargetExport[];
  readonly note: string;
}

// The named kit types a concept member derives from: a clock, a random draw, an id mint. Clock and random members
// are found by name anywhere; an id mint only where a flow already ties it to another mint.
const CONCEPTS = [
  { names: ["now", "nowMs", "nowEpochMs"], returns: ts.SyntaxKind.NumberKeyword, type: "Clock", from: "@orb/kit/time", sweep: true },
  { names: ["random", "prng", "rng", "nextRandom"], returns: ts.SyntaxKind.NumberKeyword, type: "RandomSource", from: "@orb/kit/macro", sweep: true },
  {
    names: ["newOpaqueId", "mintId", "newBackgroundEntryId", "newEntryId"],
    returns: ts.SyntaxKind.StringKeyword,
    type: 'IdSource["uuid"]',
    from: "@orb/kit/ids",
    sweep: false,
  },
  { names: ["item", "objective"], returns: ts.SyntaxKind.StringKeyword, type: 'IdSource["unprefixed"]', from: "@orb/kit/ids", sweep: false },
] as const;
type Concept = (typeof CONCEPTS)[number];

function conceptOf(member: PortMember): Concept | null {
  const type = ts.isPropertySignature(member) ? member.type : undefined;
  if (type === undefined || !ts.isFunctionTypeNode(type) || type.parameters.length > 0) {
    return null;
  }
  const name = member.name.getText();
  return CONCEPTS.find((concept) => (concept.names as readonly string[]).includes(name) && type.type.kind === concept.returns) ?? null;
}

const LEG_OF: readonly (readonly [RegExp, Leg])[] = [
  [/^packages\/server\/src\/(?:entry\/(?:http|boot|auth)|domain\/sessions)\//u, "B"],
  [/^packages\/server\/src\/(?:entry|transport)\//u, "C"],
  [/^packages\/server\/src\/domain\/chat\//u, "D"],
  [/^packages\/server\/src\//u, "E"],
];

const legOf = (file: string): Leg => LEG_OF.find(([pattern]) => pattern.test(file))?.[1] ?? "F";

interface Pair {
  readonly restating: string;
  readonly owner: string;
  readonly source: string;
  readonly relation: Restatement["relation"];
}

interface CrossImport {
  readonly file: string;
  readonly line: number;
  readonly specifier: string;
  readonly names: readonly string[];
  readonly from: string;
  readonly note: string;
  readonly nodeOnly: boolean;
}

interface WorldCount {
  readonly config: string;
  readonly files: number;
  readonly pairs: number;
}

/** The census of one tree: the restating pairs and cross-domain imports across every package world, then the targets. */
export interface PortCensus {
  readonly targets: readonly PortTarget[];
  readonly worlds: readonly WorldCount[];
}

interface Indexed {
  readonly key: string;
  readonly member: PortMember;
  readonly file: string;
  readonly line: number;
}

const lineOf = (node: ts.Node): number => {
  const source = node.getSourceFile();
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
};

const keyOf = (root: string, member: PortMember): string => `${relative(root, member.getSourceFile().fileName)}:${lineOf(member)}:${member.name.getText()}`;

const fileOfKey = (key: string): string => key.slice(0, key.indexOf(":"));

const placementOfKey = (key: string): ReturnType<typeof placementOf> => placementOf(`/${fileOfKey(key)}`);

function rankOfKey(key: string): number {
  const placement = placementOfKey(key);
  return placement === null ? Number.MAX_SAFE_INTEGER : tierRank(placement);
}

const aliased = (checker: ts.TypeChecker, symbol: ts.Symbol | undefined): ts.Symbol | undefined =>
  // biome-ignore lint/suspicious/noBitwiseOperators: SymbolFlags is a compiler-owned bitfield.
  symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;

// Where a declaration may live for its shape to move into packages/contracts: contracts, kit, the standard library,
// the repository's ambient declarations, or a package contracts already depends on.
const CONTRACTS_REACH = [
  /^packages\/(?:contracts|kit)\//u,
  /typescript\/lib\/lib\./u,
  /^[^/]+\.d\.ts$/u,
  /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:zod|@total-typescript\/ts-reset)\//u,
];
// What a name outside that reach is: a server shape moves with it; the others block the move for a ruling.
const FOREIGN_HOMES = [
  { kind: "server", pattern: /^packages\/(?:server|default-content)\//u },
  { kind: "db", pattern: /^packages\/db\/|drizzle-orm/u },
  { kind: "inference", pattern: /^packages\/inference\//u },
] as const;
type ForeignKind = (typeof FOREIGN_HOMES)[number]["kind"] | "node";
type Foreign = Readonly<Record<ForeignKind, readonly string[]>>;

function foreignKind(file: string): ForeignKind | null {
  if (CONTRACTS_REACH.some((pattern) => pattern.test(file))) {
    return null;
  }
  return FOREIGN_HOMES.find(({ pattern }) => pattern.test(file))?.kind ?? "node";
}

// The names a declaration mentions that packages/contracts cannot reach.
function foreignNames(root: string, checker: ts.TypeChecker, node: ts.Node): Foreign {
  const found: Record<ForeignKind, Set<string>> = { server: new Set(), db: new Set(), inference: new Set(), node: new Set() };
  const visit = (child: ts.Node): void => {
    if (ts.isTypeReferenceNode(child)) {
      for (const declaration of aliased(checker, checker.getSymbolAtLocation(child.typeName))?.declarations ?? []) {
        const kind = foreignKind(relative(root, declaration.getSourceFile().fileName));
        if (kind !== null) {
          found[kind].add(child.typeName.getText());
        }
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return { server: [...found.server].sort(), db: [...found.db].sort(), inference: [...found.inference].sort(), node: [...found.node].sort() };
}

const blocking = (foreign: Foreign): boolean => foreign.node.length + foreign.db.length + foreign.inference.length > 0;

function describeForeign(foreign: Foreign): string {
  const labels: Readonly<Record<ForeignKind, string>> = { node: "node-only", db: "db-only", inference: "inference-only", server: "moves with it" };
  return (Object.keys(labels) as ForeignKind[])
    .filter((kind) => foreign[kind].length > 0)
    .map((kind) => `${labels[kind]}: ${foreign[kind].join(", ")}`)
    .join("; ");
}

const mergeForeign = (parts: readonly Foreign[]): Foreign => ({
  server: [...new Set(parts.flatMap((part) => part.server))].sort(),
  db: [...new Set(parts.flatMap((part) => part.db))].sort(),
  inference: [...new Set(parts.flatMap((part) => part.inference))].sort(),
  node: [...new Set(parts.flatMap((part) => part.node))].sort(),
});

// --- Pass 1: pairs, concept members and cross-domain imports, world by world --------------------------------

interface Collected {
  readonly pairs: Map<string, Pair>;
  readonly concepts: Set<string>;
  readonly crossImports: Map<string, CrossImport>;
}

function collectRestatements(root: string, checker: ts.TypeChecker, source: ts.SourceFile, into: Collected): void {
  const visit = (node: ts.Node): void => {
    if ((ts.isPropertySignature(node) || ts.isMethodSignature(node)) && isHandTyped(node) && conceptOf(node)?.sweep === true) {
      into.concepts.add(keyOf(root, node));
    }
    for (const found of restatementsAt(checker, node)) {
      const pair = { restating: keyOf(root, found.restating), owner: keyOf(root, found.owner), source: keyOf(root, found.source), relation: found.relation };
      into.pairs.set(`${pair.restating}>${pair.owner}`, pair);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function importedNames(statement: ts.ImportDeclaration | ts.ExportDeclaration): readonly string[] {
  if (ts.isExportDeclaration(statement)) {
    return statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)
      ? statement.exportClause.elements.map((element) => (element.propertyName ?? element.name).getText())
      : ["*"];
  }
  const bindings = statement.importClause?.namedBindings;
  if (bindings === undefined) {
    return statement.importClause?.name === undefined ? [] : ["default"];
  }
  return ts.isNamedImports(bindings) ? bindings.elements.map((element) => (element.propertyName ?? element.name).getText()) : ["*"];
}

function moduleTarget(checker: ts.TypeChecker, specifier: ts.StringLiteral): { readonly module: ts.Symbol; readonly file: string } | null {
  const module = checker.getSymbolAtLocation(specifier);
  const file = module?.valueDeclaration?.getSourceFile().fileName ?? module?.declarations?.[0]?.getSourceFile().fileName;
  return module === undefined || file === undefined ? null : { module, file };
}

type ModuleStatement = ts.ImportDeclaration | ts.ExportDeclaration;

// D117: the one ruled cross-domain import, the workloads door's `WorkloadContribution`, whose AbortSignal keeps it out of contracts.
const D117_DOOR = { domain: "workloads", names: new Set(["WorkloadContribution"]) };

// The other domain a statement imports from, or null for a same-domain or non-domain module.
function crossDomainTarget(
  checker: ts.TypeChecker,
  statement: ts.Statement,
  domain: string,
): { readonly statement: ModuleStatement; readonly module: ts.Symbol; readonly domain: string } | null {
  if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))) {
    return null;
  }
  const specifier = statement.moduleSpecifier;
  const target = specifier !== undefined && ts.isStringLiteral(specifier) ? moduleTarget(checker, specifier) : null;
  const targetDomain = target === null ? null : (placementOf(target.file)?.domain ?? null);
  return target === null || targetDomain === null || targetDomain === domain ? null : { statement, module: target.module, domain: targetDomain };
}

function collectCrossImports(root: string, checker: ts.TypeChecker, source: ts.SourceFile, into: Collected): void {
  const domain = placementOf(source.fileName)?.domain ?? null;
  if (domain === null) {
    return;
  }
  const file = relative(root, source.fileName);
  for (const candidate of source.statements) {
    const cross = crossDomainTarget(checker, candidate, domain);
    if (cross === null) {
      continue;
    }
    const names = importedNames(cross.statement);
    if (cross.domain === D117_DOOR.domain && names.every((name) => D117_DOOR.names.has(name))) {
      continue;
    }
    const exports = checker.getExportsOfModule(cross.module);
    const declarations = names.flatMap(
      (name) =>
        aliased(
          checker,
          exports.find((symbol) => symbol.name === name),
        )?.declarations ?? [],
    );
    const merged = mergeForeign(declarations.map((declaration) => foreignNames(root, checker, declaration)));
    const line = lineOf(cross.statement);
    into.crossImports.set(`${file}:${line}`, {
      file,
      line,
      specifier: cross.statement.moduleSpecifier?.getText().slice(1, -1) ?? "",
      names,
      from: [...new Set(declarations.map((declaration) => `${relative(root, declaration.getSourceFile().fileName)}:${lineOf(declaration)}`))].join(", "),
      note: [`domain ${domain} takes these from domain ${cross.domain}`, describeForeign(merged)].filter((part) => part !== "").join("; "),
      nodeOnly: blocking(merged),
    });
  }
}

// --- Owner choice ------------------------------------------------------------------------------------------

// Union-find over identical pairs: each chain of members that restate one another.
function chainsOf(pairs: readonly Pair[]): ReadonlyMap<string, readonly string[]> {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let current = key;
    for (let next = parent.get(current); next !== undefined && next !== current; next = parent.get(current)) {
      current = next;
    }
    return current;
  };
  for (const pair of pairs) {
    parent.set(pair.restating, parent.get(pair.restating) ?? pair.restating);
    parent.set(pair.owner, parent.get(pair.owner) ?? pair.owner);
    if (pair.relation === RELATION.identical) {
      parent.set(find(pair.restating), find(pair.owner));
    }
  }
  const byHead = new Map<string, string[]>();
  for (const key of parent.keys()) {
    const head = find(key);
    byHead.set(head, [...(byHead.get(head) ?? []), key]);
  }
  const chains = new Map<string, readonly string[]>();
  for (const members of byHead.values()) {
    for (const key of members) {
      chains.set(key, members);
    }
  }
  return chains;
}

/** The lowest-tier member of a chain; a tie goes to the member no value flows into (the implemented one). */
// A contract file is a shape's home; a service or composition file beside it is not.
const CONTRACT_HOME = /^packages\/(?:contracts|kit)\/|\/contract(?:\/|\.ts:)/u;

function chooseOwner(chain: readonly string[], fed: ReadonlySet<string>): string {
  const lowest = Math.min(...chain.map(rankOfKey));
  const tier = chain.filter((key) => rankOfKey(key) === lowest).sort();
  const contracts = tier.filter((key) => CONTRACT_HOME.test(key));
  const lows = contracts.length > 0 ? contracts : tier;
  const sources = lows.filter((key) => !fed.has(key));
  const pick = sources.length === 1 ? sources[0] : lows[0];
  return pick ?? chain[0] ?? "";
}

// --- Pass 2: plan each member in its own package's world ---------------------------------------------------

interface PlanContext {
  readonly root: string;
  readonly program: ts.Program;
  readonly checker: ts.TypeChecker;
  readonly nodes: ReadonlyMap<string, Indexed>;
  readonly chains: ReadonlyMap<string, readonly string[]>;
  readonly pairs: readonly Pair[];
  readonly fed: ReadonlySet<string>;
  /** Each production file's imported files, filled as the cycle check walks them. */
  readonly imports: Map<string, readonly string[]>;
}

interface Plan {
  readonly kind: TargetKind;
  readonly type: string | null;
  readonly imports: readonly TargetImport[];
  readonly exports: readonly TargetExport[];
  readonly note: string;
}

const handPlan = (note: string, type: string | null = null): Plan => ({ kind: "hand", type, imports: [], exports: [], note });

// The text that names `member` from outside: `Home["m"]`, through nested type literals as `Home["a"]["m"]`.
function accessPath(member: PortMember): { readonly home: ts.InterfaceDeclaration | ts.TypeAliasDeclaration; readonly path: string } | null {
  const segments = [member.name.getText()];
  let container: ts.Node = member.parent;
  while (
    ts.isTypeLiteralNode(container) &&
    ts.isPropertySignature(container.parent) &&
    (ts.isInterfaceDeclaration(container.parent.parent) || ts.isTypeLiteralNode(container.parent.parent))
  ) {
    segments.unshift(container.parent.name.getText());
    container = container.parent.parent;
  }
  const alias = ts.isTypeLiteralNode(container) && ts.isTypeAliasDeclaration(container.parent) ? container.parent : null;
  const declaration = ts.isInterfaceDeclaration(container) ? container : alias;
  if (declaration === null || declaration.typeParameters !== undefined) {
    return null;
  }
  return { home: declaration, path: `${declaration.name.text}${segments.map((segment) => `["${segment}"]`).join("")}` };
}

// The door another area imports a file through: a server area's index.ts, else the nearest exported package door.
function areaDoor(root: string, ownerFile: string): { readonly specifier: string; readonly file: string } | null {
  const server = /^packages\/server\/src\/([^/]+\/[^/]+)\//u.exec(ownerFile);
  if (server !== null) {
    const file = `packages/server/src/${server[1]}/index.ts`;
    return existsSync(join(root, file)) ? { specifier: `#${server[1]}`, file } : null;
  }
  const [, pkg = "", inner = ""] = /^packages\/([^/]+)\/src\/(.+)$/u.exec(ownerFile) ?? [];
  const manifest = JSON.parse(readFileSync(join(root, "packages", pkg, "package.json"), "utf8")) as { readonly exports?: Readonly<Record<string, unknown>> };
  for (let dir = dirname(inner); dir !== "." && dir !== ""; dir = dirname(dir)) {
    if (manifest.exports?.[`./${dir}`] !== undefined && existsSync(join(root, "packages", pkg, "src", dir, "index.ts"))) {
      return { specifier: `@orb/${pkg}/${dir}`, file: `packages/${pkg}/src/${dir}/index.ts` };
    }
  }
  return null;
}

function exportsSymbol(context: PlanContext, file: string, target: ts.Symbol): boolean {
  const source = context.program.getSourceFile(join(context.root, file));
  const module = source === undefined ? undefined : context.checker.getSymbolAtLocation(source);
  return module !== undefined && context.checker.getExportsOfModule(module).some((symbol) => aliased(context.checker, symbol) === target);
}

const areaOf = (file: string): string => /^packages\/server\/src\/([^/]+\/[^/]+)\//u.exec(file)?.[1] ?? /^packages\/([^/]+)\//u.exec(file)?.[1] ?? file;

function relativeSpecifier(fromFile: string, toFile: string): string {
  const path = relative(dirname(fromFile), toFile).replaceAll("\\", "/");
  return path.startsWith(".") ? path : `./${path}`;
}

function importsOf(context: PlanContext, file: string): readonly string[] {
  const known = context.imports.get(file);
  if (known !== undefined) {
    return known;
  }
  const source = context.program.getSourceFile(join(context.root, file));
  const found = (source?.statements ?? []).flatMap((statement) => {
    const specifier = ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement) ? statement.moduleSpecifier : undefined;
    const target = specifier !== undefined && ts.isStringLiteral(specifier) ? moduleTarget(context.checker, specifier) : null;
    const rel = target === null ? "" : relative(context.root, target.file);
    return isProduction(rel) ? [rel] : [];
  });
  context.imports.set(file, found);
  return found;
}

// Would importing `module` from `importer` close a cycle? dependency-cruiser refuses one, type-only or not.
function reaches(context: PlanContext, module: string, importer: string): boolean {
  const seen = new Set<string>([module]);
  const queue = [module];
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    if (next === importer) {
      return true;
    }
    for (const file of importsOf(context, next).filter((candidate) => !seen.has(candidate))) {
      seen.add(file);
      queue.push(file);
    }
  }
  return false;
}

function planDerive(context: PlanContext, port: PortMember, owner: PortMember): Plan {
  const access = accessPath(owner);
  if (access === null) {
    return handPlan(`${memberLabel(owner)} sits in a generic or non-port type: name its shape, then derive`);
  }
  const importer = relative(context.root, port.getSourceFile().fileName);
  const ownerFile = relative(context.root, owner.getSourceFile().fileName);
  const home = context.checker.getSymbolAtLocation(access.home.name);
  const name = access.home.name.text;
  const inScope = aliased(
    context.checker,
    context.checker.getSymbolsInScope(port, ts.SymbolFlags.Type).find((symbol) => symbol.name === name),
  );
  if (importer === ownerFile || (inScope !== undefined && inScope === home)) {
    return { kind: "derive", type: access.path, imports: [], exports: [], note: "" };
  }
  if (inScope !== undefined || home === undefined) {
    return handPlan(`${name} already names another type in ${importer}`, access.path);
  }
  const ownerExport: TargetExport[] = exportsSymbol(context, ownerFile, home) ? [] : [{ file: ownerFile, name, from: null }];
  if (areaOf(importer) === areaOf(ownerFile)) {
    if (reaches(context, ownerFile, importer)) {
      return handPlan(`${ownerFile} already imports ${importer}: move ${name}'s shape to a contract file both import`, access.path);
    }
    return { kind: "derive", type: access.path, imports: [{ name, from: relativeSpecifier(importer, ownerFile) }], exports: ownerExport, note: "" };
  }
  const door = areaDoor(context.root, ownerFile);
  if (door === null) {
    return handPlan(`${ownerFile} has no front door for ${importer} to import ${name} through`, access.path);
  }
  if (reaches(context, door.file, importer)) {
    return handPlan(`${door.specifier} already imports ${importer}: deriving ${name} through it closes a cycle`, access.path);
  }
  const doorExport: TargetExport[] = exportsSymbol(context, door.file, home) ? [] : [{ file: door.file, name, from: relativeSpecifier(door.file, ownerFile) }];
  return { kind: "derive", type: access.path, imports: [{ name, from: door.specifier }], exports: [...ownerExport, ...doorExport], note: "" };
}

function planCrossDomain(context: PlanContext, owner: PortMember): Plan {
  const foreign = foreignNames(context.root, context.checker, owner);
  return { kind: blocking(foreign) ? "blocked-node-only" : "move-to-contracts", type: null, imports: [], exports: [], note: describeForeign(foreign) };
}

const isCrossDomain = (from: string, to: string): boolean => {
  const a = placementOfKey(from)?.domain ?? null;
  const b = placementOfKey(to)?.domain ?? null;
  return a !== null && b !== null && a !== b;
};

function planChainOwner(context: PlanContext, node: Indexed, chain: readonly string[]): Plan | null {
  const domains = new Set(chain.map((key) => placementOfKey(key)?.domain ?? null));
  return domains.size > 1 && !domains.has(null) ? planCrossDomain(context, node.member) : null;
}

function planRestating(context: PlanContext, node: Indexed, chain: readonly string[], ownerKey: string): Plan & { readonly owner: string } {
  const ownerNode = context.nodes.get(ownerKey);
  if (ownerNode === undefined) {
    return { ...handPlan("the owner sits outside this package's world"), owner: ownerKey };
  }
  const owner = effectiveMember(context.checker, ownerNode.member);
  if (isCrossDomain(node.key, ownerKey)) {
    return { ...planCrossDomain(context, owner), owner: memberLabel(owner) };
  }
  const plan = planDerive(context, node.member, owner);
  const kind = chain.length === 1 && plan.kind === "derive" ? "narrowed" : plan.kind;
  return { ...plan, kind, owner: memberLabel(owner) };
}

function planMember(context: PlanContext, node: Indexed): PortTarget | null {
  const { member } = node;
  const base = {
    leg: legOf(node.file),
    form: "member" as const,
    file: node.file,
    line: node.line,
    members: [member.name.getText()],
    port: memberLabel(member),
  };
  const concept = conceptOf(member);
  if (concept !== null) {
    const name = concept.type.replace(/\[.*$/u, "");
    return {
      ...base,
      kind: "concept",
      owner: concept.type,
      ownerAt: concept.from,
      type: concept.type,
      imports: [{ name, from: concept.from }],
      exports: [],
      note: "",
    };
  }
  const chain = context.chains.get(node.key) ?? [node.key];
  const narrowed = context.pairs.find((pair) => pair.restating === node.key && pair.relation === RELATION.narrowed);
  const ownerKey = chain.length > 1 ? chooseOwner(chain, context.fed) : (narrowed?.owner ?? null);
  if (ownerKey === null) {
    return null;
  }
  const ownerAt = ownerKey.slice(0, ownerKey.lastIndexOf(":"));
  if (ownerKey === node.key) {
    const plan = planChainOwner(context, node, chain);
    return plan === null ? null : { ...base, ...plan, owner: memberLabel(member), ownerAt };
  }
  return { ...base, ...planRestating(context, node, chain, ownerKey), ownerAt };
}

function indexMembers(root: string, program: ts.Program): ReadonlyMap<string, Indexed> {
  const nodes = new Map<string, Indexed>();
  for (const source of program.getSourceFiles()) {
    const file = relative(root, source.fileName);
    if (source.isDeclarationFile || !isProduction(file)) {
      continue;
    }
    const visit = (node: ts.Node): void => {
      if (ts.isPropertySignature(node) || ts.isMethodSignature(node)) {
        const key = keyOf(root, node);
        nodes.set(key, { key, member: node, file, line: lineOf(node) });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return nodes;
}

const HOME_OF_ACCESS = /^([A-Za-z_$][\w$]*)\["[^"]+"\]$/u;

// A port whose members all derive from one home collapses to `Pick<Home, …>`. The codemod collapses only when these
// are every member the port declares, and keeps member form otherwise.
function collapse(targets: readonly PortTarget[]): PortTarget[] {
  const byPort = new Map<string, PortTarget[]>();
  for (const target of targets) {
    const key = target.form === "member" ? `${target.file}|${target.port.slice(0, target.port.lastIndexOf("."))}` : `${target.file}:${target.line}`;
    byPort.set(key, [...(byPort.get(key) ?? []), target]);
  }
  return [...byPort.values()].flatMap((group): PortTarget[] => {
    const homes = new Set(group.map((target) => HOME_OF_ACCESS.exec(target.type ?? "")?.[1] ?? ""));
    const [home = ""] = homes;
    const [first] = group;
    const collapsible = first !== undefined && group.length > 1 && homes.size === 1 && home !== "" && group.every((target) => target.kind === "derive");
    if (!collapsible) {
      return group;
    }
    const members = group.map((target) => target.members[0] ?? "");
    const exports = [...new Map(group.flatMap((target) => target.exports).map((entry) => [`${entry.file}|${entry.name}`, entry])).values()];
    const line = Math.min(...group.map((target) => target.line));
    return [{ ...first, form: "collapse", line, members, type: `Pick<${home}, ${members.map((name) => `"${name}"`).join(" | ")}>`, exports }];
  });
}

function crossImportTargets(imports: Iterable<CrossImport>): PortTarget[] {
  return [...imports].map(
    (entry): PortTarget => ({
      leg: legOf(entry.file),
      kind: entry.nodeOnly ? "blocked-node-only" : "move-to-contracts",
      form: "import",
      file: entry.file,
      line: entry.line,
      members: entry.names,
      port: `import from ${entry.specifier}`,
      owner: entry.specifier,
      ownerAt: entry.from,
      type: null,
      imports: [],
      exports: [],
      note: entry.note,
    }),
  );
}

function planWorld(
  root: string,
  config: string,
  keys: readonly string[],
  shared: Omit<PlanContext, "root" | "program" | "checker" | "nodes" | "imports">,
): PortTarget[] {
  const program = createWorldProgram(root, config);
  const context: PlanContext = { ...shared, root, program, checker: program.getTypeChecker(), nodes: indexMembers(root, program), imports: new Map() };
  return keys.flatMap((key) => {
    const node = context.nodes.get(key);
    const target = node === undefined ? null : planMember(context, node);
    return target === null ? [] : [target];
  });
}

/** Run the census over every package world in `root`, one program at a time. */
export function portCensus(root: string, log: (line: string) => void): PortCensus {
  const collected: Collected = { pairs: new Map(), concepts: new Set(), crossImports: new Map() };
  const worlds: WorldCount[] = [];
  for (const config of packageWorlds(root)) {
    const before = collected.pairs.size;
    const program = createWorldProgram(root, config);
    const checker = program.getTypeChecker();
    for (const source of program.getSourceFiles().filter((file) => !file.isDeclarationFile && isProduction(relative(root, file.fileName)))) {
      collectRestatements(root, checker, source, collected);
      collectCrossImports(root, checker, source, collected);
    }
    worlds.push({ config, files: program.getSourceFiles().length, pairs: collected.pairs.size - before });
    log(`${config}: ${collected.pairs.size - before} new pairs`);
  }
  const pairs = [...collected.pairs.values()];
  // The member a value flows into: the restating side unless the restating member is the value's own source.
  const fed = new Set(pairs.map((pair) => (pair.source === pair.restating ? pair.owner : pair.restating)));
  const chains = chainsOf(pairs);
  const keys = [...new Set([...pairs.flatMap((pair) => [pair.restating, pair.owner]), ...collected.concepts])];
  const targets = crossImportTargets(collected.crossImports.values());
  for (const config of packageWorlds(root)) {
    const pkg = /^packages\/([^/]+)\//u.exec(config)?.[1] ?? "";
    const mine = keys.filter((key) => key.startsWith(`packages/${pkg}/`));
    if (mine.length > 0) {
      targets.push(...planWorld(root, config, mine, { chains, pairs, fed }));
      log(`${config}: planned ${mine.length} members`);
    }
  }
  return { targets: collapse(targets).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line), worlds };
}
