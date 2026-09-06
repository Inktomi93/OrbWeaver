// File operations: move / copy / delete with snapshots + guards.
// ── §8 ─ File operations ─────────────────────────────────────────────────────

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, posix } from "node:path";
import type { Project, SourceFile } from "ts-morph";
import type { CodemodContext, OperationOptions, Plan } from "../contract/types.ts";
import { absolutePath, assert, noteSuffix, repoRelative } from "./plans.ts";

/** A relative module specifier (`./x`, `../x`) — the only kind `SourceFile.move()` recomputes. */
const RELATIVE_SPECIFIER = /^\.{1,2}\//u;
/** A specifier that already states a module file extension. */
const HAS_MODULE_EXTENSION = /\.([cm]?[jt]sx?|json)$/u;
/** The extensions a rewritten relative specifier may be pointing at, in resolution order. */
const SOURCE_EXTENSIONS = [".ts", ".tsx"] as const;

/** Every module-specifier literal in `sf`, by its current text. */
function specifierTexts(sf: SourceFile): Set<string> {
  return new Set(sf.getImportStringLiterals().map((literal) => literal.getLiteralText()));
}

/**
 * Put the file extension back on every specifier `SourceFile.move()` just rewrote (#1781).
 *
 * ts-morph recomputes a moved module's relative specifiers WITHOUT one (`"./verbs/participants"`), and
 * this repo imports with explicit extensions. The result is GREEN under the root program (bundler
 * resolution — what `types:graph` runs) and RED under the per-package `node16` program (TS2835) plus
 * biome's `useImportExtensions`, so a lane whose floor named only one type program ships it.
 *
 * Scoped to specifiers whose TEXT CHANGED across the move (`before`), never every extensionless
 * specifier in the file: a codebase that imports extensionlessly on purpose must not be "fixed" by a
 * move, and the plan only declared the blast radius of the move itself.
 */
function restoreRewrittenSpecifierExtensions(project: Project, before: ReadonlyMap<SourceFile, ReadonlySet<string>>): void {
  for (const [sf, priorTexts] of before) {
    const fromDir = posix.dirname(sf.getFilePath());
    for (const literal of sf.getImportStringLiterals()) {
      const spec = literal.getLiteralText();
      if (priorTexts.has(spec) || !RELATIVE_SPECIFIER.test(spec) || HAS_MODULE_EXTENSION.test(spec)) {
        continue;
      }
      const target = posix.resolve(fromDir, spec);
      const ext = SOURCE_EXTENSIONS.find((candidate) => project.getSourceFile(`${target}${candidate}`) !== undefined);
      if (ext !== undefined) {
        literal.setLiteralValue(`${spec}${ext}`);
      }
    }
  }
}

/**
 * Move source files. Wraps `SourceFile.move()` (which auto-recomputes
 * relative import specifiers across the entire project — that's the load-
 * bearing magic). After applying, run `repointAliasPaths` if your codebase
 * uses `#aliases/...` style imports (ts-morph doesn't follow those).
 *
 * Validates:
 *   - Source exists in the project
 *   - Destination doesn't already exist (unless `confirm: true` AND the
 *     destination's content is empty — defensive against accidental
 *     overwrites of populated files)
 *   - Source and destination both resolve inside the repo
 *
 * Quirks: ts-morph's move() keeps the SourceFile object alive at its NEW
 * path. Don't hold the source path around after planning a move — look it
 * up by the new path if you need to access it again.
 *
 * Two ts-morph behaviours this helper NORMALISES, so no codemod has to hand-roll them again (both were
 * paid for by the #1010 roster rename, which spent three dry-run iterations on them):
 *   - #1778 the phantom left at the vacated path is forgotten, so it cannot feed the harness's
 *     pre-emit diagnostics check stale errors and refuse the apply;
 *   - #1781 every specifier the move rewrote keeps its explicit file extension.
 */
