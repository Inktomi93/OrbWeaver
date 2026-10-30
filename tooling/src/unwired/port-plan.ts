// Pass two of `pnpm unwired ports`: the rewrite for each restating member, planned in its own package's world where
// its imports resolve. Every plan names a real owner member, a legal import and no cycle; anything else is a kind
// that tells the leg what to do first.
import { relative } from "node:path";
import ts from "typescript";
import type { Door, ImportGraph, LoadedWorld } from "./doors.ts";
import { areaOf, doorsOf, exportNameOf, exportsOtherAs, lowerHome, relativeSpecifier } from "./doors.ts";
import { foreignTypes } from "./foreign-types.ts";
import type { Indexed, Pair, PortTarget, TargetExport, TargetImport, TargetKind } from "./port-targets.ts";
import { conceptOf, crossDomainKind, crossDomainNote, fileOfKey, legOf, placementOfKey, rankOfKey } from "./port-targets.ts";
import type { PortMember } from "./restated-port.ts";
import { effectiveMember, memberLabel, RELATION } from "./restated-port.ts";

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

// Where `member` is reachable from outside: its home declaration and the property path to it.
function accessOf(member: PortMember): Access | null {
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

function planDerive(context: PlanContext, port: PortMember, owner: PortMember, paramsOnly: boolean): Plan {
  const access = accessOf(owner);
  if (access === null) {
    return plain("name-owner-type", `${memberLabel(owner)} sits in a generic or inline type: name that type in its own contract, then derive`);
  }
  const { root } = context.world;
  const importer = relative(root, port.getSourceFile().fileName);
  const ownerFile = relative(root, owner.getSourceFile().fileName);
  const symbol = context.checker.getSymbolAtLocation(access.home.name);
  const name = access.home.name.text;
  if (symbol === undefined) {
    return plain("hand", `${name} has no symbol`);
  }
  const inScope = context.checker.getSymbolsInScope(port, ts.SymbolFlags.Type).find((candidate) => candidate.name === name);
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
  const kind = crossDomainKind(foreign);
  return plain(kind, crossDomainNote(kind, foreign, [memberLabel(owner)]));
}

const isCrossDomain = (from: string, to: string): boolean => {
  const a = placementOfKey(from)?.domain ?? null;
  const b = placementOfKey(to)?.domain ?? null;
  return a !== null && b !== null && a !== b;
};

function planRestating(context: PlanContext, node: Indexed, ownerKey: string, paramsOnly: boolean): Plan & { readonly owner: string } {
  const ownerNode = context.nodes.get(ownerKey);
  if (ownerNode === undefined) {
    return { ...plain("hand", "the owner sits outside this package's world"), owner: ownerKey };
  }
  const owner = effectiveMember(context.checker, ownerNode.member);
  const label = memberLabel(owner);
  if (isCrossDomain(node.key, ownerKey)) {
    return { ...planCrossDomain(context, owner), owner: label };
  }
  if (rankOfKey(ownerKey) > rankOfKey(node.key)) {
    const home = lowerHome(node.file, fileOfKey(ownerKey));
    return { ...plain("move-down", `the owner sits in a higher tier: name the shape in ${home} and derive both`), owner: label };
  }
  return { ...planDerive(context, node.member, owner, paramsOnly), owner: label };
}

/** The target for one member, or null when it restates nothing. */
export function planMember(context: PlanContext, node: Indexed): PortTarget | null {
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
  const ownerAt = ownerKey.slice(0, ownerKey.lastIndexOf(":"));
  if (ownerKey === node.key) {
    const domains = new Set(chain.map((key) => placementOfKey(key)?.domain ?? null));
    const crossDomain = domains.size > 1 && !domains.has(null);
    return crossDomain ? { ...base, ...planCrossDomain(context, member), owner: memberLabel(member), ownerAt } : null;
  }
  const paramsOnly = chain.length === 1 && single?.relation === RELATION.params;
  return { ...base, ...planRestating(context, node, ownerKey, paramsOnly), ownerAt };
}

const HOME_OF_ACCESS = /^([A-Za-z_$][\w$]*)\["([^"]+)"\]$/u;

// A port whose members all derive from one home, by the same names, collapses to `Pick<Home, …>`. The codemod collapses
// only when these are every member the port declares, and keeps member form otherwise.
export function collapse(targets: readonly PortTarget[]): PortTarget[] {
  const byPort = new Map<string, PortTarget[]>();
  for (const target of targets) {
    const key =
      target.form === "member" ? `${target.file}|${target.port.slice(0, target.port.lastIndexOf("."))}` : `${target.file}:${target.line}:${target.form}`;
    byPort.set(key, [...(byPort.get(key) ?? []), target]);
  }
  return [...byPort.values()].flatMap((group): PortTarget[] => {
    const parsed = group.map((target) => HOME_OF_ACCESS.exec(target.type ?? ""));
    const homes = new Set(parsed.map((match) => match?.[1] ?? ""));
    const [home = ""] = homes;
    const [first] = group;
    const sameNames = group.every((target, index) => target.kind === "derive" && parsed[index]?.[2] === target.members[0]);
    if (first === undefined || group.length < 2 || homes.size !== 1 || home === "" || !sameNames) {
      return group;
    }
    const members = group.map((target) => target.members[0] ?? "");
    const exports = [...new Map(group.flatMap((target) => target.exports).map((entry) => [`${entry.file}|${entry.name}`, entry])).values()];
    const line = Math.min(...group.map((target) => target.line));
    return [{ ...first, form: "collapse", line, members, type: `Pick<${home}, ${members.map((name) => `"${name}"`).join(" | ")}>`, exports }];
  });
}

/** Each door or owner export a derive needs, as its own target in the leg that owns that file. */
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
      });
    }
  }
  return [...unique.values()];
}
