// ARTIFACT NAMING — the pure `--out` value → filesystem path contract, split out of ./artifacts.ts when that
// module crossed the 450-line cap (#2242). It is the only block in there that touches NO run slot, NO
// `reports/` root and NO filesystem: given a base directory and an `--out` value it answers what the file is
// called. Keeping it beside the slot machinery meant one module answering two unrelated questions, and the
// cap is what made that legible.
//
// IMPORTERS KEEP THEIR SPELLING. `./artifacts.ts` re-exports all four names, exactly as it already does for
// `PrunedRun` from ./run-retention.ts: that module is the artifact DOOR every instrument imports, and moving
// a helper out from behind it must not become a twelve-file import sweep in an unrelated lane.
import { basename, isAbsolute, join, resolve } from "node:path";
import process from "node:process";

const LEADING_SLASH_RE = /^\//u;
const NON_SLUG_RE = /[^a-zA-Z0-9_-]+/gu;

/** Default artifact basename for a route: `/chats/abc?x=1` → `chats_abc_x_1`, `/` → `root`. */
export function routeSlug(route: string): string {
  return route.replace(LEADING_SLASH_RE, "").replace(NON_SLUG_RE, "_") || "root";
}

// The extensions a probe artifact BASE may already carry. `--out shot.png` names the same artifact as
// `--out shot`, and its JSON manifest sibling is `shot.json`, never `shot.png.json`.
const ARTIFACT_EXT_RE = /\.(?:png|json|zip|har|webm|cpuprofile)$/iu;
// `./x` and `../x` are the shell's own spelling of "a path relative to where I am standing".
const EXPLICIT_RELATIVE_RE = /^\.\.?\//u;

/** Does this `--out` value name a filesystem PATH the caller chose, rather than an artifact BASE NAME to
 *  be filed under `reports/<kind>/`? Absolute and explicitly-relative (`./`, `../`) values are paths; a
 *  bare name — including one with inner directories (`chat/room`) — stays inside the artifact dir. */
export function isOutPath(out: string): boolean {
  return isAbsolute(out) || EXPLICIT_RELATIVE_RE.test(out);
}

/** The final file path for an `--out` value + the extension this artifact is written with. PURE (the
 *  caller supplies the already-created `reports/<kind>/` dir) so the whole naming contract is unit-testable.
 *
 *  THE DEFECT THIS EXISTS FOR (2026-08-17): every call site spelled `join(await artifactDir(k), name + ext)`
 *  by hand, so `--out /abs/shot.png` — a path a lane pasted from its own scratch dir — was JOINED UNDER the
 *  reports dir and re-suffixed: `reports/snaps/abs/shot.png.png`. The run still exited 0, so the caller
 *  believed the file it named existed. A refusal would have been honest; landing where NAMED is better. */
export function artifactFilePath(baseDir: string, out: string, ext: string): string {
  const target = isOutPath(out) ? resolve(process.cwd(), out) : (baseAnchoredOut(baseDir, out) ?? join(baseDir, out));
  return `${target.replace(ARTIFACT_EXT_RE, "")}${ext}`;
}

/** A bare-relative `--out` ALREADY spelled from the repo root INTO this kind's dir (`reports/snaps/foo.png`)
 *  names the very file the prefixing would produce — so its `reports/<kind>/` prefix is STRIPPED instead of
 *  being prefixed AGAIN into `reports/snaps/reports/snaps/foo.png` (#209, 2026-08-18; a lane pasted back the
 *  path snap itself had just printed). The check is a prefix strip rather than a `resolve(baseDir, "..", "..")`
 *  because since #1164 `baseDir` may be a RUN SLOT (`reports/runs/snap/<runId>/snaps`), where two levels up is
 *  not the repo root and the old form silently stopped recognizing the very path snap prints. It stays PURE —
 *  no `process.cwd()`. A bare name that lands anywhere else (`home/tiles`, another kind's dir) is still an
 *  artifact BASE and keeps the prefix. */
function baseAnchoredOut(baseDir: string, out: string): string | null {
  const prefix = `reports/${basename(baseDir)}/`;
  const spelled = out.replaceAll("\\", "/");
  return spelled.startsWith(prefix) ? join(baseDir, spelled.slice(prefix.length)) : null;
}

/** The `reports/<kind>/` KEY for an `--out` value: identity for a bare name, and the sanitized basename
 *  for a path-shaped one. Kind-dir siblings (traces, HARs, baselines) are keyed BY NAME and stay in their
 *  own family — routing the shot to `/tmp/x.png` must not scatter a trace into `/tmp`, nor re-create the
 *  double-join inside `reports/traces/`. */
export function artifactKey(out: string): string {
  return routeSlug(basename(out).replace(ARTIFACT_EXT_RE, ""));
}
