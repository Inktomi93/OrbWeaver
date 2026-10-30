// `pnpm unwired ports`: each hand-restated port member planned against its chain's one owner, each cross-domain import
// (its shape moves to packages/contracts, Core-0 §4) and each type a door forgot to export. Only a flow, a type
// reference or an alias makes two shapes one concept; every target lands in the cluster of its concept's owner.
import { relative } from "node:path";
import ts from "typescript";
import { ImportGraph } from "./doors.ts";
import { aliased, foreignTypes, mergeForeignTypes, passesDbHandle } from "./foreign-types.ts";
import type { ForgottenExport } from "./forgotten-exports.ts";
import { forgottenDoorExports } from "./forgotten-exports.ts";
import type { PlanContext } from "./port-plan.ts";
import { collapse, doorExportTargets, planMember } from "./port-plan.ts";
import type { Indexed, Pair, PlannedTarget, PortTarget, TargetKind } from "./port-targets.ts";
import { clustered, conceptOf, crossDomainKind, crossDomainNote, keyOf, legOf, lineOf } from "./port-targets.ts";
import type { Flow, PortMember, TypeFlow } from "./restated-port.ts";
import {
  aliasOf,
  derivedMembers,
  flowMembers,
  flowsAt,
  homeFileOf,
  isContractFile,
  isHandTyped,
  placementOf,
  restatementOf,
  tierRank,
} from "./restated-port.ts";
import { createWorldProgram, isProduction, packageWorlds } from "./worlds.ts";

interface WorldCount {
  readonly config: string;
  readonly files: number;
  readonly pairs: number;
}

/** The census of one tree: the restating pairs, cross-domain imports and forgotten door exports, then the targets. */
export interface PortCensus {
  readonly targets: readonly PortTarget[];
  readonly worlds: readonly WorldCount[];
}

// --- Concept links -----------------------------------------------------------------------------------------

// Union-find over census keys: two keys share a root when a real flow, a type reference or an alias joins them.
class Links {
  readonly #parent = new Map<string, string>();

  root(key: string): string {
    let current = key;
    for (let next = this.#parent.get(current); next !== undefined && next !== current; next = this.#parent.get(current)) {
      current = next;
    }
    return current;
  }

  join(a: string | null, b: string | null): void {
    if (a !== null && b !== null && a !== b) {
      this.#parent.set(this.root(a), this.root(b));
    }
  }

  linked(a: string, b: string): boolean {
    return this.root(a) === this.root(b);
  }
}

type Declared = ts.InterfaceDeclaration | ts.TypeAliasDeclaration;

const declarationKey = (root: string, declaration: Declared): string =>
  `${relative(root, declaration.getSourceFile().fileName)}:${lineOf(declaration)}:${declaration.name.text}`;

// The interface or alias a type is named by, as a census key; null for an anonymous or library type.
function namedKey(root: string, type: ts.Type): string | null {
  const declaration = (type.aliasSymbol ?? type.getSymbol())?.declarations?.[0];
  if (declaration === undefined || !(ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration))) {
    return null;
  }
  return isProduction(relative(root, declaration.getSourceFile().fileName)) ? declarationKey(root, declaration) : null;
}

interface LinkContext {
  readonly root: string;
  readonly checker: ts.TypeChecker;
  readonly links: Links;
}

// The named types at each parameter position and the awaited return of two linked members: one concept's data.
function linkSignatures({ root, checker, links }: LinkContext, port: PortMember, owner: PortMember): void {
  const [mine] = checker.getTypeAtLocation(port).getNonNullableType().getCallSignatures();
  const [theirs] = checker.getTypeAtLocation(owner).getNonNullableType().getCallSignatures();
  if (mine === undefined || theirs === undefined) {
    return;
  }
  mine.parameters.forEach((parameter, index) => {
    const other = theirs.parameters[index];
    if (other !== undefined) {
      links.join(namedKey(root, checker.getTypeOfSymbol(parameter)), namedKey(root, checker.getTypeOfSymbol(other)));
    }
  });
  const awaited = (signature: ts.Signature): ts.Type => checker.getAwaitedType(signature.getReturnType()) ?? signature.getReturnType();
  links.join(namedKey(root, awaited(mine)), namedKey(root, awaited(theirs)));
}

