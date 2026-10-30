// Pass two of `pnpm unwired ports`: the rewrite for each restating member, planned in its own package's world where
// its imports resolve. Every plan names a real owner member, a legal import and no cycle; anything else is a kind
// that tells the leg what to do first.
import { relative } from "node:path";
import ts from "typescript";
import type { Door, ImportGraph, LoadedWorld } from "./doors.ts";
import { areaOf, doorsOf, exportNameOf, exportsOtherAs, lowerHome, relativeSpecifier } from "./doors.ts";
import { foreignTypes } from "./foreign-types.ts";
import type { Indexed, Pair, PlannedTarget, PortTarget, TargetExport, TargetImport, TargetKind } from "./port-targets.ts";
import { conceptOf, crossDomainKind, crossDomainNote, legOf, lineOf, placementOfKey } from "./port-targets.ts";
import type { PortMember } from "./restated-port.ts";
import { aliasOf, effectiveMember, homeFileOf, isHandTyped, memberLabel, placementOf, RELATION, rootAlias, tierRank } from "./restated-port.ts";

export interface PlanContext {
  readonly world: LoadedWorld;
  readonly checker: ts.TypeChecker;
  readonly nodes: ReadonlyMap<string, Indexed>;
  readonly chains: ReadonlyMap<string, readonly string[]>;
  readonly pairs: readonly Pair[];
  readonly graph: ImportGraph;
  readonly chooseOwner: (chain: readonly string[]) => string;
}

interface Plan {
  readonly kind: TargetKind;
  readonly type: string | null;
  readonly imports: readonly TargetImport[];
  readonly exports: readonly TargetExport[];
  readonly note: string;
}

const plain = (kind: TargetKind, note: string, type: string | null = null): Plan => ({ kind, type, imports: [], exports: [], note });

interface Access {
  readonly home: ts.InterfaceDeclaration | ts.TypeAliasDeclaration;
  /** The segments after the home: the member's name, behind any nested property literals. */
  readonly segments: readonly string[];
}

// Where `member`'s shape is reachable from outside: the alias it is typed by, else its home declaration and the
// property path to it.
function accessOf(checker: ts.TypeChecker, member: PortMember): Access | null {
  const named = aliasOf(checker, member);
  if (named !== null) {
    return { home: named, segments: [] };
  }
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
  const home = ts.isInterfaceDeclaration(container) ? container : alias;
  return home === null || home.typeParameters !== undefined ? null : { home, segments };
}

const optionalIn = (member: PortMember): boolean =>
  member.questionToken !== undefined ||
  (ts.isPropertySignature(member) &&
    member.type !== undefined &&
    ts.isUnionTypeNode(member.type) &&
    member.type.types.some((part) => part.kind === ts.SyntaxKind.UndefinedKeyword));

// The derived type text: `Home["m"]`, `NonNullable<…>` where the owner's member is optional and the port's is not, and
// `(...args: Parameters<…>) => R` where only the parameters are restated and the port narrows the return.
interface Rewrite {
  readonly port: PortMember;
  readonly owner: PortMember;
  readonly paramsOnly: boolean;
}

function returnNode(port: PortMember): ts.TypeNode | undefined {
  if (ts.isMethodSignature(port)) {
    return port.type;
  }
  return port.type !== undefined && ts.isFunctionTypeNode(port.type) ? port.type.type : undefined;
}

function typeText(name: string, access: Access, { port, owner, paramsOnly }: Rewrite): string | null {
  const path = `${name}${access.segments.map((segment) => `["${segment}"]`).join("")}`;
  const member = optionalIn(owner) && !optionalIn(port) ? `NonNullable<${path}>` : path;
  if (!paramsOnly) {
    return member;
  }
  const returned = returnNode(port);
  return returned === undefined ? null : `(...args: Parameters<${member}>) => ${returned.getText()}`;
}

