// THE BUILD IDENTITY SHAPE + its pure derivations — "what exactly is this running Orbweaver?", in the ONE
// home every consumer can reach (owner ask 2026-09-18: "a versioning system to stay in sync with github and
// to help with bug reports").
//
// WHY `kit` AND NOT `contracts`, even though this crosses server→client: the block is also a FIELD of
// `BugReportRecord` (`@orb/kit/bug-report`), whose own header states why that record is homed here — its
// writer (`@orb/server`) and its reader (`@orb/tooling`) sit at opposite ends of the cake. A `contracts`
// home would force `kit → contracts`, an upward import, which the constitution (§2) makes automatically
// wrong. `kit` is one of the four sanctioned type homes; `contracts`, `db`, `server` and `client` all import
// it DOWNWARD, so one home serves the tRPC wire, the bug bundle and the `/healthz` body without a respell.
//
// THE DERIVATIONS HERE ARE PURE TEXT → FACT. No `node:*`, no child process, no git binary: the caller hands
// over the CONTENTS of `.git/HEAD`, of the ref file it names, and of `.git/packed-refs`, and gets back a sha
// or `null`. That split is what lets the SAME logic run in three places that cannot share an I/O layer — the
// server's boot-time reader (`@orb/server/foundation/version`), the container build stamp
// (`docker/assemble-runtime.sh`), and a spec driving a fixture `.git` with no repository at all.
//
// TWO RELEASE CHANNELS (owner ruling). `main` is integration and development; the `release`
// branch is stable, and release-please tags each stable release `v<version>` there. A build is `stable`
// exactly when its commit IS the commit its own release tag names; everything else (main, a lane worktree, a
// source build of an untagged commit, the release branch between a promotion and its release PR) is `main`.
// The test fails toward `main`, never toward `stable`: a build that cannot prove it is the tagged release
// never claims to be one. The channel decides the version line and which upstream the update check asks.
//
// `dirty` IS DELIBERATELY ABSENT. Whether the working tree matches its commit cannot be answered without
// hashing the index against every tracked file — i.e. without git. A field that is always `false` would be a
// lie in exactly the case a bug report needs the truth, so this shape does not carry one. The bug-report
// capture keeps its OWN git-backed `build.dirty` (it runs in a dev checkout, by design) — that is a separate
// fact with a separate honesty story, not a duplicate of this one.

import { z } from "zod";
import { compareSemver } from "#semver";

/** Where the identity came from. `checkout` = derived from `.git` plain files at boot; `container` = read
 *  from the `version.json` the image build stamped (an image ships no `.git`, so nothing else could answer). */
export const VERSION_SOURCES = ["checkout", "container"] as const;

/** Which line of development a build belongs to (see the header). */
export const RELEASE_CHANNELS = ["stable", "main"] as const;
export type ReleaseChannel = (typeof RELEASE_CHANNELS)[number];

/** The honest stand-in for a commit that could not be derived — an image without a stamp, a zip download, a
 *  throwaway `git init` whose HEAD names a ref that does not exist. Never a fabricated sha, never a throw. */
export const UNKNOWN_COMMIT = "unknown";

/** How much of a sha the UI, the boot line and the bug bundle print. Twelve, not git's seven/nine: this
 *  string is pasted into an issue and then into `git show`, and twelve is unambiguous in a repo this size. */
export const SHORT_COMMIT_LENGTH = 12;