function linkMember({ root, checker, links }: LinkContext, member: PortMember): string {
  const key = keyOf(root, member);
  const alias = aliasOf(checker, member);
  links.join(key, alias === null ? null : declarationKey(root, alias));
  return key;
}

function linkTypeFlow(root: string, flow: TypeFlow, links: Links): void {
  links.join(namedKey(root, flow.slot), namedKey(root, flow.value));
}

// `type B = A` and `type Op = NonNullable<Owner["m"]>` name one concept with two names.
function linkAlias({ root, checker, links }: LinkContext, alias: ts.TypeAliasDeclaration): void {
  const key = declarationKey(root, alias);
  for (const member of derivedMembers(checker, alias.type)) {
    links.join(key, keyOf(root, member));
  }
  if (ts.isTypeReferenceNode(alias.type)) {
    links.join(key, namedKey(root, checker.getTypeFromTypeNode(alias.type)));
  }
}

// --- Pass 1: pairs, concept links, member reads and cross-domain imports, world by world ---------------------

// Where a chain member's shape lives (the alias it is typed by, else its own file) and whether it is typed by a name.
interface Home {
  readonly rank: number;
  readonly file: string;
  readonly named: boolean;
}

interface Collected {
  readonly pairs: Map<string, Pair>;
  readonly concepts: Set<string>;
  readonly homes: Map<string, Home>;
  readonly links: Links;
  /** `consumerDomain|ownerDeclarationKey` to the member names that domain reads off the owner's type. */
  readonly reads: Map<string, Set<string>>;
  readonly crossImports: Map<string, PlannedTarget>;
  readonly forgotten: Map<string, ForgottenExport>;
}

function homeOf(checker: ts.TypeChecker, member: PortMember): Home {
  const file = homeFileOf(checker, member);
  const placement = placementOf(file);
  return { rank: placement === null ? Number.MAX_SAFE_INTEGER : tierRank(placement), file, named: !isHandTyped(member) };
}

function collectMemberFlow(context: LinkContext, flow: Flow, into: Collected): void {
  const { root, checker, links } = context;
  const members = flowMembers(checker, flow);
  if (members !== null) {
    links.join(linkMember(context, members.port), linkMember(context, members.owner));
    linkSignatures(context, members.port, members.owner);
  }
  const found = restatementOf(checker, flow);
  if (found === null) {
    return;
  }
  const pair = { restating: keyOf(root, found.restating), owner: keyOf(root, found.owner), source: keyOf(root, found.source), relation: found.relation };
  into.pairs.set(`${pair.restating}>${pair.owner}`, pair);
  into.homes.set(pair.restating, homeOf(checker, found.restating));
  into.homes.set(pair.owner, homeOf(checker, found.owner));
}