interface Importing {
  readonly door: Door;
  readonly importer: string;
  readonly symbol: ts.Symbol;
  readonly name: string;
}

function importThrough(
  context: PlanContext,
  { door, importer, symbol, name }: Importing,
): Plan | { readonly alias: string; readonly exports: readonly TargetExport[] } {
  const ownerFile = relative(context.world.root, symbol.declarations?.[0]?.getSourceFile().fileName ?? "");
  if (context.graph.reaches(door.file, importer)) {
    return plain("move-down", `${door.specifier} already imports ${importer}: name the shape in ${lowerHome(importer, ownerFile)} and derive both`);
  }
  const alias = exportNameOf(context.world, door.file, symbol);
  if (alias !== null) {
    return { alias, exports: [] };
  }
  if (exportsOtherAs(context.world, door.file, name, symbol)) {
    return plain("hand", `${door.specifier} already exports another ${name}`);
  }
  const own: TargetExport[] = exportNameOf(context.world, ownerFile, symbol) === null ? [{ file: ownerFile, name, from: null }] : [];
  return { alias: name, exports: [...own, { file: door.file, name, from: relativeSpecifier(door.file, ownerFile) }] };
}

// The port member, where its rewrite lands (the member, or the alias it is typed by), and whether only its parameters derive.
interface Restating {
  readonly port: PortMember;
  readonly site: ts.Node;
  readonly paramsOnly: boolean;
}

function planDerive(context: PlanContext, { port, site, paramsOnly }: Restating, owner: PortMember): Plan {
  const access = accessOf(context.checker, owner);
  if (access === null) {
    return plain("name-owner-type", `${memberLabel(owner)} sits in a generic or inline type: name that type in its own contract, then derive`);
  }
  const { root } = context.world;
  const importer = relative(root, site.getSourceFile().fileName);
  const ownerFile = relative(root, access.home.getSourceFile().fileName);
  const symbol = context.checker.getSymbolAtLocation(access.home.name);
  const name = access.home.name.text;
  if (symbol === undefined) {
    return plain("hand", `${name} has no symbol`);
  }
  const inScope = context.checker.getSymbolsInScope(site, ts.SymbolFlags.Type).find((candidate) => candidate.name === name);
  const scoped =
    inScope === undefined
      ? undefined
      : ((): ts.Symbol =>
          // biome-ignore lint/suspicious/noBitwiseOperators: SymbolFlags is a compiler-owned bitfield.
          (inScope.flags & ts.SymbolFlags.Alias) !== 0 ? context.checker.getAliasedSymbol(inScope) : inScope)();
  const derived = (alias: string, imports: readonly TargetImport[], exports: readonly TargetExport[]): Plan => {
    const type = typeText(alias, access, { port, owner, paramsOnly });
    return type === null
      ? plain("hand", "the port's return has no type to keep")
      : { kind: paramsOnly ? "derive-params" : "derive", type, imports, exports, note: "" };
  };
  if (importer === ownerFile || scoped === symbol) {
    return derived(name, [], []);
  }
  if (scoped !== undefined && ts.isTypeAliasDeclaration(site) && context.checker.getSymbolAtLocation(site.name) === scoped) {
    return plain("hand", `delete this local ${name} and import the owner's ${name} from ${ownerFile}`);
  }
  if (scoped !== undefined) {
    return plain("hand", `${name} already names another type in ${importer}`);
  }
  if (areaOf(importer) === areaOf(ownerFile)) {
    if (context.graph.reaches(ownerFile, importer)) {
      return plain("move-down", `${ownerFile} already imports ${importer}: name the shape in ${lowerHome(importer, ownerFile)} and derive both`);
    }
    const own: TargetExport[] = exportNameOf(context.world, ownerFile, symbol) === null ? [{ file: ownerFile, name, from: null }] : [];
    return derived(name, [{ name, from: relativeSpecifier(importer, ownerFile) }], own);
  }
  const [door] = doorsOf(root, ownerFile);
  if (door === undefined) {
    return plain("move-down", `${ownerFile} has no front door for ${importer}: name the shape in ${lowerHome(importer, ownerFile)} and derive both`);
  }
  const through = importThrough(context, { door, importer, symbol, name });
  return "kind" in through ? through : derived(through.alias, [{ name: through.alias, from: door.specifier }], through.exports);
}