/** A git object id as the ref files spell it — sha-1 (40) or sha-256 (64) lowercase hex. */
const OBJECT_ID_RE = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
/** `ref: refs/heads/main` — HEAD's symbolic form. */
const SYMBOLIC_HEAD_RE = /^ref:\s*(?<ref>\S+)$/u;
/** One `packed-refs` row: `<oid> <refname>`. Peeled rows (`^<oid>`) and comments (`#`) never match. */
const PACKED_REF_RE = /^(?<oid>[0-9a-f]{40}(?:[0-9a-f]{24})?)\s+(?<ref>\S+)$/u;
/** The row that follows an annotated tag in `packed-refs`: `^<oid>`, the commit the tag object points at. */
const PEELED_ROW_RE = /^\^(?<oid>[0-9a-f]{40}(?:[0-9a-f]{24})?)$/u;
/** `gitdir: /abs/path/.git/worktrees/x` — the `.git` FILE a linked worktree carries instead of a directory. */
const GITDIR_FILE_RE = /^gitdir:\s*(?<dir>.+)$/u;

/** The identity of one running Orbweaver. The wire shape of `settings.getVersion`, the `/healthz` `version`
 *  block, and the first header field of a bug-report bundle — one shape, everywhere a human looks. */
export const versionIdentitySchema = z.object({
  /** The root `package.json` `version` — the number release-please bumps on the `release` branch. */
  version: z.string().min(1),
  /** The full commit sha, or {@link UNKNOWN_COMMIT}. */
  commit: z.string().min(1),
  /** `commit` truncated to {@link SHORT_COMMIT_LENGTH}, or {@link UNKNOWN_COMMIT} unchanged. */
  short: z.string().min(1),
  /** ISO-8601 of the image build. Present only on the `container` arm — a checkout has no build instant. */
  builtAt: z.string().min(1).optional(),
  source: z.enum(VERSION_SOURCES),
  channel: z.enum(RELEASE_CHANNELS),
});
export type VersionIdentity = z.infer<typeof versionIdentitySchema>;

/** The `version.json` an image build stamps beside the runtime file set. A SUBSET of the identity — `short`
 *  and `source` are DERIVED at read time rather than stored, so a hand-edited stamp cannot disagree with
 *  itself. The channel IS stored: an image carries no `.git` to re-derive it from. */
export const versionStampSchema = z.object({
  version: z.string().min(1),
  commit: z.string().min(1),
  builtAt: z.string().min(1),
  channel: z.enum(RELEASE_CHANNELS),
});
export type VersionStamp = z.infer<typeof versionStampSchema>;

/** The raw bytes a commit derivation needs. Every field is "the file's text, or `null` when it is absent" —
 *  absence is an expected answer at each of the three, not an error. */
export interface GitRefFiles {
  /** `.git/HEAD`. */
  readonly head: string | null;
  /** The file `.git/<headRefName(head)>` names, when HEAD is symbolic AND that loose ref exists. */
  readonly headRef: string | null;
  /** `.git/packed-refs` — where a ref lives once `git gc` packed it away from the loose file. */
  readonly packedRefs: string | null;
}

/** The ref HEAD points at (`refs/heads/main`), or `null` when HEAD is detached, absent or unparseable. The
 *  reader calls this FIRST so it knows which single loose-ref file to open. */
export function headRefName(head: string | null): string | null {
  if (head === null) {
    return null;
  }
  return SYMBOLIC_HEAD_RE.exec(head.trim())?.groups?.["ref"] ?? null;
}

/** The directory a `.git` FILE redirects to — a linked worktree's real git dir. `null` when the text is not
 *  a gitfile (i.e. the caller read a directory's HEAD, or garbage). */
export function gitDirRedirect(gitFileText: string | null): string | null {
  if (gitFileText === null) {
    return null;
  }
  return GITDIR_FILE_RE.exec(gitFileText.trim())?.groups?.["dir"]?.trim() ?? null;
}

/** The commit HEAD resolves to, or `null`. Three arms, in the order git itself would take them: a DETACHED
 *  HEAD is already the sha; a symbolic HEAD reads its loose ref; and when that loose file is absent (packed,
 *  or — a branch checked out before its first commit — never created) the packed table is scanned for the
 *  name.
 *
 *  A symbolic HEAD naming a ref that exists NOWHERE returns `null`, which is the exact state a throwaway
 *  `git init` leaves behind: HEAD says `refs/heads/main`, no branch has ever been committed. The caller turns
 *  that into {@link UNKNOWN_COMMIT} rather than pretending. */
