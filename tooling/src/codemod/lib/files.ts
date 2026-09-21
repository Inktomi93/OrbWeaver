// File operations: move / copy / delete with snapshots + guards.
// ── §8 ─ File operations ─────────────────────────────────────────────────────

import { existsSync, readFileSync } from "node:fs";
import { canonicalCompilerPath } from "@orb/tooling/_shared/ts-workspace";
import type { SourceFile } from "ts-morph";
import type { CodemodContext, OperationOptions, Plan } from "../contract/types.ts";
import { CodemodError } from "./errors.ts";
import type { ResolvedMove } from "./move-relations.ts";
import { assertNoUnresolvedMoveRelations, resolvedMoveRelations, sourceRewrites } from "./move-relations.ts";
import { absolutePath, assert, noteSuffix, physicalPathIdentity, repoRelative } from "./plans.ts";

/**
 * Move source files as one resolved-identity batch. The helper records every affected relative
 * module edge before mutation, temporarily severs those edges so `SourceFile.move()` does not
 * re-walk and rewrite the same importers once per mover, then restores the final specifiers from
 * their owning/target SourceFile identities. After applying, run `repointAliasPaths` if your
 * codebase uses `#aliases/...` style imports (TypeScript cannot resolve every alias scheme).
 *
 * Validates:
 *   - Source exists in the project
 *   - Destination doesn't already exist (unless `confirm: true` AND the
 *     destination's content is empty — defensive against accidental
 *     overwrites of populated files)
 *   - Source and destination both resolve inside the repo
 *   - Every relative edge that must move resolves to a loaded SourceFile identity; an unresolved
 *     edge refuses instead of receiving a guessed text rewrite
 *
 * Quirks: ts-morph's move() keeps the SourceFile object alive at its NEW
 * path. Don't hold the source path around after planning a move — look it
 * up by the new path if you need to access it again.
 *
 * Two ts-morph behaviours this helper NORMALISES, so no codemod has to hand-roll them again (both were
 * paid for by the #1010 roster rename, which spent three dry-run iterations on them):
 *   - #1778 the phantom left at the vacated path is forgotten, so it cannot feed the harness's
 *     pre-emit diagnostics check stale errors and refuse the apply;
 *   - #1781 every specifier keeps the caller's exact explicit extension (including `.js` → TS
 *     resolution) or stays extensionless.
 */
