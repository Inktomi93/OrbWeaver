// foundation/version — WHAT IS THIS RUNNING ORBWEAVER? The one boot-time read that answers it, for every
// surface a human or a bug report looks at: `/healthz`, the first boot log line, the bug-report envelope,
// and Settings → This install (owner ask 2026-09-18, "a versioning system to stay in sync with github and to help
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
// PRECEDENCE: a stamped `version.json` BEATS `.git`, always. An image ships no `.git`: the build stage moves
// it aside before install, so the root `prepare` script (`scripts/prepare.ts`) sees a source archive with no
// git hooks to install. If `.git` won, that boot would report `unknown` while the honest answer sat in a file
// one directory up. Both halves are proven: a stamp beside a `.git` still wins, and a HEAD naming a branch
// with no refs behind it (the no-`.git` shape) resolves to `unknown` rather than throwing.
//
// THE RELEASE CHANNEL is one more ref read: the build is `stable` when the tag `v<version>` resolves to the
// commit HEAD resolves to (`@orb/kit/version-identity` states the rule). The image build stamps the channel it
// derived here, because the runtime image has no `.git` to read the tag from.
//
// EVERY FAILURE IS AN ANSWER, NEVER A THROW. A missing `package.json`, a missing `.git`, a corrupt stamp —
// each degrades to a named `unknown` that the surfaces render as such. A boot that dies because it could not
// find its own version number would be the worst possible trade.

import type { Stats } from "node:fs";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import type { GitRefFiles, ReleaseChannel, VersionIdentity, VersionStamp } from "@orb/kit/version-identity";
import {
  gitDirRedirect,
  headRefName,
  releaseChannelOf,
  releaseTagRef,
  resolveCommit,
  resolveRef,
  shortCommit,
  UNKNOWN_COMMIT,
  versionStampSchema,
} from "@orb/kit/version-identity";

/** The stamp the image build writes beside the runtime file set, relative to the process root. */
export const VERSION_STAMP_FILE = "version.json";

/** The honest stand-in when the root `package.json` could not be read — same posture as `UNKNOWN_COMMIT`. */
const UNKNOWN_VERSION = "unknown";

/** A ref name we are willing to turn into a path. HEAD is our own file and the release tag is built from our
 *  own manifest's version, but both are still file contents: a name with `..` in it would walk the reader out
 *  of the git directory, so the shape is pinned instead of trusted. Git itself refuses `..` in a ref name. */
const SAFE_REF_RE = /^refs\/(?!.*\.\.)[A-Za-z0-9._\-/]+$/u;

/** A path's stat, or `null` when it is absent or the process may not look at it. A permission wall throws from the
 *  stat itself: an unsearchable directory, and every path outside the plugin broker's permission-model grants. */
function statOrNull(path: string): Stats | null {
  // @orb-waive caught-failure-ownership(catch): a path this process may not stat answers exactly like an absent one,
  // the `unknown` arm the surfaces render. Ends if a caller needs to tell a denied path from a missing one.
  try {
    return statSync(path, { throwIfNoEntry: false }) ?? null;
  } catch {
    return null;
  }
}

/** One file's text, or `null` when it is not a readable regular file. The catch below is only ever the genuinely
 *  exceptional read: a race that unlinked the file between the stat and the read. */
function readText(path: string): string | null {
  const stat = statOrNull(path);
  if (stat === null || !stat.isFile()) {
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
  const stat = statOrNull(dotGit);
  if (stat === null) {
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
  return { head, headRef: ref === null ? null : readLooseRef(location, ref), packedRefs: readFirst(location, "packed-refs") };
}

/** One file under the git dirs, the worktree's own first and then the shared common dir. */
function readFirst(location: GitLocation, ...segments: readonly string[]): string | null {
  const dirs = location.gitDir === location.commonDir ? [location.gitDir] : [location.gitDir, location.commonDir];
  for (const dir of dirs) {
    const text = readText(join(dir, ...segments));
    if (text !== null) {
      return text;
    }
  }
  return null;
}

/** A loose ref file's text, or `null` when the name is not a safe ref path or the file is absent. */
function readLooseRef(location: GitLocation, ref: string): string | null {
  return SAFE_REF_RE.test(ref) ? readFirst(location, ...ref.split("/")) : null;
}

/** The commit a checkout is on, or `null` — no git binary, no objects, just the ref files. */
export function readGitCommit(root: string): string | null {
  const location = gitLocationOf(root);
  return location === null ? null : resolveCommit(readGitRefFiles(location));
}

/** The checkout's release channel: `stable` when the tag for `version` names `commit`. A missing version, a
 *  missing commit or a missing `.git` is `main` — a build that cannot prove it is the release is not one. */
export function readReleaseChannel(root: string, version: string | null, commit: string | null): ReleaseChannel {
  const location = gitLocationOf(root);
  if (location === null || version === null) {
    return "main";
  }
  const tag = releaseTagRef(version);
  return releaseChannelOf(commit, resolveRef(tag, readLooseRef(location, tag), readFirst(location, "packed-refs")));
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
      channel: stamp.channel,
    });
  }
  const checkout = readCheckout(root);
  return Object.freeze({
    version: checkout.version,
    commit: checkout.commit,
    short: shortCommit(checkout.commit),
    source: "checkout",
    channel: checkout.channel,
  });
}

/** The three facts a checkout answers from its own files, shared by the boot reader and the image stamp so
 *  the two can never derive them differently. */
function readCheckout(root: string): Pick<VersionIdentity, "version" | "commit" | "channel"> {
  const version = readPackageVersion(root);
  const commit = readGitCommit(root);
  return { version: version ?? UNKNOWN_VERSION, commit: commit ?? UNKNOWN_COMMIT, channel: readReleaseChannel(root, version, commit) };
}

let cached: VersionIdentity | null = null;

/** THE process's identity — derived once on first read and frozen for the lifetime of the process. Frozen
 *  on purpose: every surface must report the SAME string, and a box whose files changed under it (a dev
 *  checkout that moved branch) is still running the code it booted with. */
export function versionIdentity(): VersionIdentity {
  cached ??= readVersionIdentity(process.cwd());
  return cached;
}

/** The CONTENT of the build stamp, derived from a workspace root. Separate from the write so the image
 *  build's one derivation is the same code the server reads back, and a spec can assert it without a disk.
 *
 *  `builtAt` is a PARAMETER, not `new Date()`: production source reads time from the injected clock
 *  (`no-raw-clock`), and the build's wall instant is supplied by the build script that knows it. */
export function buildVersionStamp(root: string, builtAt: string): VersionStamp {
  return { ...readCheckout(root), builtAt };
}