export function resolveCommit(files: GitRefFiles): string | null {
  if (files.head === null) {
    return null;
  }
  const head = files.head.trim();
  if (OBJECT_ID_RE.test(head)) {
    return head;
  }
  const ref = headRefName(head);
  if (ref === null) {
    return null;
  }
  return resolveRef(ref, files.headRef, files.packedRefs);
}

/** The commit one ref names: its loose file when that holds a sha, else its `packed-refs` row. A packed
 *  ANNOTATED tag is followed by a `^<oid>` peeled row, and that peeled commit is the answer — the row's own
 *  oid is the tag object. A LOOSE annotated tag holds only the tag object's id, which cannot be peeled
 *  without the object store, so it never equals a commit; the channel test reads that as `main`, the safe
 *  direction. (release-please creates its tags through the GitHub release API, which makes lightweight tags.) */
export function resolveRef(ref: string, loose: string | null, packedRefs: string | null): string | null {
  const looseOid = loose?.trim() ?? "";
  if (OBJECT_ID_RE.test(looseOid)) {
    return looseOid;
  }
  return packedRefCommit(packedRefs, ref);
}

/** Scan `packed-refs` for one ref name. Peeled-tag rows (`^<oid>`) carry no name and never match; the one
 *  directly after a matched row replaces that row's oid. */
function packedRefCommit(packedRefs: string | null, ref: string): string | null {
  if (packedRefs === null) {
    return null;
  }
  const lines = packedRefs.split("\n").map((line) => line.trim());
  for (const [index, line] of lines.entries()) {
    const groups = PACKED_REF_RE.exec(line)?.groups;
    if (groups !== undefined && groups["ref"] === ref) {
      return PEELED_ROW_RE.exec(lines[index + 1] ?? "")?.groups?.["oid"] ?? groups["oid"] ?? null;
    }
  }
  return null;
}

/** The tag release-please puts on the stable release of `version`: `include-v-in-tag`, no component prefix
 *  (`release-please-config.json`). */
export function releaseTagRef(version: string): string {
  return `refs/tags/v${version}`;
}

/** A build is `stable` exactly when its commit is the commit its own release tag names (see the header). */
export function releaseChannelOf(commit: string | null, releaseTagCommit: string | null): ReleaseChannel {
  return commit !== null && commit === releaseTagCommit ? "stable" : "main";
}

/** The printable short form. {@link UNKNOWN_COMMIT} passes through unchanged — truncating the word "unknown"
 *  would produce a string that LOOKS like a sha prefix. */
export function shortCommit(commit: string): string {
  return commit === UNKNOWN_COMMIT ? UNKNOWN_COMMIT : commit.slice(0, SHORT_COMMIT_LENGTH);
}

/** The version line per channel: a release is its tag, a development build is semver with a pre-release
 *  `dev` and the short commit as build metadata, so the two can never be mistaken for each other. */
const VERSION_LINES: Record<ReleaseChannel, (identity: VersionIdentity) => string> = {
  stable: (identity) => `v${identity.version}`,
  main: (identity) => `${identity.version}-dev+${identity.short}`,
};

/** The one-line human form the boot log, the bug bundle and the About surface print: `v0.4.1` for a stable
 *  release, `0.4.1-dev+a1b2c3d4e5f6` for anything else. */
export function formatVersionIdentity(identity: VersionIdentity): string {
  return VERSION_LINES[identity.channel](identity);
}

// ── the manual update check ──────────────────────────────────────────────────────────────────────────

/** The verdict vocabulary. `behind` deliberately carries NO commit COUNT: the check is one unauthenticated
 *  GET of the upstream head, which knows the remote sha but not how many commits separate it from ours
 *  (that needs the object graph, i.e. a fetch). Counting would mean guessing. */
