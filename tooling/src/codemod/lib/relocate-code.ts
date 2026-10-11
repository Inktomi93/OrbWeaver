// Re-spells every path literal in one code file for a relocation. A literal in a module-specifier position
// is rewritten; a relative literal anywhere else that names a moved entity is reported, never guessed,
// because only the module positions have a known base (the file's own directory).
import { posix } from "node:path";
import { ts } from "ts-morph";
import type { RelocateNote, WorkspacePackage } from "../contract/relocate.ts";
import type { MoveMap } from "./relocate-map.ts";
import { isSplitDirectory, mapPath } from "./relocate-map.ts";
import type { SpecifierWorld } from "./workspace-specifiers.ts";
import { literalEntity, packageOf, relativeSpecifier, resolvePackageSpecifier, reversePackageSpecifier } from "./workspace-specifiers.ts";

/** The two trees a rewrite translates between. */
export interface RelocateWorlds {
  readonly before: SpecifierWorld;
  readonly after: SpecifierWorld;
  readonly moves: MoveMap;
}

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const MODULE_CALLEES: ReadonlySet<string> = new Set([
  "require",
  "require.resolve",
  "import.meta.resolve",
  "vi.mock",
  "vi.doMock",
  "vi.unmock",
  "vi.doUnmock",
  "vi.importActual",
  "vi.importMock",
]);
const PATH_JOINERS: ReadonlySet<string> = new Set(["join", "resolve", "posix.join", "posix.resolve", "path.join", "path.resolve"]);
const DOTS_ONLY = /^[./]+$/u;
const DIRNAME_BASES: ReadonlySet<string> = new Set(["import.meta.dirname", "__dirname"]);

function isRelative(spec: string): boolean {
  return spec === "." || spec === ".." || spec.startsWith("./") || spec.startsWith("../");
}

/** True when the literal sits where a module specifier is read: an import, export, `import()`, require, mock or `new URL(…, import.meta.url)`. */
export function isModulePosition(node: ts.StringLiteralLike): boolean {
  const parent = node.parent;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent)) {
    return true;
  }
  if (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent)) {
    return true;
  }
  if (ts.isCallExpression(parent) && parent.arguments[0] === node) {
    const callee = parent.expression;
    return (
      callee.kind === ts.SyntaxKind.ImportKeyword ||
      MODULE_CALLEES.has(callee.getText()) ||
      (ts.isCallExpression(callee) && callee.expression.getText() === "createRequire")
    );
  }
  return (
    ts.isNewExpression(parent) &&
    parent.expression.getText() === "URL" &&
    parent.arguments?.[0] === node &&
    parent.arguments[1]?.getText() === "import.meta.url"
  );
}

/** The new relative spelling of `spec`, or a reason it has none; undefined when it names nothing tracked. */
function relocateRelative(spec: string, file: string, worlds: RelocateWorlds): { readonly spec: string } | { readonly reason: string } | undefined {
  const trailing = spec.endsWith("/") && spec.length > 1 ? "/" : "";
  const literalPath = posix.normalize(posix.join(posix.dirname(file), spec)).replace(/\/$/u, "");
  const entity = literalPath.startsWith("../") || literalPath === ".." ? undefined : literalEntity(literalPath, worlds.before);
  if (entity === undefined) {
    return;
  }
  if (isSplitDirectory(entity.path, worlds.moves)) {
    return { reason: `names ${entity.path}, a directory split by role` };
  }
  const moved = mapPath(entity.path, worlds.moves);
  const target = entity.suffix === "" ? moved : moved.slice(0, moved.length - entity.suffix.length);
  return { spec: `${relativeSpecifier(posix.dirname(mapPath(file, worlds.moves)), target)}${trailing}` };
}

function respellPackage(target: string, importerAfter: string, hash: boolean, worlds: RelocateWorlds): string | undefined {
  const moved = mapPath(target, worlds.moves);
  const owner: WorkspacePackage | undefined = packageOf(moved, worlds.after.packages);
  if (owner === undefined || (hash && packageOf(importerAfter, worlds.after.packages)?.name !== owner.name)) {
    return;
  }
  return reversePackageSpecifier(moved, owner, hash ? "imports" : "exports");
}

/** One file's rewrite state: the source being read, the edits queued, and what was left for the operator. */
interface FileVisit {
  readonly file: string;
  readonly afterFile: string;
  readonly source: ts.SourceFile;
  readonly worlds: RelocateWorlds;
  readonly edits: Edit[];
  readonly notes: RelocateNote[];
}

