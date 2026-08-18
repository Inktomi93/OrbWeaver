// Probe output lands under `<repo>/reports/<kind>/`, which is root-anchor gitignored.
import { mkdir } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import process from "node:process";

// _kit lives at scripts/probes/_kit/ — three levels up is the repo root.
export const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");

/** Resolve (and create) `reports/<kind>/` from the repo root. */
export async function artifactDir(kind: string): Promise<string> {
  const dir = join(REPO_ROOT, "reports", kind);
  await mkdir(dir, { recursive: true });
  return dir;
}

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
  const target = isOutPath(out) ? resolve(process.cwd(), out) : join(baseDir, out);
  return `${target.replace(ARTIFACT_EXT_RE, "")}${ext}`;
}

/** `artifactFilePath` + the directory it needs. `kind` is the `reports/<kind>/` family the artifact
 *  belongs to; a path-shaped `out` escapes it by design, and gets its own parent dir created. */
export async function artifactFile(kind: string, out: string, ext: string): Promise<string> {
  const path = artifactFilePath(await artifactDir(kind), out, ext);
  await mkdir(dirname(path), { recursive: true });
  return path;
}

/** The `reports/<kind>/` KEY for an `--out` value: identity for a bare name, and the sanitized basename
 *  for a path-shaped one. Kind-dir siblings (traces, HARs, baselines) are keyed BY NAME and stay in their
 *  own family — routing the shot to `/tmp/x.png` must not scatter a trace into `/tmp`, nor re-create the
 *  double-join inside `reports/traces/`. */
export function artifactKey(out: string): string {
  return routeSlug(basename(out).replace(ARTIFACT_EXT_RE, ""));
}
