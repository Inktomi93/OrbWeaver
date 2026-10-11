// Classifies and re-spells one package file's parent-relative imports two or more levels deep: a target in the
// same module becomes `#src/<path>`, a target in another module enters through that module's front door, and
// the door gains the re-export it lacks (`export type` for a type, so a type adds no runtime edge).
import { posix } from "node:path";
import type { ExportDeclaration, ImportDeclaration } from "ts-morph";
import { Node } from "ts-morph";
import type { PackageModule } from "../../floor/code-facts/package-module.ts";
import { packageModuleOf, SOURCE_SUBPATH_PREFIX } from "../../floor/code-facts/package-module.ts";
import type { DeepImportPlan, DoorExport, DoorReader, PackageSource } from "../contract/deep-imports.ts";
import type { RelocateNote } from "../contract/relocate.ts";

const DEEP_PARENT = "../../";
const TYPE_ONLY_KINDS = new Set(["InterfaceDeclaration", "TypeAliasDeclaration"]);

export function packageSourceOf(path: string): PackageSource | undefined {
  const match = /^(packages\/([^/]+)\/src)\/(.+)$/u.exec(path);
  return match?.[1] === undefined || match[2] === undefined || match[3] === undefined ? undefined : { pkg: match[2], srcRoot: match[1], relative: match[3] };
}

/** True for a relative specifier that climbs two or more directories. */
export function isDeepParent(spec: string): boolean {
  return spec.startsWith(DEEP_PARENT);
}

function namedTargets(declaration: ImportDeclaration | ExportDeclaration): readonly { readonly name: string; readonly typeOnly: boolean }[] | undefined {
  if (Node.isImportDeclaration(declaration)) {
    if (declaration.getDefaultImport() !== undefined || declaration.getNamespaceImport() !== undefined || declaration.getNamedImports().length === 0) {
      return;
    }
    const clauseTypeOnly = declaration.isTypeOnly();
    return declaration.getNamedImports().map((specifier) => ({ name: specifier.getName(), typeOnly: clauseTypeOnly || specifier.isTypeOnly() }));
  }
  if (declaration.isNamespaceExport() || declaration.getNamedExports().length === 0) {
    return;
  }
  const clauseTypeOnly = declaration.isTypeOnly();
  return declaration.getNamedExports().map((specifier) => ({ name: specifier.getName(), typeOnly: clauseTypeOnly || specifier.isTypeOnly() }));
}

function isTypeDeclaration(nodes: readonly Node[]): boolean {
  return nodes.length > 0 && nodes.every((node) => TYPE_ONLY_KINDS.has(node.getKindName()));
}

/**
 * Plan one deep specifier. `target` is the repo path it resolves to (a file).
 * @remarks A cross-module import needs named bindings: a default, namespace or side-effect import has no
 * door spelling that keeps its meaning, so it is refused for the operator rather than guessed.
 */
export function planDeepImport(declaration: ImportDeclaration | ExportDeclaration, from: PackageSource, target: string, reader: DoorReader): DeepImportPlan {
  const to = packageSourceOf(target);
  if (to === undefined || to.pkg !== from.pkg) {
    return { kind: "refuse", reason: `resolves outside ${from.srcRoot}` };
  }
  const fromModule = packageModuleOf(from.pkg, from.relative);
  const toModule: PackageModule = packageModuleOf(to.pkg, to.relative);
  // The door itself is already the narrowest leaf of its module, so a narrow importer still spells it as the door.
  const narrow = reader.narrowImporters.has(`${from.srcRoot}/${from.relative}`) && to.relative !== `${toModule.key}/index.ts`;
  if (fromModule.key === toModule.key || toModule.kind === "file" || narrow) {
    return { kind: "respell", spec: `${SOURCE_SUBPATH_PREFIX}${to.relative}`, exports: [] };
  }
  const names = namedTargets(declaration);
  if (names === undefined) {
    return { kind: "refuse", reason: `a default, namespace or side-effect import crosses into ${toModule.key}; it has no front-door spelling` };
  }
  const door = `${to.srcRoot}/${toModule.key}/index.ts`;
  const exports = doorExportsFor(names, door, target, reader);
  return "reason" in exports ? { kind: "refuse", reason: exports.reason } : { kind: "respell", spec: toModule.door, exports: exports.entries };
}

/** The re-exports `door` lacks for `names` from `target`; a name the door already binds elsewhere refuses. */
function doorExportsFor(
  names: readonly { readonly name: string; readonly typeOnly: boolean }[],
  door: string,
  target: string,
  reader: DoorReader,
): { readonly entries: readonly DoorExport[] } | { readonly reason: string } {
  const doorExports = reader.doorExports(door);
  const targetExports = reader.targetFile(target)?.getExportedDeclarations();
  const fromDoor = posix.relative(posix.dirname(door), target);
  const entries: DoorExport[] = [];
  for (const { name, typeOnly } of names) {
    const declared = targetExports?.get(name) ?? [];
    const existing = doorExports.get(name);
    if (declared.length === 0) {
      return { reason: `${target} exports no ${name}` };
    }
    if (existing !== undefined && existing[0] !== declared[0]) {
      return { reason: `${door} already exports a different ${name}` };
    }
    if (existing === undefined) {
      entries.push({ door, name, from: fromDoor.startsWith(".") ? fromDoor : `./${fromDoor}`, typeOnly: typeOnly || isTypeDeclaration(declared) });
    }
  }
  return { entries };
}

const byText = (a: string, b: string): number => a.localeCompare(b);

/** The re-export lines a door gains, one statement per source file and kind, names sorted. */
export function doorLines(exports: readonly DoorExport[]): string {
  const groups = new Map<string, { readonly typeOnly: boolean; readonly from: string; readonly names: Set<string> }>();
  for (const entry of exports) {
    const key = `${entry.typeOnly ? "type" : "value"}|${entry.from}`;
    const group = groups.get(key) ?? { typeOnly: entry.typeOnly, from: entry.from, names: new Set<string>() };
    group.names.add(entry.name);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => `export ${group.typeOnly ? "type " : ""}{ ${[...group.names].toSorted(byText).join(", ")} } from "${group.from}";`)
    .toSorted(byText)
    .join("\n");
}

/** A note in the relocate vocabulary, for one refused specifier. */
export function refusalNote(file: string, line: number, spec: string, reason: string): RelocateNote {
  return { file, line, text: spec, reason };
}
