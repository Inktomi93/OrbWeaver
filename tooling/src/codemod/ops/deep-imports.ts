// `pnpm codemod deep-imports [--apply]` — re-spell every parent-relative import two or more levels deep inside
// packages/*/src through the package's own subpath map: `#src/<path>` inside one module, the target module's
// front door across modules, widening the door with the re-exports it lacks. Dry-run by default; re-runnable.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import type { Node, Project, SourceFile } from "ts-morph";
import { print, REPO_ROOT } from "../../floor/artifacts/artifacts.ts";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { UsageError } from "../../floor/cli/run-tool.ts";
import { readAuthoredRepositoryPathnames } from "../../floor/compiler/authored-repository.ts";
import type { DeepImportsResult, DoorExport, DoorReader, PackageSource } from "../contract/deep-imports.ts";
import type { RelocateNote } from "../contract/relocate.ts";
import { doorLines, isDeepParent, packageSourceOf, planDeepImport, refusalNote } from "../lib/deep-imports.ts";
import { CodemodError } from "../lib/errors.ts";
import { createCodemodProject } from "../lib/project.ts";
import type { SpecifierWorld } from "../lib/workspace-specifiers.ts";
import { directoriesOf, literalEntity } from "../lib/workspace-specifiers.ts";

refuseDirectInvocation(import.meta.url, "pnpm codemod <verb>");

const NARROW_FLAG = "--narrow-graph=";
const NARROW_FILE_FLAG = "--narrow-file=";
const USAGE = "usage: pnpm codemod deep-imports [--narrow-graph=<entry path>]... [--narrow-file=<importer path>]... [--apply]";
const MODULE_MAP = "./src/*/index.ts";
const SOURCE_MAP_KEY = "#src/*";
const SOURCE_MAP_TARGET = "./src/*";
const PACKAGE_SOURCE_GLOBS = ["packages/*/src/**/*.ts", "packages/*/src/**/*.tsx"] as const;

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** Every package whose `#*` map is the house module map gains the file-level `#src/*` pattern beside it. */
function manifestWrites(root: string, tracked: readonly string[], writes: Map<string, string>): ReadonlySet<string> {
  const mapped = new Set<string>();
  for (const path of tracked.filter((p) => /^packages\/[^/]+\/package\.json$/u.test(p))) {
    const text = readFileSync(join(root, path), "utf8");
    const manifest = JSON.parse(text) as { imports?: Record<string, string> };
    if (manifest.imports?.["#*"] !== MODULE_MAP) {
      continue;
    }
    mapped.add(posix.dirname(path));
    if (manifest.imports[SOURCE_MAP_KEY] === undefined) {
      manifest.imports = { ...manifest.imports, [SOURCE_MAP_KEY]: SOURCE_MAP_TARGET };
      writes.set(path, `${JSON.stringify(manifest, null, 2)}\n`);
    }
  }
  return mapped;
}

function exportsMap(sourceFile: SourceFile | undefined): ReadonlyMap<string, readonly Node[]> {
  return sourceFile === undefined ? new Map() : sourceFile.getExportedDeclarations();
}

interface FileRespell {
  readonly text: string | undefined;
  readonly exports: readonly DoorExport[];
  readonly notes: readonly RelocateNote[];
  readonly respelled: number;
}

/** One package file's deep specifiers, re-spelled in place; untouched files return no text. */
function respellFile(sourceFile: SourceFile, from: PackageSource, world: SpecifierWorld, reader: DoorReader): FileRespell {
  const path = `${from.srcRoot}/${from.relative}`;
  const edits: Edit[] = [];
  const exports: DoorExport[] = [];
  const notes: RelocateNote[] = [];
  for (const declaration of [...sourceFile.getImportDeclarations(), ...sourceFile.getExportDeclarations()]) {
    const literal = declaration.getModuleSpecifier();
    const spec = declaration.getModuleSpecifierValue();
    if (literal === undefined || spec === undefined || !isDeepParent(spec)) {
      continue;
    }
    const entity = literalEntity(posix.normalize(posix.join(posix.dirname(path), spec)), world);
    const plan = entity === undefined ? ({ kind: "refuse", reason: "names nothing tracked" } as const) : planDeepImport(declaration, from, entity.path, reader);
    if (plan.kind === "refuse") {
      notes.push(refusalNote(path, literal.getStartLineNumber(), spec, plan.reason));
      continue;
    }
    edits.push({ start: literal.getStart(), end: literal.getEnd(), text: JSON.stringify(plan.spec) });
    exports.push(...plan.exports);
  }
  let text = sourceFile.getFullText();
  for (const edit of edits.toSorted((a, b) => b.start - a.start)) {
    text = `${text.slice(0, edit.start)}${edit.text}${text.slice(edit.end)}`;
  }
  return { text: edits.length > 0 ? text : undefined, exports, notes, respelled: edits.length };
}

