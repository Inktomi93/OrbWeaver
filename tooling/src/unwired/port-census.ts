// `pnpm unwired ports`: every port member that hand-restates another member, grouped into chains of identical
// members, each chain given one owner and each restating member the rewrite the derive codemod applies. It also
// lists every cross-domain import, whose shape moves to packages/contracts (Core-0 §4: never a sideways import),
// and every type a door forgot to export while another file spells it again.
import { relative } from "node:path";
import ts from "typescript";
import { ImportGraph } from "./doors.ts";
import { aliased, foreignTypes, mergeForeignTypes } from "./foreign-types.ts";
import type { ForgottenExport } from "./forgotten-exports.ts";
import { forgottenDoorExports } from "./forgotten-exports.ts";
import type { PlanContext } from "./port-plan.ts";
import { collapse, doorExportTargets, planMember } from "./port-plan.ts";
import type { Indexed, Pair, PortTarget, TargetKind } from "./port-targets.ts";
import { conceptOf, crossDomainKind, crossDomainNote, keyOf, legOf, lineOf, rankOfKey } from "./port-targets.ts";
import { isContractFile, isHandTyped, placementOf, RELATION, restatementsAt } from "./restated-port.ts";
import { createWorldProgram, isProduction, packageWorlds } from "./worlds.ts";

interface CrossImport {
  readonly file: string;
  readonly line: number;
  readonly specifier: string;
  readonly names: readonly string[];
  readonly from: string;
  readonly note: string;
  readonly kind: TargetKind;
}

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

// --- Pass 1: pairs, concept members and cross-domain imports, world by world --------------------------------

interface Collected {
  readonly pairs: Map<string, Pair>;
  readonly concepts: Set<string>;
  readonly crossImports: Map<string, CrossImport>;
  readonly forgotten: Map<string, ForgottenExport>;
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
    const merged = mergeForeignTypes(declarations.map((declaration) => foreignTypes(checker, declaration)));
    const kind = crossDomainKind(merged);
    const line = lineOf(cross.statement);
    into.crossImports.set(`${file}:${line}`, {
      file,
      line,
      specifier: cross.statement.moduleSpecifier?.getText().slice(1, -1) ?? "",
      names,
      from: [...new Set(declarations.map((declaration) => `${relative(root, declaration.getSourceFile().fileName)}:${lineOf(declaration)}`))].join(", "),
      note: [`domain ${domain} takes these from domain ${cross.domain}`, crossDomainNote(kind, merged, names)].filter((part) => part !== "").join("; "),
      kind,
    });
  }
}

// --- Owner choice ------------------------------------------------------------------------------------------

// Union-find over identical pairs: each chain of members that restate one another.
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

/** The lowest-tier member of a chain; then a contract file over a service or composition file beside it; then the
 *  member no value flows into (the implemented one). */
function ownerChooser(fed: ReadonlySet<string>): (chain: readonly string[]) => string {
  return (chain) => {
    const lowest = Math.min(...chain.map(rankOfKey));
    const tier = chain.filter((key) => rankOfKey(key) === lowest).sort();
    const contracts = tier.filter((key) => isContractFile(`/${key.slice(0, key.indexOf(":"))}`));
    const lows = contracts.length > 0 ? contracts : tier;
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

function crossImportTargets(imports: Iterable<CrossImport>): PortTarget[] {
  return [...imports].map(
    (entry): PortTarget => ({
      leg: legOf(entry.file),
      kind: entry.kind,
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

// Within one area the door exports it and the copies derive; a copy in another domain moves the shape to contracts.
function forgottenTargets(found: Iterable<ForgottenExport>): PortTarget[] {
  return [...found].map((entry): PortTarget => {
    const exports =
      entry.crossDomain || entry.doorFile === null || entry.door === null
        ? []
        : [{ file: entry.doorFile, name: entry.name, from: `./${relative(entry.doorFile.replace(/[^/]+$/u, ""), entry.file)}` }];
    return {
      leg: legOf(entry.file),
      kind: entry.crossDomain ? "move-to-contracts" : "forgotten-door-export",
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
      note: `copies: ${entry.copies.join(", ")}`,
    };
  });
}

/** Run the census over every package world in `root`, one program at a time. */
export function portCensus(root: string, log: (line: string) => void): PortCensus {
  const collected: Collected = { pairs: new Map(), concepts: new Set(), crossImports: new Map(), forgotten: new Map() };
  const worlds: WorldCount[] = [];
  for (const config of packageWorlds(root)) {
    const before = collected.pairs.size;
    const program = createWorldProgram(root, config);
    const checker = program.getTypeChecker();
    for (const source of program.getSourceFiles().filter((file) => !file.isDeclarationFile && isProduction(relative(root, file.fileName)))) {
      collectRestatements(root, checker, source, collected);
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
  const planned: PortTarget[] = [];
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
      chooseOwner: ownerChooser(fed),
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
  const collapsed = collapse(planned);
  const targets = [
    ...collapsed,
    ...doorExportTargets(collapsed),
    ...crossImportTargets(collected.crossImports.values()),
    ...forgottenTargets(collected.forgotten.values()),
  ];
  return { targets: targets.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line), worlds };
}