function collectFlows(root: string, checker: ts.TypeChecker, source: ts.SourceFile, into: Collected): void {
  const context: LinkContext = { root, checker, links: into.links };
  const visit = (node: ts.Node): void => {
    if ((ts.isPropertySignature(node) || ts.isMethodSignature(node)) && isHandTyped(node) && conceptOf(node)?.sweep === true) {
      into.concepts.add(keyOf(root, node));
    }
    if (ts.isTypeAliasDeclaration(node) && node.typeParameters === undefined) {
      linkAlias(context, node);
    }
    const flows = flowsAt(checker, node);
    for (const flow of flows.types) {
      linkTypeFlow(root, flow, into.links);
    }
    for (const flow of flows.members) {
      collectMemberFlow(context, flow, into);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const literalKey = (key: ts.Node): string | null => (ts.isLiteralTypeNode(key) && ts.isStringLiteral(key.literal) ? key.literal.text : null);

function propertiesNamed(checker: ts.TypeChecker, type: ts.Type, names: readonly (string | null)[]): readonly ts.Symbol[] {
  return names.flatMap((name) => {
    const found = name === null ? undefined : checker.getPropertyOfType(type.getNonNullableType(), name);
    return found === undefined ? [] : [found];
  });
}

// `Pick<Owner, "a" | "b">` reads `a` and `b`.
function pickedMembers(checker: ts.TypeChecker, node: ts.TypeReferenceNode): readonly ts.Symbol[] {
  const [owner, keys] = node.typeArguments ?? [];
  if (node.typeName.getText() !== "Pick" || owner === undefined || keys === undefined) {
    return [];
  }
  const names = ts.isUnionTypeNode(keys) ? keys.types.map(literalKey) : [literalKey(keys)];
  return propertiesNamed(checker, checker.getTypeFromTypeNode(owner), names);
}

// The member a read names: `x.m`, `x?.m`, `x["m"]`, `Owner["m"]`, `Pick<Owner, "m">` or `{ m } = x`.
function readMembers(checker: ts.TypeChecker, node: ts.Node): readonly ts.Symbol[] {
  const of = (type: ts.Type, name: string | null): readonly ts.Symbol[] => propertiesNamed(checker, type, [name]);
  if (ts.isPropertyAccessExpression(node)) {
    return of(checker.getTypeAtLocation(node.expression), node.name.text);
  }
  if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
    return of(checker.getTypeAtLocation(node.expression), node.argumentExpression.text);
  }
  if (ts.isIndexedAccessTypeNode(node)) {
    return of(checker.getTypeFromTypeNode(node.objectType), literalKey(node.indexType));
  }
  if (ts.isTypeReferenceNode(node)) {
    return pickedMembers(checker, node);
  }
  if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent) && node.dotDotDotToken === undefined) {
    return of(checker.getTypeAtLocation(node.parent), (node.propertyName ?? node.name).getText());
  }
  return [];
}

// The declaration that holds a member: an interface, or the alias whose type literal it sits in.
function holderOf(member: ts.Declaration): Declared | null {
  if (!(ts.isPropertySignature(member) || ts.isMethodSignature(member))) {
    return null;
  }
  const holder = member.parent;
  if (ts.isInterfaceDeclaration(holder)) {
    return holder;
  }
  return ts.isTypeLiteralNode(holder) && ts.isTypeAliasDeclaration(holder.parent) ? holder.parent : null;
}

// A read of a member another domain declares, keyed by the reading domain and the declaring shape.
function recordRead(root: string, domain: string, symbol: ts.Symbol, into: Collected): void {
  for (const declaration of symbol.declarations ?? []) {
    const holder = holderOf(declaration);
    const owner = holder === null ? null : (placementOf(holder.getSourceFile().fileName)?.domain ?? null);
    if (holder !== null && owner !== null && owner !== domain) {
      const key = `${domain}|${declarationKey(root, holder)}`;
      into.reads.set(key, (into.reads.get(key) ?? new Set()).add(symbol.name));
    }
  }
}

