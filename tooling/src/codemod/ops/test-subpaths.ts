// `pnpm codemod test-subpaths [--apply]` — give the root workspace a `#<package>/*` imports map onto each package's
// `src/`, and re-spell every module specifier under tests/ that climbs into packages/<pkg>/src through it. Package
// exports stay root-only: the map lives in the root manifest, which no package's code can resolve against.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import { ts } from "ts-morph";
import { print, REPO_ROOT } from "../../floor/artifacts/artifacts.ts";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { UsageError } from "../../floor/cli/run-tool.ts";
import { readAuthoredRepositoryPathnames } from "../../floor/compiler/authored-repository.ts";
import type { RelocateNote } from "../contract/relocate.ts";
import type { TestSubpathsResult } from "../contract/test-subpaths.ts";
import { isModulePosition } from "../lib/relocate-code.ts";
import { directoriesOf, literalEntity } from "../lib/workspace-specifiers.ts";

refuseDirectInvocation(import.meta.url, "pnpm codemod <verb>");

const USAGE = "usage: pnpm codemod test-subpaths [--apply]";
const ROOT_MANIFEST = "package.json";
const TEST_ROOT = "tests/";
const PACKAGE_SOURCE = /^packages\/([^/]+)\/src\/(.+)$/u;
const CODE = /\.(ts|tsx|mts)$/u;

/** `#<dir>/*` → `./packages/<dir>/src/*` for every workspace package that has a `src/`. */
function rootImports(tracked: readonly string[]): Readonly<Record<string, string>> {
  const dirs = [...new Set(tracked.map((path) => /^packages\/([^/]+)\/src\//u.exec(path)?.[1]).filter((dir) => dir !== undefined))].toSorted();
  return Object.fromEntries(dirs.map((dir) => [`#${dir}/*`, `./packages/${dir}/src/*`]));
}

/** The subpath spelling of a test's relative specifier into a package's `src/`, or undefined when it lands elsewhere. */
export function testSubpathOf(
  file: string,
  spec: string,
  world: { readonly files: ReadonlySet<string>; readonly dirs: ReadonlySet<string> },
): string | undefined {
  const entity = literalEntity(posix.normalize(posix.join(posix.dirname(file), spec)), { ...world, packages: [] });
  const match = entity === undefined ? undefined : PACKAGE_SOURCE.exec(entity.path);
  return match?.[1] === undefined || match[2] === undefined ? undefined : `#${match[1]}/${match[2]}`;
}

function rewriteFile(
  path: string,
  text: string,
  world: { readonly files: ReadonlySet<string>; readonly dirs: ReadonlySet<string> },
  notes: RelocateNote[],
): string {
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const edits: { readonly start: number; readonly end: number; readonly text: string }[] = [];
  const walk = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) && node.text.startsWith(".")) {
      const next = testSubpathOf(path, node.text, world);
      // `new URL(…, import.meta.url)` reads a file: a URL never resolves a subpath import, so it stays file-relative.
      if (next !== undefined && isModulePosition(node) && !ts.isNewExpression(node.parent)) {
        const start = node.getStart(source);
        edits.push({ start, end: node.getEnd(), text: `${text[start] ?? '"'}${next}${text[start] ?? '"'}` });
      } else if (next !== undefined) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        notes.push({ file: path, line, text: node.text, reason: `a path into a package outside a module position; its subpath would be ${next}` });
      }
      return;
    }
    ts.forEachChild(node, walk);
  };
  walk(source);
  let out = text;
  for (const edit of edits.toSorted((a, b) => b.start - a.start)) {
    out = `${out.slice(0, edit.start)}${edit.text}${out.slice(edit.end)}`;
  }
  return out;
}

/** Compute the migration over the authored tree. */
export function planTestSubpaths(root: string): TestSubpathsResult {
  const tracked = readAuthoredRepositoryPathnames(root).filter((path) => existsSync(join(root, path)));
  const world = { files: new Set(tracked), dirs: directoriesOf(tracked) };
  const writes = new Map<string, string>();
  const notes: RelocateNote[] = [];
  const manifest = JSON.parse(readFileSync(join(root, ROOT_MANIFEST), "utf8")) as Record<string, unknown>;
  manifest["imports"] = { ...(manifest["imports"] as Record<string, string> | undefined), ...rootImports(tracked) };
  writes.set(ROOT_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const path of tracked.filter((p) => p.startsWith(TEST_ROOT) && CODE.test(p))) {
    const text = readFileSync(join(root, path), "utf8");
    const next = rewriteFile(path, text, world, notes);
    if (next !== text) {
      writes.set(path, next);
    }
  }
  return { writes, notes };
}

export function testSubpathsOp(argv: readonly string[]): void {
  const unknown = argv.find((arg) => arg !== "--apply");
  if (unknown !== undefined) {
    throw new UsageError(`test-subpaths does not recognize ${JSON.stringify(unknown)} — ${USAGE}`);
  }
  const result = planTestSubpaths(REPO_ROOT);
  for (const note of result.notes) {
    print(`${note.file}:${note.line}: ${note.reason} — ${note.text}`);
  }
  const apply = argv.includes("--apply");
  print(`test-subpaths: ${result.writes.size} file(s) written, ${result.notes.length} note(s)${apply ? "" : " [dry-run]"}`);
  if (apply) {
    for (const [path, text] of result.writes) {
      writeFileSync(join(REPO_ROOT, path), text);
    }
  }
}