function planCrossDomain(context: PlanContext, owner: PortMember): Plan {
  const foreign = foreignTypes(context.checker, owner);
  const kind = crossDomainKind(foreign, [memberLabel(owner)]);
  return plain(kind, crossDomainNote(kind, foreign, [memberLabel(owner)]));
}

const domainOf = (fileName: string): string | null => placementOf(fileName)?.domain ?? null;

const rankOfFile = (fileName: string): number => {
  const placement = placementOf(fileName);
  return placement === null ? Number.MAX_SAFE_INTEGER : tierRank(placement);
};

interface Owned {
  /** The owner's label: `Interface.member`, or the alias it is typed by. */
  readonly owner: string;
  /** Where the owner's shape lives: `file:line`. */
  readonly ownerAt: string;
}

// An owner member typed by an alias is owned by that alias: a derive names it, and its domain decides a contracts move.
function planRestating(context: PlanContext, restating: Restating, ownerKey: string): Plan & Owned {
  const ownerNode = context.nodes.get(ownerKey);
  if (ownerNode === undefined) {
    const at = ownerKey.lastIndexOf(":");
    return { ...plain("hand", "the owner sits outside this package's world"), owner: ownerKey.slice(at + 1), ownerAt: ownerKey.slice(0, at) };
  }
  const owner = effectiveMember(context.checker, ownerNode.member);
  const alias = aliasOf(context.checker, owner);
  const home = alias ?? owner;
  const ownerFile = homeFileOf(context.checker, owner);
  const owned: Owned = { owner: alias?.name.text ?? memberLabel(owner), ownerAt: `${relative(context.world.root, ownerFile)}:${lineOf(home)}` };
  const siteFile = restating.site.getSourceFile().fileName;
  const [from, to] = [domainOf(siteFile), domainOf(ownerFile)];
  if (from !== null && to !== null && from !== to) {
    return { ...planCrossDomain(context, owner), ...owned };
  }
  if (rankOfFile(ownerFile) > rankOfFile(siteFile)) {
    const lower = lowerHome(relative(context.world.root, siteFile), relative(context.world.root, ownerFile));
    return { ...plain("move-down", `the owner sits in a higher tier: name the shape in ${lower} and derive both`), ...owned };
  }
  return { ...planDerive(context, restating, owner), ...owned };
}

// A member typed by an alias restates through that alias, so the alias declaration is the rewrite: `type Op = Owner`.
function aliasTarget(context: PlanContext, node: Indexed, ownerKey: string): PlannedTarget | null {
  const alias = aliasOf(context.checker, node.member);
  const ownerNode = context.nodes.get(ownerKey);
  const ownerAlias = ownerNode === undefined ? null : rootAlias(context.checker, effectiveMember(context.checker, ownerNode.member));
  // Typed by the owner's own alias, or a rename of it: nothing to rewrite.
  if (alias === null || rootAlias(context.checker, node.member) === ownerAlias) {
    return null;
  }
  const file = relative(context.world.root, alias.getSourceFile().fileName);
  const planned = planRestating(context, { port: node.member, site: alias, paramsOnly: false }, ownerKey);
  return { leg: legOf(file), form: "type", file, line: lineOf(alias), members: [alias.name.text], port: alias.name.text, ...planned };
}