export function moveFiles(ctx: CodemodContext, moves: ReadonlyArray<readonly [from: string, to: string]>, opts: OperationOptions = {}): Plan {
  assert(moves.length > 0, "moveFiles called with empty moves list", "Skip the call or pass at least one move.");

  // Validate paths up front — fail loudly before we touch the in-memory
  // project, so a typo in the move list aborts cleanly.
  const resolved = moves.map(([from, to]) => {
    const fromAbs = absolutePath(from, ctx.repoRoot);
    const toAbs = absolutePath(to, ctx.repoRoot);
    const sf = ctx.project.getSourceFile(fromAbs);
    assert(
      sf !== undefined,
      `moveFiles: source not in project: ${repoRelative(fromAbs, ctx.repoRoot)}`,
      "Was it added to the project by createCodemodProject's globs? Or already moved by a previous helper?",
    );
    if (existsSync(toAbs)) {
      const targetText = readFileSync(toAbs, "utf-8");
      // biome-ignore lint/nursery/noConditionalExpect: this is our own guard-clause assert() helper, not vitest's expect().
      assert(
        opts.confirm === true && targetText.length === 0,
        `moveFiles: destination already exists: ${repoRelative(toAbs, ctx.repoRoot)}`,
        "Pass { confirm: true } only if you've verified you want to overwrite (the target must be empty for safety).",
      );
    }
    return { fromAbs, toAbs, sf };
  });

  const touched = new Set<string>();
  for (const { fromAbs, toAbs } of resolved) {
    touched.add(fromAbs);
    touched.add(toAbs);
  }

  return {
    description: `Move ${moves.length} file(s)${noteSuffix(opts)}`,
    touchedFiles: [...touched],
    transform(innerCtx): void {
      // Every file whose specifiers move() may rewrite — the movers themselves plus their importers —
      // paired with the specifier texts they carried BEFORE the moves. That pairing is what scopes the
      // extension restore below to the rewrites this plan caused.
      const before = new Map<SourceFile, ReadonlySet<string>>();
      for (const { sf, fromAbs, toAbs } of resolved) {
        // move() rewrites the relative specifier in every importer too. Declare that set here —
        // it's only knowable at transform time (an earlier plan may have added or dropped an
        // importer), and an undeclared rewrite would be missing from the preview.
        for (const referencing of [sf, ...sf.getReferencingSourceFiles()]) {
          innerCtx.snapshot(referencing);
          if (!before.has(referencing)) {
            before.set(referencing, specifierTexts(referencing));
          }
        }
        // SourceFile.move() returns the same SourceFile at the new path AND
        // updates every importer of the old path within the project graph.
        sf.move(toAbs);
        // …and at REAL repo scale it leaves a PHANTOM behind (#1778, reproduced on a 6,147-file project
        // and NOT at fixture scale): `getSourceFile(<old path>)` keeps answering with a distinct
        // SourceFile carrying the pre-move text, re-read from the disk copy `saveSync` has not deleted
        // yet. The old path is declared, so the harness's pre-emit diagnostics check scans the phantom
        // and its now-genuinely-stale errors REFUSE the apply — a codemod that can never be applied and
        // no hint why. `forget()` detaches the wrapper only; the queued move/delete still runs on save.
        const phantom = innerCtx.project.getSourceFile(fromAbs);
        if (phantom !== undefined && phantom !== sf) {
          before.delete(phantom);
          phantom.forget();
        }
      }
      restoreRewrittenSpecifierExtensions(innerCtx.project, before);
    },
  };
}

/**
 * Delete source files. Refuses without `confirm: true`. After the plan
 * runs the in-memory project considers them deleted; the harness's saveSync
 * physically removes them.
 *
 * Validates:
 *   - File exists in the project
 *   - Path is inside the repo
 *   - `confirm: true` was passed
 *
 * If you want to delete a file AND its test sibling, call this once with
 * both paths.
 */
