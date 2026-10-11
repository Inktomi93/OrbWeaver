// `pnpm codemod relocate <plan.json> [--apply]` — move files by a declared plan and re-spell every module
// specifier, package-map subpath and repo-path citation that named them. Dry-run by default. A plan is
// re-runnable on a newer tree: it names directories and role globs, never a file census.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { print, REPO_ROOT } from "../../floor/artifacts/artifacts.ts";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { UsageError } from "../../floor/cli/run-tool.ts";
import { readAuthoredRepositoryPathnames } from "../../floor/compiler/authored-repository.ts";
import type { ManifestEdit, RelocateNote, RelocatePlan, WorkspacePackage } from "../contract/relocate.ts";
import { relocatePlanSchema } from "../contract/relocate.ts";
import type { RelocateWorlds } from "../lib/relocate-code.ts";
import { relocateCode } from "../lib/relocate-code.ts";
import type { MoveMap } from "../lib/relocate-map.ts";
import { expandMoves, mapPath } from "../lib/relocate-map.ts";
import { applyLiterals, citationRewriter } from "../lib/relocate-text.ts";
import type { SpecifierWorld } from "../lib/workspace-specifiers.ts";
import { directoriesOf, readWorkspacePackages } from "../lib/workspace-specifiers.ts";

refuseDirectInvocation(import.meta.url, "pnpm codemod <verb>");

const CODE_EXTENSIONS: ReadonlySet<string> = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".jsx"]);
const TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  ...CODE_EXTENSIONS,
  ".json",
  ".jsonc",
  ".md",
  ".yml",
  ".yaml",
  ".toml",
  ".txt",
  ".sh",
  ".cmd",
  ".html",
  ".css",
]);
const USAGE = "usage: pnpm codemod relocate <plan.json> [--apply]";

/** The relocation computed in memory: new path → new bytes for every file that moves or changes. */
export interface RelocateResult {
  readonly moves: MoveMap;
  readonly writes: ReadonlyMap<string, string>;
  readonly notes: readonly RelocateNote[];
  readonly residue: readonly RelocateNote[];
}

function withManifest(pkg: WorkspacePackage, edit: ManifestEdit | undefined): WorkspacePackage {
  return edit === undefined ? pkg : { ...pkg, exports: edit.exports ?? pkg.exports, imports: edit.imports ?? pkg.imports };
}

function worldsFor(root: string, plan: RelocatePlan, tracked: readonly string[], moves: MoveMap): RelocateWorlds {
  const packages = readWorkspacePackages(root, tracked);
  const before: SpecifierWorld = { files: new Set(tracked), dirs: directoriesOf(tracked), packages };
  const afterFiles = tracked.map((path) => mapPath(path, moves));
  const after: SpecifierWorld = {
    files: new Set(afterFiles),
    dirs: directoriesOf(afterFiles),
    packages: packages.map((pkg) => withManifest(pkg, plan.manifests[pkg.dir === "" ? "package.json" : `${pkg.dir}/package.json`])),
  };
  return { before, after, moves };
}