/** One re-export per (door, name); two different sources for one name refuse, and any value use wins. */
function mergeDoorExports(pending: readonly DoorExport[]): readonly DoorExport[] {
  const byName = new Map<string, DoorExport>();
  for (const entry of pending) {
    const key = `${entry.door}|${entry.name}`;
    const prior = byName.get(key);
    if (prior !== undefined && prior.from !== entry.from) {
      throw new CodemodError(
        `deep-imports: ${entry.door} would export two different ${entry.name} (${prior.from}, ${entry.from})`,
        "Rename one export or import it through its own module.",
      );
    }
    // A type-only re-export of a binding some importer uses as a value would erase that value.
    byName.set(key, prior === undefined ? entry : { ...entry, typeOnly: prior.typeOnly && entry.typeOnly });
  }
  return [...byName.values()];
}

function writeDoors(root: string, exports: readonly DoorExport[], writes: Map<string, string>): void {
  for (const door of new Set(exports.map((entry) => entry.door))) {
    const lines = doorLines(exports.filter((entry) => entry.door === door));
    const current = writes.get(door) ?? (existsSync(join(root, door)) ? readFileSync(join(root, door), "utf8") : "");
    writes.set(door, current === "" ? `${lines}\n` : `${current.trimEnd()}\n${lines}\n`);
  }
}

/** Compute the migration over the authored tree. */
/** Every package file `entries` reach through static imports and re-exports, the entries included. */
function importGraphOf(project: Project, root: string, entries: readonly string[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const queue = entries.map((entry) => project.getSourceFile(join(root, entry))).filter((file) => file !== undefined);
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    const path = posix.relative(root, file.getFilePath());
    if (seen.has(path)) {
      continue;
    }
    seen.add(path);
    for (const declaration of [...file.getImportDeclarations(), ...file.getExportDeclarations()]) {
      const next = declaration.getModuleSpecifierSourceFile();
      if (next !== undefined && packageSourceOf(posix.relative(root, next.getFilePath())) !== undefined) {
        queue.push(next);
      }
    }
  }
  return seen;
}

/**
 * Compute the migration over the authored tree.
 * @param narrowEntries - worker entries whose whole import graph keeps narrow leaf imports across modules, because
 * a dep-cruiser worker rule bounds that graph and a front-door barrel would widen it.
 * @param narrowFiles - single importers that keep narrow leaf imports, e.g. a file a DOM-free compiler world owns
 * whose target module's barrel re-exports DOM modules.
 */
export function planDeepImports(root: string, narrowEntries: readonly string[] = [], narrowFiles: readonly string[] = []): DeepImportsResult {
  const tracked = readAuthoredRepositoryPathnames(root).filter((path) => existsSync(join(root, path)));
  const writes = new Map<string, string>();
  const mapped = manifestWrites(root, tracked, writes);
  const world: SpecifierWorld = { files: new Set(tracked), dirs: directoriesOf(tracked), packages: [] };
  const project = createCodemodProject({ replaceGlobs: PACKAGE_SOURCE_GLOBS.map((glob) => `${root}/${glob}`) }, root);
  const reader: DoorReader = {
    targetFile: (path) => project.getSourceFile(join(root, path)),
    doorExports: (door) => exportsMap(project.getSourceFile(join(root, door))),
    narrowImporters: new Set([...importGraphOf(project, root, narrowEntries), ...narrowFiles]),
  };
  const notes: RelocateNote[] = [];
  const pending: DoorExport[] = [];
  let respelled = 0;
  for (const sourceFile of project.getSourceFiles()) {
    const path = posix.relative(root, sourceFile.getFilePath());
    const from = packageSourceOf(path);
    if (from === undefined || !mapped.has(posix.dirname(from.srcRoot))) {
      continue;
    }
    const file = respellFile(sourceFile, from, world, reader);
    if (file.text !== undefined) {
      writes.set(path, file.text);
    }
    pending.push(...file.exports);
    notes.push(...file.notes);
    respelled += file.respelled;
  }
  const exports = mergeDoorExports(pending);
  writeDoors(root, exports, writes);
  return { writes, notes, respelled, doorExports: exports.length };
}

export function deepImportsOp(argv: readonly string[]): void {
  const unknown = argv.find((arg) => arg !== "--apply" && !arg.startsWith(NARROW_FLAG) && !arg.startsWith(NARROW_FILE_FLAG));
  if (unknown !== undefined) {
    throw new UsageError(`deep-imports does not recognize ${JSON.stringify(unknown)} — ${USAGE}`);
  }
  const narrowEntries = argv.filter((arg) => arg.startsWith(NARROW_FLAG)).map((arg) => arg.slice(NARROW_FLAG.length));
  const narrowFiles = argv.filter((arg) => arg.startsWith(NARROW_FILE_FLAG)).map((arg) => arg.slice(NARROW_FILE_FLAG.length));
  const result = planDeepImports(REPO_ROOT, narrowEntries, narrowFiles);
  for (const note of result.notes) {
    print(`${note.file}:${note.line}: ${note.reason} — ${note.text}`);
  }
  const apply = argv.includes("--apply");
  print(
    `deep-imports: ${result.respelled} specifier(s) re-spelled, ${result.doorExports} door export(s) added, ${result.writes.size} file(s) written, ${result.notes.length} refusal(s)${apply ? "" : " [dry-run]"}`,
  );
  if (apply) {
    for (const [path, text] of result.writes) {
      mkdirSync(dirname(join(REPO_ROOT, path)), { recursive: true });
      writeFileSync(join(REPO_ROOT, path), text);
    }
  }
}
