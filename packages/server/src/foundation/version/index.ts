// foundation/version — WHAT IS THIS RUNNING ORBWEAVER? The one boot-time read that answers it, for every
// surface a human or a bug report looks at: `/healthz`, the first boot log line, the bug-report envelope,
// and Settings → About (owner ask 2026-09-18, "a versioning system to stay in sync with github and to help
// with bug reports").
//
// IT IS env/observability-CLASS, which is why it is foundation and not a domain: no db, no principal, no
// business rule — a process fact, read once and frozen, that every tier above reads DOWN. The SHAPE and the
// pure text→sha derivations are `@orb/kit/version-identity`; this module owns only the I/O and the
// precedence, so the container build stamp and a fixture-driven spec share one derivation.
//
// NO GIT BINARY, NO CHILD PROCESS. `.git/HEAD`, the loose ref it names and `.git/packed-refs` are small text
// files; reading them answers "which commit" without spawning anything, without the git objects, and inside
// a container that has neither. (The bug-report capture DOES shell out to git — deliberately, because it
// additionally needs `dirty`, which no plain-file read can answer. That is a different fact, not a second
// spelling of this one; see `@orb/kit/version-identity`'s header.)
//
// PRECEDENCE: a stamped `version.json` BEATS `.git`, always. An image ships no `.git`, and the build stage
// that writes the stamp runs `git init` for the root `prepare` script — a throwaway repository whose HEAD
// names a branch that was never committed. If `.git` won, that boot would report `unknown` while the honest
// answer sat in a file one directory up. Both halves are proven: a stamp beside a `.git` still wins, and a
// `git init`-shaped `.git` (HEAD present, no refs anywhere) resolves to `unknown` rather than throwing.
//
// EVERY FAILURE IS AN ANSWER, NEVER A THROW. A missing `package.json`, a missing `.git`, a corrupt stamp —
// each degrades to a named `unknown` that the surfaces render as such. A boot that dies because it could not
// find its own version number would be the worst possible trade.

import { readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import type { GitRefFiles, VersionIdentity, VersionStamp } from "@orb/kit/version-identity";
import { gitDirRedirect, headRefName, resolveCommit, shortCommit, UNKNOWN_COMMIT, versionStampSchema } from "@orb/kit/version-identity";

/** The stamp the image build writes beside the runtime file set, relative to the process root. */
export const VERSION_STAMP_FILE = "version.json";

/** The honest stand-in when the root `package.json` could not be read — same posture as `UNKNOWN_COMMIT`. */
const UNKNOWN_VERSION = "unknown";

/** A ref name we are willing to turn into a path. HEAD is our own file, but it is still a file: a name with
 *  `..` in it would walk the reader out of the git directory, so the shape is pinned instead of trusted. */
const SAFE_REF_RE = /^refs\/[A-Za-z0-9._\-/]+$/u;

/** One file's text, or `null` when it is not a readable regular file. `statSync({throwIfNoEntry:false})`
 *  answers the absent case without an exception, so the catch below is only ever the genuinely exceptional
 *  read (a permission wall, a race that unlinked the file between the stat and the read). */
function readText(path: string): string | null {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (stat === undefined || !stat.isFile()) {
    return null;
  }
  // @orb-waive caught-failure-ownership(catch): "this file did not answer" IS the result here — it becomes
  // the `unknown` arm the surfaces render, and a boot must never die because it could not read its own
  // version. Ends if a caller starts treating null as an error rather than as "the file could not be read".
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** Where a checkout's git state lives. `gitDir` owns HEAD; `commonDir` owns the REFS — and in a LINKED
 *  WORKTREE those are different directories, which is not an exotic case here: every dispatched agent lane
 *  and every `snap --isolated` run is a linked worktree, so a reader that only looked in `gitDir` would
 *  report `unknown` for exactly the checkouts this repository runs the most. */
interface GitLocation {
  readonly gitDir: string;
  readonly commonDir: string;
}

/** `<root>/.git`, or — in a linked worktree, where `.git` is a FILE holding `gitdir: <path>` — the directory
 *  it redirects to, paired with the `commondir` that directory points at (itself relative to it). */
function gitLocationOf(root: string): GitLocation | null {
  const dotGit = join(root, ".git");
  const stat = statSync(dotGit, { throwIfNoEntry: false });
  if (stat === undefined) {
    return null;
  }
  const gitDir = stat.isDirectory() ? dotGit : redirectedGitDir(root, dotGit);
  if (gitDir === null) {
    return null;
  }
  const common = readText(join(gitDir, "commondir"))?.trim();
  const commonDir = common === undefined || common === "" ? gitDir : resolve(gitDir, common);
  return { gitDir, commonDir };
}

/** The directory a `.git` FILE redirects to, absolutised against the checkout root. */
function redirectedGitDir(root: string, dotGit: string): string | null {
  const redirect = gitDirRedirect(readText(dotGit));
  if (redirect === null) {
    return null;
  }
  return isAbsolute(redirect) ? redirect : resolve(root, redirect);
}

/** The three ref files, read in git's own resolution order — HEAD first (always the worktree's OWN), then
 *  the ref it names, looked for in the worktree dir and then in the shared common dir. */
function readGitRefFiles(location: GitLocation): GitRefFiles {
  const head = readText(join(location.gitDir, "HEAD"));
  const ref = headRefName(head);
  const dirs = location.gitDir === location.commonDir ? [location.gitDir] : [location.gitDir, location.commonDir];
  const readFirst = (...segments: readonly string[]): string | null => {
    for (const dir of dirs) {
      const text = readText(join(dir, ...segments));
      if (text !== null) {
        return text;
      }
    }
    return null;
  };
  const headRef = ref !== null && SAFE_REF_RE.test(ref) ? readFirst(...ref.split("/")) : null;
  return { head, headRef, packedRefs: readFirst("packed-refs") };
}

/** The commit a checkout is on, or `null` — no git binary, no objects, just the ref files. */
export function readGitCommit(root: string): string | null {
  const location = gitLocationOf(root);
  return location === null ? null : resolveCommit(readGitRefFiles(location));
}

/** The root `package.json`'s `version` field — the release number the owner bumps and tags. */
export function readPackageVersion(root: string): string | null {
  const text = readText(join(root, "package.json"));
  if (text === null) {
    return null;
  }
  // @orb-waive caught-failure-ownership(catch): a manifest that is not JSON degrades to the `unknown`
  // version the surfaces render, exactly like an absent one — this reader reports what it found and never
  // decides a boot. Ends if the caller starts distinguishing "corrupt manifest" from "absent manifest".
  try {
    const parsed: unknown = JSON.parse(text);
    const version = typeof parsed === "object" && parsed !== null ? (parsed as { readonly version?: unknown }).version : undefined;
    return typeof version === "string" && version.length > 0 ? version : null;
  } catch {
    return null;
  }
}

/** The build stamp, when one was written AND is well-formed. A corrupt stamp is treated as ABSENT (the
 *  reader falls through to `.git`) rather than as a fatal: half an answer beats no boot. */
export function readVersionStamp(root: string): VersionStamp | null {
  const text = readText(join(root, VERSION_STAMP_FILE));
  if (text === null) {
    return null;
  }
  // @orb-waive caught-failure-ownership(catch): a stamp that is not JSON is INDISTINGUISHABLE from an
  // absent stamp for this reader's purpose — both mean "no stamped answer", and the `.git` fallback below
  // handles both identically. Ends if a corrupt stamp ever needs to be reported differently from a missing one.
  try {
    const parsed = versionStampSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Derive the identity for one root. Pure w.r.t. process state (the root is a parameter), so a spec drives
 *  it over a fixture directory with a hand-built `.git` and no repository anywhere. */
export function readVersionIdentity(root: string): VersionIdentity {
  const stamp = readVersionStamp(root);
  if (stamp !== null) {
    return Object.freeze({
      version: stamp.version,
      commit: stamp.commit,
      short: shortCommit(stamp.commit),
      builtAt: stamp.builtAt,
      source: "container",
    });
  }
  const commit = readGitCommit(root) ?? UNKNOWN_COMMIT;
  return Object.freeze({
    version: readPackageVersion(root) ?? UNKNOWN_VERSION,
    commit,
    short: shortCommit(commit),
    source: "checkout",
  });
}

let cached: VersionIdentity | null = null;

/** THE process's identity — derived once on first read and frozen for the lifetime of the process. Frozen
 *  on purpose: every surface must report the SAME string, and a box whose files changed under it (a dev
 *  checkout that moved branch) is still running the code it booted with. */
export function versionIdentity(): VersionIdentity {
  cached ??= readVersionIdentity(process.cwd());
  return cached;
}

/** Test seam — drops the memo so a spec can point `versionIdentity()` at a different cwd. */
export function __resetVersionIdentityForTest(): void {
  cached = null;
}

/** The CONTENT of the build stamp, derived from a workspace root. Separate from the write so the image
 *  build's one derivation is the same code the server reads back, and a spec can assert it without a disk.
 *
 *  `builtAt` is a PARAMETER, not `new Date()`: production source reads time from the injected clock
 *  (`no-raw-clock`), and the build's wall instant is supplied by the build script that knows it. */
export function buildVersionStamp(root: string, builtAt: string): VersionStamp {
  return {
    version: readPackageVersion(root) ?? UNKNOWN_VERSION,
    commit: readGitCommit(root) ?? UNKNOWN_COMMIT,
    builtAt,
  };
}
