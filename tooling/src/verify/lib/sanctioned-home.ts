// Scan-and-allowlist for a rule's SANCTIONED HOMES (GATE-AUTHORING.md §3 + §4) — the ONE home for the
// shape 27 gates were re-spelling as a `scanRoot` EXCLUSION. A home scoped OUT of `scanRoot` carries its
// exemption silently through a rename or a move; the same home SCANNED, exempted by a cited
// `ExemptionRow`, and swept by the RENAME TRIPWIRE below goes RED at its new path.
// Comment posture: comment-SAFE (path strings + the shared project's file list; never file text).
import type { SourceFile } from "ts-morph";
import type { ExemptionTable, GateRunCtx } from "../contract/gate.ts";
import { fileLoaded, repoRel } from "./pass.ts";

/** A DIRECTORY row is keyed with a trailing slash (`packages/kit/src/time/`); a FILE row is keyed exactly.
 *  Anything else would make `packages/kit/src/timeline.ts` inherit `packages/kit/src/time`'s exemption. */
function covers(key: string, rel: string): boolean {
  return key.endsWith("/") ? rel.startsWith(key) : rel === key;
}

/** The sanctioned-home row covering `rel`, or undefined. Callers skip (and are exempt) only on a HIT —
 *  which is what makes the exemption a cited row rather than an invisible scope decision. */
export function sanctionedHome(homes: ExemptionTable, rel: string): string | undefined {
  return Object.keys(homes).find((key) => covers(key, rel));
}

/** The final-contract equivalent of {@link homeFiles}: every file in an explicit resolved `files` list a
 *  row covers, read through the policy's own `relativePath` rather than `ctx.project`/`ctx.root`. Additive
 *  — the `GateRunCtx`-shaped `homeFiles`/`reportUnresolvedHomes` below are untouched for gates still on the
 *  legacy contract. */
export function coveredFiles(files: readonly SourceFile[], relativePath: (sourceFile: SourceFile) => string, key: string): readonly SourceFile[] {
  return files.filter((sourceFile) => covers(key, relativePath(sourceFile)));
}

/** THE RENAME TRIPWIRE, migrated: the keys among `homes` whose row resolves to zero files among `files`.
 *  Callers guard this on their own real-tree anchor (a fixture/mini-project run never loads the anchor, so
 *  it never falsely claims every row dead) — see `GATE-AUTHORING.md` §4.5 and the callers below. */
export function unresolvedSanctionedHomeKeys(
  files: readonly SourceFile[],
  relativePath: (sourceFile: SourceFile) => string,
  homes: ExemptionTable,
): readonly string[] {
  return Object.keys(homes).filter((key) => coveredFiles(files, relativePath, key).length === 0);
}

/** Every loaded file one row covers — a directory row's whole subtree, a file row's single file. The
 *  substrate for a gate's own mode-A arm ("the home no longer carries the shape it is the home OF"),
 *  which only some homes can honestly claim. */
export function homeFiles(ctx: Pick<GateRunCtx, "root" | "project">, key: string): readonly SourceFile[] {
  return ctx.project.getSourceFiles().filter((sf) => covers(key, repoRel(ctx.root, sf.getFilePath())));
}

/** The default REAL-TREE ANCHOR for the tripwire (GATE-AUTHORING.md §4.5, `own-tables-only`'s precedent):
 *  the db schema barrel is present on every real run, sits inside NO gate's sanctioned home, and is needed
 *  by no example that is not deliberately arming this arm. A gate must NOT anchor this sweep on a file
 *  inside its own home — the home dying would take the guard with it and the tripwire would never fire. */
export const HOME_SWEEP_ANCHOR = "packages/db/src/schema/index.ts";

/** THE RENAME TRIPWIRE (GATE-AUTHORING.md §3 "add a rename tripwire in finalize", §4.4a mode B): one
 *  finding per row whose path resolves to NOTHING on the real tree. A sanctioned home that moved is the
 *  exact failure an excluded `scanRoot` cannot see — the exclusion follows the old path into the void and
 *  the new path is judged by nobody. Mode A (the home still exists but no longer carries the shape) is
 *  deliberately NOT swept here: a home legitimately holds zero instances between edits, and reding that
 *  would make the sanctioned path the unbuildable one. A gate whose home MUST carry the shape (the
 *  definition site of a symbol, a producer stamp) adds its own mode-A arm on top — `scrubber-home` and
 *  `tooling-shared-plumbing` are the worked examples.
 *
 *  Guarded on a REAL-TREE ANCHOR, never on `ctx.scope.kind` alone: `scope.kind === "project"` is TRUE
 *  inside gate-conformance's synthetic mini-projects, where no row's path exists and every row would
 *  "prove" itself dead (§4.5). The anchor must be a file no example needs. */
export function reportUnresolvedHomes(
  ctx: GateRunCtx,
  homes: ExemptionTable,
  at: { readonly gateSelf: string; readonly what: string; readonly anchor?: string },
): void {
  if (ctx.scope.kind !== "project" || !fileLoaded(ctx, at.anchor ?? HOME_SWEEP_ANCHOR)) {
    return;
  }
  for (const key of Object.keys(homes)) {
    if (homeFiles(ctx, key).length > 0) {
      continue;
    }
    // The explicit-Finding overload is correct here and needs no marker: this is a FILE-LEVEL verdict about
    // the gate's own table (`column: 0`, no node, no ts-morph position API — `finding-overload-provenance`
    // flags only NODE-anchored literals), and it must never be suppressible — a silenced rename tripwire is
    // exactly the silent-carry this helper exists to end.
    ctx.report({
      file: at.gateSelf,
      line: 1,
      column: 0,
      message: `stale SANCTIONED-HOME row — "${key}" resolves to no file on the tree, so the ${at.what} it exempts either moved or died and its new path is judged by nobody: re-point the row at the real home or delete it, in ${at.gateSelf}`,
    });
  }
}