function note(visit: FileVisit, node: ts.Node, text: string, reason: string): void {
  visit.notes.push({ file: visit.afterFile, line: visit.source.getLineAndCharacterOfPosition(node.getStart(visit.source)).line + 1, text, reason });
}

function literalEdit(visit: FileVisit, node: ts.StringLiteralLike, next: string): void {
  const start = node.getStart(visit.source);
  const quote = visit.source.text[start] ?? '"';
  visit.edits.push({ start, end: node.getEnd(), text: `${quote}${next}${quote}` });
}

function visitRelative(visit: FileVisit, node: ts.StringLiteralLike): void {
  const spec = node.text;
  const modulePosition = isModulePosition(node);
  // A bare dot run outside a module position is a path segment for some other base, never this file's.
  if (!modulePosition && DOTS_ONLY.test(spec)) {
    return;
  }
  const next = relocateRelative(spec, visit.file, visit.worlds);
  if (next === undefined) {
    if (visit.afterFile !== visit.file && modulePosition) {
      note(visit, node, spec, "a module specifier in a moved file names nothing tracked");
    }
    return;
  }
  if ("reason" in next) {
    note(visit, node, spec, next.reason);
  } else if (next.spec !== spec && modulePosition) {
    literalEdit(visit, node, next.spec);
  } else if (next.spec !== spec) {
    note(visit, node, spec, `a relative literal outside a module position; its file-relative spelling would be ${next.spec}`);
  }
}

function visitPackage(visit: FileVisit, node: ts.StringLiteralLike): void {
  const spec = node.text;
  const { worlds, afterFile } = visit;
  const target = resolvePackageSpecifier(spec, visit.file, worlds.before);
  if (target === undefined || resolvePackageSpecifier(spec, afterFile, worlds.after) === mapPath(target, worlds.moves)) {
    return;
  }
  const next = respellPackage(target, afterFile, spec.startsWith("#"), worlds);
  if (next === undefined) {
    note(visit, node, spec, `no package map spells ${mapPath(target, worlds.moves)}`);
  } else {
    literalEdit(visit, node, next);
  }
}

/** `join(import.meta.dirname, "..", "..")`: a file-relative path spelled as segments. False when not that shape. */
function visitJoin(visit: FileVisit, call: ts.CallExpression): boolean {
  const [base, ...rest] = call.arguments;
  const literals = rest.filter((arg): arg is ts.StringLiteralLike => ts.isStringLiteralLike(arg));
  const first = literals[0];
  const last = literals.at(-1);
  if (base === undefined || !DIRNAME_BASES.has(base.getText(visit.source)) || first === undefined || last === undefined || literals.length !== rest.length) {
    return false;
  }
  const joined = posix.join(...literals.map((arg) => arg.text));
  const next = relocateRelative(isRelative(joined) ? joined : `./${joined}`, visit.file, visit.worlds);
  if (next !== undefined && "reason" in next) {
    note(visit, call, call.getText(visit.source), next.reason);
  } else if (next !== undefined && posix.normalize(next.spec) !== posix.normalize(joined)) {
    const segments = next.spec.replace(/^\.\//u, "").split("/");
    visit.edits.push({ start: first.getStart(visit.source), end: last.getEnd(), text: segments.map((segment) => JSON.stringify(segment)).join(", ") });
  }
  return true;
}

/** Rewrite one code file's path literals; returns the new text and what it could not decide. */
export function relocateCode(file: string, text: string, worlds: RelocateWorlds): { readonly text: string; readonly notes: readonly RelocateNote[] } {
  const kind = file.endsWith(".tsx") || file.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const visit: FileVisit = { file, afterFile: mapPath(file, worlds.moves), source, worlds, edits: [], notes: [] };
  const walk = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node)) {
      if (isRelative(node.text)) {
        visitRelative(visit, node);
      } else if (isModulePosition(node)) {
        visitPackage(visit, node);
      }
      return;
    }
    if (ts.isCallExpression(node) && PATH_JOINERS.has(node.expression.getText(source)) && visitJoin(visit, node)) {
      return;
    }
    ts.forEachChild(node, walk);
  };
  walk(source);
  let out = text;
  for (const edit of visit.edits.toSorted((a, b) => b.start - a.start)) {
    out = `${out.slice(0, edit.start)}${edit.text}${out.slice(edit.end)}`;
  }
  return { text: out, notes: visit.notes };
}