export function deleteFiles(ctx: CodemodContext, paths: readonly string[], opts: OperationOptions): Plan {
  assert(opts.confirm === true, "deleteFiles refuses to run without { confirm: true }", "Pass { confirm: true } only after you've reviewed the list of paths.");
  assert(paths.length > 0, "deleteFiles called with empty paths list");

  const resolved = paths.map((p) => {
    const abs = absolutePath(p, ctx.repoRoot);
    const sf = ctx.project.getSourceFile(abs);
    assert(
      sf !== undefined,
      `deleteFiles: file not in project: ${repoRelative(abs, ctx.repoRoot)}`,
      "Was it added to the project? Already deleted by a previous plan?",
    );
    return { abs, sf };
  });

  return {
    description: `Delete ${paths.length} file(s)${noteSuffix(opts)}`,
    touchedFiles: resolved.map((r) => r.abs),
    transform(): void {
      for (const { sf } of resolved) {
        sf.delete();
      }
    },
  };
}

/**
 * Create a new source file with the given text. Refuses to overwrite an
 * existing file unless `confirm: true`. The new file is auto-snapshotted as
 * a creation so the preview correctly labels it `+ new file`.
 */
export function createSourceFile(ctx: CodemodContext, filePath: string, text: string, opts: OperationOptions = {}): Plan {
  const abs = absolutePath(filePath, ctx.repoRoot);
  const exists = existsSync(abs) || ctx.project.getSourceFile(abs) !== undefined;
  if (exists) {
    // biome-ignore lint/nursery/noConditionalExpect: this is our own guard-clause assert() helper, not vitest's expect().
    assert(opts.confirm === true, `createSourceFile: ${repoRelative(abs, ctx.repoRoot)} already exists`, "Pass { confirm: true } if you intend to overwrite.");
  }

  return {
    description: `Create ${repoRelative(abs, ctx.repoRoot)}${noteSuffix(opts)}`,
    touchedFiles: [abs],
    transform(innerCtx): void {
      // Make sure the parent dir exists in-memory (ts-morph handles this on
      // saveSync, but mkdirSync the physical dir if we're going to apply so
      // saveSync has a path to write to — saveSync doesn't mkdir -p).
      if (!innerCtx.isDryRun) {
        const parent = dirname(abs);
        if (!existsSync(parent)) {
          mkdirSync(parent, { recursive: true });
        }
      }
      innerCtx.project.createSourceFile(abs, text, { overwrite: opts.confirm === true });
    },
  };
}

/**
 * Copy a source file to a new path. The new file is a real ts-morph clone
 * (so any references in it that pointed at relative paths get rewritten to
 * be valid from the new location). Useful as a building block when you want
 * to "fork" a file into two — copy, then edit each side.
 */
export function copyFile(ctx: CodemodContext, from: string, to: string, opts: OperationOptions = {}): Plan {
  const fromAbs = absolutePath(from, ctx.repoRoot);
  const toAbs = absolutePath(to, ctx.repoRoot);
  const sf = ctx.project.getSourceFile(fromAbs);
  assert(sf !== undefined, `copyFile: source not in project: ${repoRelative(fromAbs, ctx.repoRoot)}`);
  if (existsSync(toAbs)) {
    // biome-ignore lint/nursery/noConditionalExpect: this is our own guard-clause assert() helper, not vitest's expect().
    assert(
      opts.confirm === true,
      `copyFile: destination already exists: ${repoRelative(toAbs, ctx.repoRoot)}`,
      "Pass { confirm: true } if you intend to overwrite.",
    );
  }
  return {
    description: `Copy ${repoRelative(fromAbs, ctx.repoRoot)} → ${repoRelative(toAbs, ctx.repoRoot)}`,
    touchedFiles: [fromAbs, toAbs],
    transform(): void {
      sf.copy(toAbs, { overwrite: opts.confirm === true });
    },
  };
}