export function moveFiles(ctx: CodemodContext, moves: ReadonlyArray<readonly [from: string, to: string]>, opts: OperationOptions = {}): Plan {
  assert(moves.length > 0, "moveFiles called with empty moves list", "Skip the call or pass at least one move.");

  // Validate paths up front — fail loudly before we touch the in-memory
  // project, so a typo in the move list aborts cleanly.
  const resolved: ResolvedMove[] = moves.map(([from, to]) => {
    const fromAbs = absolutePath(from, ctx.repoRoot);
    const toAbs = absolutePath(to, ctx.repoRoot);
    assert(
      fromAbs !== toAbs,
      `moveFiles: source and destination are the same: ${repoRelative(fromAbs, ctx.repoRoot)}`,
      "Remove the no-op pair from the move list.",
    );
    const sf = ctx.project.getSourceFile(fromAbs);
    assert(
      sf !== undefined,
      `moveFiles: source not in project: ${repoRelative(fromAbs, ctx.repoRoot)}`,
      "Was it added to the project by createCodemodProject's globs? Or already moved by a previous helper?",
    );
    // Destination identity stays lexical until the final physical-collision guard. Asking ts-morph
    // to resolve an unborn path through a directory symlink can throw instead of returning undefined.
    const inProjectTarget = ctx.project.getSourceFiles().find((sourceFile) => sourceFile.getFilePath() === toAbs);
    if (existsSync(toAbs) || inProjectTarget !== undefined) {
      const targetText = existsSync(toAbs) ? readFileSync(toAbs, "utf-8") : (inProjectTarget?.getFullText() ?? "");
      // biome-ignore lint/nursery/noConditionalExpect: this is our own guard-clause assert() helper, not vitest's expect().
      assert(
        opts.confirm === true && targetText.length === 0,
        `moveFiles: destination already exists: ${repoRelative(toAbs, ctx.repoRoot)}`,
        "Pass { confirm: true } only if you've verified you want to overwrite (the target must be empty for safety).",
      );
    }
    const targetPhysical = physicalPathIdentity(toAbs, ctx.repoRoot);
    const aliasedTarget = ctx.project
      .getSourceFiles()
      .find((sourceFile) => sourceFile.getFilePath() !== toAbs && physicalPathIdentity(sourceFile.getFilePath(), ctx.repoRoot) === targetPhysical);
    if (aliasedTarget !== undefined) {
      throw new CodemodError(
        `Physical path collision: ${repoRelative(aliasedTarget.getFilePath(), ctx.repoRoot)} and ${repoRelative(toAbs, ctx.repoRoot)} name the same destination.`,
        "Remove the alias collision from the move plan.",
      );
    }
    return { fromAbs, toAbs, sf };
  });

  const sourcePaths = new Set<string>();
  const destinationPaths = new Set<string>();
  for (const move of resolved) {
    assert(
      !sourcePaths.has(move.fromAbs),
      `moveFiles: duplicate source: ${repoRelative(move.fromAbs, ctx.repoRoot)}`,
      "Each source may appear once in a batch.",
    );
    assert(
      !destinationPaths.has(move.toAbs),
      `moveFiles: duplicate destination: ${repoRelative(move.toAbs, ctx.repoRoot)}`,
      "Every move in a batch needs a unique destination.",
    );
    sourcePaths.add(move.fromAbs);
    destinationPaths.add(move.toAbs);
  }

  const touched = new Set<string>();
  for (const { fromAbs, toAbs } of resolved) {
    touched.add(fromAbs);
    touched.add(toAbs);
  }

  return {
    description: `Move ${moves.length} file(s)${noteSuffix(opts)}`,
    touchedFiles: [...touched],
    transform(innerCtx): void {
      const semantic = innerCtx.semantic();
      const relations = resolvedMoveRelations(semantic, innerCtx.project, resolved, innerCtx.repoRoot);
      assertNoUnresolvedMoveRelations({ workspace: semantic, project: innerCtx.project, moves: resolved, resolved: relations, repoRoot: innerCtx.repoRoot });
      const rewrites = sourceRewrites(resolved, relations);
      for (const rewrite of rewrites) {
        innerCtx.snapshot(rewrite.sourceFile);
        rewrite.sourceFile.replaceText([0, rewrite.sourceFile.getEnd()], rewrite.stagedText);
      }

      for (const { sf, fromAbs, toAbs } of resolved) {
        // Every affected relative edge is temporarily unresolved, so public move() preserves the
        // SourceFile identity and queued save/delete transaction without its per-move importer walk.
        sf.move(toAbs, { overwrite: opts.confirm === true });
        // …and at REAL repo scale it leaves a PHANTOM behind (#1778, reproduced on a 6,147-file project
        // and NOT at fixture scale): `getSourceFile(<old path>)` keeps answering with a distinct
        // SourceFile carrying the pre-move text, re-read from the disk copy `saveSync` has not deleted
        // yet. The old path is declared, so the harness's pre-emit diagnostics check scans the phantom
        // and its now-genuinely-stale errors REFUSE the apply — a codemod that can never be applied and
        // no hint why. `forget()` detaches the wrapper only; the queued move/delete still runs on save.
        const phantom = innerCtx.project.getSourceFile(fromAbs);
        if (phantom !== undefined && phantom !== sf) {
          phantom.forget();
        }
      }
      for (const rewrite of rewrites) {
        if (rewrite.needsRestore) {
          rewrite.sourceFile.replaceText([0, rewrite.sourceFile.getEnd()], rewrite.finalText);
        }
      }
    },
  };
}

function snapshotDeleteConsumers(ctx: CodemodContext, paths: readonly string[]): void {
  const semantic = ctx.semantic();
  const pending = paths.flatMap((path) => semantic.sourceViews(path).map(({ sourceFile }) => sourceFile));
  const seen = new Set<SourceFile>(pending);
  while (pending.length > 0) {
    const sourceFile = pending.shift();
    if (sourceFile === undefined) {
      continue;
    }
    for (const referencing of sourceFile.getReferencingSourceFiles()) {
      if (seen.has(referencing)) {
        continue;
      }
      seen.add(referencing);
      pending.push(referencing);
      const mutable = ctx.project.getSourceFile(canonicalCompilerPath(ctx.repoRoot, referencing.getFilePath()));
      if (mutable !== undefined) {
        ctx.snapshot(mutable);
      }
    }
  }
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
    transform(innerCtx): void {
      // A deleted export can break consumers whose own bytes do not change. Declare the reverse
      // closure before forget/delete so the post-transform diagnostics guard still checks them.
      snapshotDeleteConsumers(
        innerCtx,
        resolved.map(({ abs }) => abs),
      );
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