function collectReads(root: string, checker: ts.TypeChecker, source: ts.SourceFile, into: Collected): void {
  const domain = placementOf(source.fileName)?.domain ?? null;
  if (domain === null) {
    return;
  }
  const visit = (node: ts.Node): void => {
    for (const symbol of readMembers(checker, node)) {
      recordRead(root, domain, symbol, into);
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

// A service or port: a declared shape with a hand-typed function member. A consumer depends on the ops it calls,
// never on the whole interface (the service stays in its domain).
function isService(declaration: ts.Declaration): declaration is Declared {
  const holdsOp = (members: ts.NodeArray<ts.TypeElement>): boolean =>
    members.some((member) => (ts.isPropertySignature(member) || ts.isMethodSignature(member)) && isHandTyped(member));
  if (ts.isInterfaceDeclaration(declaration)) {
    return holdsOp(declaration.members);
  }
  return ts.isTypeAliasDeclaration(declaration) && ts.isTypeLiteralNode(declaration.type) && holdsOp(declaration.type.members);
}

interface ImportSite {
  readonly root: string;
  readonly file: string;
  readonly line: number;
  readonly specifier: string;
  readonly domain: string;
  readonly from: string;
  readonly module: ts.Symbol;
}

function importTarget(site: ImportSite, fields: Pick<PlannedTarget, "kind" | "members" | "port" | "owner" | "ownerAt" | "note">): PlannedTarget {
  return { leg: legOf(site.file), form: "import", file: site.file, line: site.line, type: null, imports: [], exports: [], ...fields };
}

// One target per op a consumer domain reads off an imported service, or a review target when it reads none.
function serviceTargets(checker: ts.TypeChecker, site: ImportSite, service: Declared, reads: ReadonlyMap<string, ReadonlySet<string>>): PlannedTarget[] {
  const name = service.name.text;
  const ops = [...(reads.get(`${site.domain}|${declarationKey(site.root, service)}`) ?? [])].sort();
  const at = (node: ts.Node): string => `${relative(site.root, node.getSourceFile().fileName)}:${lineOf(node)}`;
  if (ops.length === 0) {
    const note = `domain ${site.domain} imports the whole ${name} from domain ${site.from} and reads no member: name the op it passes on, or drop the import`;
    return [importTarget(site, { kind: "review", members: [name], port: `import ${name} from ${site.specifier}`, owner: name, ownerAt: at(service), note })];
  }
  const type = checker.getTypeAtLocation(service.name);
  return ops.flatMap((op) => {
    const member = checker.getPropertyOfType(type, op)?.declarations?.[0];
    if (member === undefined) {
      return [];
    }
    const foreign = foreignTypes(checker, member);
    const isOp = (ts.isPropertySignature(member) || ts.isMethodSignature(member)) && isHandTyped(member);
    // A field whose type contracts already holds moves nothing: the consumer declares the slice it reads.
    const kind: TargetKind = !isOp && foreign.server.length === 0 && !passesDbHandle(foreign) ? "split" : crossDomainKind(foreign, [`${name}.${op}`]);
    const plan =
      kind === "move-to-contracts"
        ? `name ${op} ${isOp ? "as a contracts op type" : "'s type in contracts"}`
        : `type ${op} in domain ${site.domain}'s contract/ over contracts data`;
    const note = [
      `domain ${site.domain} ${isOp ? "calls" : "reads"} ${name}.${op} from domain ${site.from}; never move the whole ${name}: ${plan}`,
      crossDomainNote(kind, foreign, [`${name}.${op}`]),
    ]
      .filter((part) => part !== "")
      .join("; ");
    return [
      importTarget(site, { kind, members: [op], port: `import ${name}.${op} from ${site.specifier}`, owner: `${name}.${op}`, ownerAt: at(member), note }),
    ];
  });
}

// A data shape another domain declares: it moves to contracts whole, or splits around its runtime types.
function dataTarget(checker: ts.TypeChecker, site: ImportSite, name: string, declarations: readonly ts.Declaration[]): PlannedTarget {
  const foreign = mergeForeignTypes(declarations.map((declaration) => foreignTypes(checker, declaration)));
  const kind = crossDomainKind(foreign, [name]);
  const ownerAt = declarations.map((declaration) => `${relative(site.root, declaration.getSourceFile().fileName)}:${lineOf(declaration)}`).join(", ");
  const note = [`domain ${site.domain} takes ${name} from domain ${site.from}`, crossDomainNote(kind, foreign, [name])]
    .filter((part) => part !== "")
    .join("; ");
  return importTarget(site, { kind, members: [name], port: `import ${name} from ${site.specifier}`, owner: name, ownerAt, note });
}

// The targets for one name a cross-domain import takes: none for the D117 door, the ops read off a service, else the data.
function nameTargets(checker: ts.TypeChecker, site: ImportSite, name: string, reads: Collected["reads"]): readonly PlannedTarget[] {
  if (site.from === D117_DOOR.domain && D117_DOOR.names.has(name)) {
    return [];
  }
  const declarations =
    aliased(
      checker,
      checker.getExportsOfModule(site.module).find((symbol) => symbol.name === name),
    )?.declarations ?? [];
  const service = declarations.find(isService);
  return service === undefined ? [dataTarget(checker, site, name, declarations)] : serviceTargets(checker, site, service, reads);
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
    const specifier = cross.statement.moduleSpecifier?.getText().slice(1, -1) ?? "";
    const site: ImportSite = { root, file, line: lineOf(cross.statement), specifier, domain, from: cross.domain, module: cross.module };
    for (const target of importedNames(cross.statement).flatMap((name) => nameTargets(checker, site, name, into.reads))) {
      into.crossImports.set(`${file}:${target.line}:${target.port}`, target);
    }
  }
}

// --- Owner choice ------------------------------------------------------------------------------------------

// Union-find over identical pairs: each chain of members that restate one another.
function chainsOf(pairs: readonly Pair[]): ReadonlyMap<string, readonly string[]> {
  const links = new Links();
  for (const pair of pairs) {
    links.join(pair.restating, pair.restating);
    if (pair.relation === "identical") {
      links.join(pair.restating, pair.owner);
    }
  }
  const byHead = new Map<string, string[]>();
  for (const key of new Set(pairs.flatMap((pair) => [pair.restating, pair.owner]))) {
    const head = links.root(key);
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

/** The member whose shape sits in the lowest tier (an alias it is typed by counts as its home); then one already
 *  typed by a name; then a contract file over a service or composition file beside it; then the member no value
 *  flows into (the implemented one). */
function ownerChooser(fed: ReadonlySet<string>, homes: ReadonlyMap<string, Home>): (chain: readonly string[]) => string {
  const home = (key: string): Home => homes.get(key) ?? { rank: Number.MAX_SAFE_INTEGER, file: key, named: false };
  return (chain) => {
    const lowest = Math.min(...chain.map((key) => home(key).rank));
    const tier = chain.filter((key) => home(key).rank === lowest).sort();
    const named = tier.filter((key) => home(key).named);
    const pool = named.length > 0 ? named : tier;
    const contracts = pool.filter((key) => isContractFile(home(key).file));
    const lows = contracts.length > 0 ? contracts : pool;
    const sources = lows.filter((key) => !fed.has(key));
    return (sources.length === 1 ? sources[0] : lows[0]) ?? chain[0] ?? "";
  };
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

function forgottenKind(linked: boolean, crossDomain: boolean): TargetKind {
  if (!linked) {
    return "review";
  }
  return crossDomain ? "move-to-contracts" : "forgotten-door-export";
}

// A copy counts as the same concept only when a flow, a type reference or an alias links it to the declaration;
// a copy that matches only by printed shape goes to review, never into a contracts move.
function forgottenTargets(found: Iterable<ForgottenExport>, links: Links): PlannedTarget[] {
  return [...found].map((entry): PlannedTarget => {
    const linked = entry.copies.filter((_, index) => links.linked(entry.key, entry.copyKeys[index] ?? ""));
    const shapeOnly = entry.copies.filter((copy) => !linked.includes(copy));
    const kind = forgottenKind(linked.length > 0, entry.crossDomain);
    const exports =
      kind !== "forgotten-door-export" || entry.doorFile === null || entry.door === null
        ? []
        : [{ file: entry.doorFile, name: entry.name, from: `./${relative(entry.doorFile.replace(/[^/]+$/u, ""), entry.file)}` }];
    const note = [linked.length > 0 ? `copies: ${linked.join(", ")}` : "", shapeOnly.length > 0 ? `same shape, no flow: ${shapeOnly.join(", ")}` : ""]
      .filter((part) => part !== "")
      .join("; ");
    return {
      leg: legOf(entry.file),
      kind,
      form: "type",
      file: entry.file,
      line: entry.line,
      members: [entry.name],
      port: entry.name,
      owner: entry.door ?? "(no door)",
      ownerAt: entry.file,
      type: null,
      imports: [],
      exports,
      note,
    };
  });
}

/** Run the census over every package world in `root`, one program at a time. */
export function portCensus(root: string, log: (line: string) => void): PortCensus {
  const collected: Collected = {
    pairs: new Map(),
    concepts: new Set(),
    homes: new Map(),
    links: new Links(),
    reads: new Map(),
    crossImports: new Map(),
    forgotten: new Map(),
  };
  const worlds: WorldCount[] = [];
  for (const config of packageWorlds(root)) {
    const before = collected.pairs.size;
    const program = createWorldProgram(root, config);
    const checker = program.getTypeChecker();
    const sources = program.getSourceFiles().filter((file) => !file.isDeclarationFile && isProduction(relative(root, file.fileName)));
    for (const source of sources) {
      collectFlows(root, checker, source, collected);
      collectReads(root, checker, source, collected);
    }
    // Reads first: a service import is planned against every op its domain reads, across all of that domain's files.
    for (const source of sources) {
      collectCrossImports(root, checker, source, collected);
    }
    for (const entry of forgottenDoorExports({ program, root })) {
      collected.forgotten.set(`${entry.file}:${entry.line}`, entry);
    }
    worlds.push({ config, files: program.getSourceFiles().length, pairs: collected.pairs.size - before });
    log(`${config}: ${collected.pairs.size - before} new pairs`);
  }
  const pairs = [...collected.pairs.values()];
  // The member a value flows into: the restating side unless the restating member is the value's own source.
  const fed = new Set(pairs.map((pair) => (pair.source === pair.restating ? pair.owner : pair.restating)));
  const chains = chainsOf(pairs);
  const keys = [...new Set([...pairs.flatMap((pair) => [pair.restating, pair.owner]), ...collected.concepts])];
  const planned: PlannedTarget[] = [];
  for (const config of packageWorlds(root)) {
    const pkg = /^packages\/([^/]+)\//u.exec(config)?.[1] ?? "";
    const mine = keys.filter((key) => key.startsWith(`packages/${pkg}/`));
    if (mine.length === 0) {
      continue;
    }
    const program = createWorldProgram(root, config);
    const context: PlanContext = {
      world: { program, root },
      checker: program.getTypeChecker(),
      nodes: indexMembers(root, program),
      chains,
      pairs,
      graph: new ImportGraph(program, root),
      chooseOwner: ownerChooser(fed, collected.homes),
    };
    planned.push(
      ...mine.flatMap((key) => {
        const node = context.nodes.get(key);
        const target = node === undefined ? null : planMember(context, node);
        return target === null ? [] : [target];
      }),
    );
    log(`${config}: planned ${mine.length} members`);
  }
  // Two members typed by one alias plan one alias rewrite.
  const unique = [...new Map(planned.map((target) => [`${target.file}:${target.line}:${target.form}:${target.members.join(",")}`, target])).values()];
  const placed = collapse(unique).map(clustered);
  // An alias the plan already rewrites needs no forgotten-export target: its copy is the owner it derives from.
  const rewritten = new Set(placed.filter((target) => target.form === "type").map((target) => `${target.file}:${target.line}`));
  const forgotten = forgottenTargets(collected.forgotten.values(), collected.links).filter((target) => !rewritten.has(`${target.file}:${target.line}`));
  const targets = [...placed, ...doorExportTargets(placed), ...[...collected.crossImports.values()].map(clustered), ...forgotten.map(clustered)];
  return { targets: targets.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line), worlds };
}