export const UPDATE_CHECK_STATUSES = ["up-to-date", "behind", "unknown"] as const;

/** What the upstream probe found, per channel. A `main` build is compared with main's head commit; a
 *  `stable` build with the latest published GitHub Release. */
export const upstreamSchema = z.discriminatedUnion("channel", [
  z.strictObject({
    channel: z.literal("main"),
    commit: z.string().min(1),
    short: z.string().min(1),
    /** ISO-8601 commit date, or `null` when the payload carried none. */
    committedAt: z.string().min(1).nullable(),
  }),
  z.strictObject({
    channel: z.literal("stable"),
    /** The release's version, its `v` tag prefix removed. */
    version: z.string().min(1),
    /** ISO-8601 publication date, or `null` when the payload carried none. */
    publishedAt: z.string().min(1).nullable(),
  }),
]);
export type Upstream = z.infer<typeof upstreamSchema>;
/** The upstream arm one channel is compared against. */
export type UpstreamOf<C extends ReleaseChannel> = Extract<Upstream, { readonly channel: C }>;

/** What ONE upstream probe found. A failure is a RETURNED reason, never a throw, so the domain verb that
 *  consumes it branches without importing an infra error class (the `MaterializeBackgroundResult` precedent). */
export type UpstreamProbeResult<T extends Upstream> = { readonly ok: true; readonly upstream: T } | { readonly ok: false; readonly reason: string };

/** The injected ops the update check runs on, one unauthenticated GET per channel, wired at the composition
 *  root over the SSRF-safe egress belt. Declared here so the domain names the TYPE and never the network. */
export type UpstreamProbes = { readonly [C in ReleaseChannel]: () => Promise<UpstreamProbeResult<UpstreamOf<C>>> };

/** The whole verdict, as the About surface renders it. `reason` is non-null EXACTLY on the `unknown` arm —
 *  an unknown that cannot say WHY (offline? no local commit? rate-limited?) is the same useless empty the
 *  named-empty rule exists to forbid. */
export const updateCheckSchema = z.strictObject({
  status: z.enum(UPDATE_CHECK_STATUSES),
  /** What this verdict compared on the local side: the commit on `main` (`unknown` when the process could not
   *  derive one), the version on `stable`. */
  local: z.string().min(1),
  remote: upstreamSchema.nullable(),
  reason: z.string().min(1).nullable(),
});
export type UpdateCheck = z.infer<typeof updateCheckSchema>;

/** The `main` verdict. PURE — the probe's I/O happens above this, so the whole verdict table is driven by a
 *  spec with no network.
 *
 *  An UNRESOLVED local commit is `unknown`, never `behind`: a container built from a zip, or a checkout with
 *  no `.git`, genuinely cannot be compared, and reporting "an update is available" to a box that may already
 *  be current is worse than saying so. */
export function compareToMainHead(local: string, remote: UpstreamOf<"main"> | null, failure: string | null): UpdateCheck {
  if (remote === null) {
    return { status: "unknown", local, remote: null, reason: failure ?? "the upstream head could not be read" };
  }
  if (local === UNKNOWN_COMMIT) {
    return { status: "unknown", local, remote, reason: "this build carries no commit, so it cannot be compared to upstream" };
  }
  return { status: local === remote.commit ? "up-to-date" : "behind", local, remote, reason: null };
}

/** The `stable` verdict. A newer latest release is `behind`; an equal one is `up-to-date`, and so is an
 *  OLDER one, because a stable build ahead of the latest release has nothing newer to take. */
export function compareToLatestRelease(local: string, remote: UpstreamOf<"stable"> | null, failure: string | null): UpdateCheck {
  if (remote === null) {
    return { status: "unknown", local, remote: null, reason: failure ?? "the latest release could not be read" };
  }
  return { status: compareSemver(remote.version, local) > 0 ? "behind" : "up-to-date", local, remote, reason: null };
}
