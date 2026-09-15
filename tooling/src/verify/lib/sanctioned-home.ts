// The SCANNED-HOME reader (GATE-AUTHORING.md §3 + §4) — the ONE home for the shape 27 gates were
// re-spelling as a `scanRoot` EXCLUSION. A home scoped OUT of `scanRoot` carries its skip silently
// through a rename or a move; the same home SCANNED, covered by a cited row, and swept by the RENAME
// TRIPWIRE below goes RED at its new path.
//
// THE ROW TYPE IS `contract/tier-home.ts#TierImplementationHome`, NOT `contract/gate.ts#ExemptionRow`
// (#2176 Phase F, #2320): a tier-implementation home is a scan-SCOPE decision about where a token scale
// is implemented, never a row that forgives a finding, and `policy-legacy-imports` ARM D is right to red
// a final policy that receives the latter. That contract file carries the measurement behind the
// classification and the reasoning; read it before re-typing anything here.
// Comment posture: comment-SAFE (path strings + the shared project's file list; never file text).
import type { SourceFile } from "ts-morph";
import type { TierImplementationHomes } from "../contract/tier-home.ts";

/** A DIRECTORY row is keyed with a trailing slash (`packages/kit/src/time/`); a FILE row is keyed exactly.
 *  Anything else would make `packages/kit/src/timeline.ts` inherit `packages/kit/src/time`'s exemption. */
function covers(key: string, rel: string): boolean {
  return key.endsWith("/") ? rel.startsWith(key) : rel === key;
}

/** The sanctioned-home row covering `rel`, or undefined. Callers skip (and are exempt) only on a HIT —
 *  which is what makes the exemption a cited row rather than an invisible scope decision. */
export function sanctionedHome(homes: TierImplementationHomes, rel: string): string | undefined {
  return Object.keys(homes).find((key) => covers(key, rel));
}

/** The final-contract equivalent of {@link homeFiles}: every file in an explicit resolved `files` list a
 *  row covers, read through the policy's own `relativePath` rather than `ctx.project`/`ctx.root`. Additive
 *  — the `GateRunCtx`-shaped `homeFiles`/`reportUnresolvedHomes` below are untouched for gates still on the
 *  legacy contract. */
function coveredFiles(files: readonly SourceFile[], relativePath: (sourceFile: SourceFile) => string, key: string): readonly SourceFile[] {
  return files.filter((sourceFile) => covers(key, relativePath(sourceFile)));
}

/** THE RENAME TRIPWIRE, migrated: the keys among `homes` whose row resolves to zero files among `files`.
 *  Callers guard this on their own real-tree anchor (a fixture/mini-project run never loads the anchor, so
 *  it never falsely claims every row dead) — see `GATE-AUTHORING.md` §4.5 and the callers below. */
export function unresolvedSanctionedHomeKeys(
  files: readonly SourceFile[],
  relativePath: (sourceFile: SourceFile) => string,
  homes: TierImplementationHomes,
): readonly string[] {
  return Object.keys(homes).filter((key) => coveredFiles(files, relativePath, key).length === 0);
}