function editManifest(text: string, edit: ManifestEdit): string {
  const manifest = JSON.parse(text) as Record<string, unknown>;
  if (edit.exports !== undefined) {
    manifest["exports"] = edit.exports;
  }
  if (edit.imports !== undefined) {
    manifest["imports"] = edit.imports;
  }
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

const RESIDUE_LINE_CHARS = 200;

function residueOf(path: string, text: string, needles: readonly string[]): RelocateNote[] {
  return text.split(/\r?\n/u).flatMap((line, index) => {
    const needle = needles.find((n) => line.includes(n));
    return needle === undefined ? [] : [{ file: path, line: index + 1, text: line.trim().slice(0, RESIDUE_LINE_CHARS), reason: `residue: ${needle}` }];
  });
}

interface RewriteContext {
  readonly root: string;
  readonly plan: RelocatePlan;
  readonly worlds: RelocateWorlds;
  readonly citations: ReturnType<typeof citationRewriter>;
  readonly needles: readonly string[];
}

/** One text file's new bytes and notes; a file no move, needle or literal touches is only re-read. */
function rewriteFile(path: string, ctx: RewriteContext): { readonly text: string; readonly original: string; readonly notes: readonly RelocateNote[] } {
  const original = readFileSync(join(ctx.root, path), "utf8");
  const manifest = ctx.plan.manifests[path];
  const text = manifest === undefined ? original : editManifest(original, manifest);
  const moved = mapPath(path, ctx.worlds.moves) !== path;
  const relevant = moved || ctx.needles.some((needle) => original.includes(needle)) || ctx.plan.literals.some(([from]) => original.includes(from));
  if (!relevant) {
    return { text, original, notes: [] };
  }
  const code = CODE_EXTENSIONS.has(posix.extname(path)) ? relocateCode(path, text, ctx.worlds) : { text, notes: [] };
  return { text: applyLiterals(ctx.citations.rewrite(code.text), ctx.plan.literals), original, notes: code.notes };
}

/** Compute the relocation without touching the tree. */
export function planRelocation(root: string, plan: RelocatePlan): RelocateResult {
  const tracked = readAuthoredRepositoryPathnames(root).filter((path) => existsSync(join(root, path)));
  const moves = expandMoves(plan, tracked);
  const ctx: RewriteContext = {
    root,
    plan,
    worlds: worldsFor(root, plan, tracked, moves),
    citations: citationRewriter(moves),
    needles: [...new Set(plan.moves.map((move) => posix.basename(move.from)))],
  };
  const writes = new Map<string, string>();
  const notes: RelocateNote[] = [];
  const residue: RelocateNote[] = [];
  for (const path of tracked) {
    const excluded = plan.exclude.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
    if (excluded || !TEXT_EXTENSIONS.has(posix.extname(path))) {
      continue;
    }
    const after = mapPath(path, moves);
    const file = rewriteFile(path, ctx);
    if (file.text !== file.original) {
      writes.set(after, file.text);
    }
    notes.push(...file.notes);
    residue.push(...residueOf(after, file.text, plan.residue));
  }
  return { moves, writes, notes, residue };
}

function pruneEmptyDirs(root: string, dir: string): void {
  for (let current = dir; current !== "." && current !== ""; current = posix.dirname(current)) {
    const abs = join(root, current);
    if (!existsSync(abs) || readdirSync(abs).length > 0) {
      return;
    }
    rmdirSync(abs);
  }
}

/** Write a computed relocation: moved files land at their new path, then the vacated directories go. */
export function applyRelocation(root: string, result: RelocateResult): void {
  for (const [from, to] of result.moves.files) {
    mkdirSync(dirname(join(root, to)), { recursive: true });
    renameSync(join(root, from), join(root, to));
  }
  for (const [path, text] of result.writes) {
    writeFileSync(join(root, path), text);
  }
  for (const from of result.moves.files.keys()) {
    pruneEmptyDirs(root, posix.dirname(from));
  }
}

export function relocateOp(argv: readonly string[]): void {
  const apply = argv.includes("--apply");
  const rest = argv.filter((arg) => arg !== "--apply");
  const unknown = rest.find((arg) => arg.startsWith("-"));
  if (unknown !== undefined || rest.length !== 1 || rest[0] === undefined) {
    throw new UsageError(unknown === undefined ? USAGE : `relocate does not recognize ${JSON.stringify(unknown)} — ${USAGE}`);
  }
  const plan = relocatePlanSchema.parse(JSON.parse(readFileSync(rest[0], "utf8")));
  const result = planRelocation(REPO_ROOT, plan);
  for (const note of [...result.notes, ...result.residue]) {
    print(`${note.file}:${note.line}: ${note.reason} — ${note.text}`);
  }
  print(
    `relocate: ${result.moves.files.size} file(s) move, ${result.writes.size} file(s) written, ${result.notes.length} note(s), ${result.residue.length} residue line(s)${apply ? "" : " [dry-run]"}`,
  );
  if (apply) {
    applyRelocation(REPO_ROOT, result);
  }
}