/** The target for one member, or null when it restates nothing. */
export function planMember(context: PlanContext, node: Indexed): PlannedTarget | null {
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
  // A narrowing whose parameters differ too is the port's own op, not a restatement; only copied parameters count.
  const single = context.pairs.find((pair) => pair.restating === node.key && pair.relation === RELATION.params);
  const ownerKey = chain.length > 1 ? context.chooseOwner(chain) : (single?.owner ?? null);
  if (ownerKey === null) {
    return null;
  }
  // A member already typed by a name (an alias, a derived form, a mapped Pick) restates nothing itself.
  const named = !isHandTyped(member);
  if (ownerKey === node.key) {
    const domains = new Set(chain.map((key) => placementOfKey(key)?.domain ?? null));
    const crossDomain = domains.size > 1 && !domains.has(null);
    const ownerAt = ownerKey.slice(0, ownerKey.lastIndexOf(":"));
    return crossDomain && !named ? { ...base, ...planCrossDomain(context, member), owner: memberLabel(member), ownerAt } : null;
  }
  if (named) {
    return aliasTarget(context, node, ownerKey);
  }
  const paramsOnly = chain.length === 1 && single?.relation === RELATION.params;
  return { ...base, ...planRestating(context, { port: member, site: member, paramsOnly }, ownerKey) };
}

const HOME_OF_ACCESS = /^([A-Za-z_$][\w$]*)\["([^"]+)"\]$/u;

// A port whose members all derive from one home, by the same names, collapses to `Pick<Home, …>`. The codemod collapses
// only when these are every member the port declares, and keeps member form otherwise.
export function collapse(targets: readonly PlannedTarget[]): PlannedTarget[] {
  const byPort = new Map<string, PlannedTarget[]>();
  for (const target of targets) {
    const key =
      target.form === "member" ? `${target.file}|${target.port.slice(0, target.port.lastIndexOf("."))}` : `${target.file}:${target.line}:${target.form}`;
    byPort.set(key, [...(byPort.get(key) ?? []), target]);
  }
  return [...byPort.values()].flatMap((group): PlannedTarget[] => {
    const parsed = group.map((target) => HOME_OF_ACCESS.exec(target.type ?? ""));
    const homes = new Set(parsed.map((match) => match?.[1] ?? ""));
    const [home = ""] = homes;
    const [first] = group;
    const sameNames = group.every((target, index) => target.kind === "derive" && parsed[index]?.[2] === target.members[0]);
    const members = group.map((target) => target.members[0] ?? "");
    // Every inline literal in a file shares the `(inline)` label, so its group can span several ports.
    const onePort = first?.port.startsWith("(inline)") === false && new Set(members).size === members.length;
    if (first === undefined || group.length < 2 || homes.size !== 1 || home === "" || !sameNames || !onePort) {
      return group;
    }
    const exports = [...new Map(group.flatMap((target) => target.exports).map((entry) => [`${entry.file}|${entry.name}`, entry])).values()];
    const line = Math.min(...group.map((target) => target.line));
    return [{ ...first, form: "collapse", line, members, type: `Pick<${home}, ${members.map((name) => `"${name}"`).join(" | ")}>`, exports }];
  });
}

/** Each door or owner export a derive needs, as its own target in the leg that owns that file and the cluster of the
 *  derive that needs it. */
export function doorExportTargets(targets: readonly PortTarget[]): PortTarget[] {
  const unique = new Map<string, PortTarget>();
  for (const target of targets) {
    for (const entry of target.exports) {
      unique.set(`${entry.file}|${entry.name}`, {
        leg: legOf(entry.file),
        kind: "add-door-export",
        form: "export",
        file: entry.file,
        line: 0,
        members: [entry.name],
        port: entry.from === null ? `export ${entry.name}` : `export ${entry.name} from ${entry.from}`,
        owner: entry.name,
        ownerAt: entry.from ?? entry.file,
        type: null,
        imports: [],
        exports: [entry],
        note: `needed by ${target.port} in ${target.file}`,
        cluster: target.cluster,
        clusterGroup: target.clusterGroup,
        groupReason: target.groupReason,
      });
    }
  }
  return [...unique.values()];
}
