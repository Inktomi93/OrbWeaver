// THE BUILD IDENTITY SHAPE + its pure derivations — "what exactly is this running Orbweaver?", in the ONE
// home every consumer can reach (owner ask 2026-09-18: "a versioning system to stay in sync with github and
// to help with bug reports").
//
// WHY `kit` AND NOT `contracts`, even though this crosses server→client: the block is also a FIELD of
// `BugReportRecord` (`@orb/kit/bug-report`), whose own header states why that record is homed here — its
// writer (`@orb/server`) and its reader (`@orb/tooling`) sit at opposite ends of the cake. A `contracts`
// home would force `kit → contracts`, an upward import, which the constitution (§2.1) makes automatically
// wrong. `kit` is one of the four sanctioned type homes; `contracts`, `db`, `server` and `client` all import
// it DOWNWARD, so one home serves the tRPC wire, the bug bundle and the `/healthz` body without a respell.
//
// THE DERIVATIONS HERE ARE PURE TEXT → FACT. No `node:*`, no child process, no git binary: the caller hands
// over the CONTENTS of `.git/HEAD`, of the ref file it names, and of `.git/packed-refs`, and gets back a sha
// or `null`. That split is what lets the SAME logic run in three places that cannot share an I/O layer — the
// server's boot-time reader (`@orb/server/foundation/version`), the container build stamp
// (`docker/assemble-runtime.sh`), and a spec driving a fixture `.git` with no repository at all.
//
// `dirty` IS DELIBERATELY ABSENT. Whether the working tree matches its commit cannot be answered without
// hashing the index against every tracked file — i.e. without git. A field that is always `false` would be a
// lie in exactly the case a bug report needs the truth, so this shape does not carry one. The bug-report
// capture keeps its OWN git-backed `build.dirty` (it runs in a dev checkout, by design) — that is a separate
// fact with a separate honesty story, not a duplicate of this one.

import { z } from "zod";

/** Where the identity came from. `checkout` = derived from `.git` plain files at boot; `container` = read
 *  from the `version.json` the image build stamped (an image ships no `.git`, so nothing else could answer). */
export const VERSION_SOURCES = ["checkout", "container"] as const;
export type VersionSource = (typeof VERSION_SOURCES)[number];

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
/** `gitdir: /abs/path/.git/worktrees/x` — the `.git` FILE a linked worktree carries instead of a directory. */
const GITDIR_FILE_RE = /^gitdir:\s*(?<dir>.+)$/u;

/** The identity of one running Orbweaver. The wire shape of `settings.getVersion`, the `/healthz` `version`
 *  block, and the first header field of a bug-report bundle — one shape, everywhere a human looks. */
export const versionIdentitySchema = z.object({
  /** The root `package.json` `version` — the release number the owner bumps and tags. */
  version: z.string().min(1),
  /** The full commit sha, or {@link UNKNOWN_COMMIT}. */
  commit: z.string().min(1),
  /** `commit` truncated to {@link SHORT_COMMIT_LENGTH}, or {@link UNKNOWN_COMMIT} unchanged. */
  short: z.string().min(1),
  /** ISO-8601 of the image build. Present only on the `container` arm — a checkout has no build instant. */
  builtAt: z.string().min(1).optional(),
  source: z.enum(VERSION_SOURCES),
});
export type VersionIdentity = z.infer<typeof versionIdentitySchema>;

/** The `version.json` an image build stamps beside the runtime file set. A SUBSET of the identity — `short`
 *  and `source` are DERIVED at read time rather than stored, so a hand-edited stamp cannot disagree with
 *  itself. */
export const versionStampSchema = z.object({
  version: z.string().min(1),
  commit: z.string().min(1),
  builtAt: z.string().min(1),
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
 *  or — the container build's `git init` case — never created) the packed table is scanned for the name.
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
  const loose = files.headRef?.trim() ?? "";
  if (OBJECT_ID_RE.test(loose)) {
    return loose;
  }
  return packedRefCommit(files.packedRefs, ref);
}

/** Scan `packed-refs` for one ref name. Peeled-tag rows (`^<oid>`) carry no name and never match. */
function packedRefCommit(packedRefs: string | null, ref: string): string | null {
  if (packedRefs === null) {
    return null;
  }
  for (const line of packedRefs.split("\n")) {
    const groups = PACKED_REF_RE.exec(line.trim())?.groups;
    if (groups !== undefined && groups["ref"] === ref) {
      return groups["oid"] ?? null;
    }
  }
  return null;
}

/** The printable short form. {@link UNKNOWN_COMMIT} passes through unchanged — truncating the word "unknown"
 *  would produce a string that LOOKS like a sha prefix. */
export function shortCommit(commit: string): string {
  return commit === UNKNOWN_COMMIT ? UNKNOWN_COMMIT : commit.slice(0, SHORT_COMMIT_LENGTH);
}

/** The one-line human form both the boot log and the About surface print: `v0.4.1 (a1b2c3d4e5f6, checkout)`. */
export function formatVersionIdentity(identity: VersionIdentity): string {
  return `v${identity.version} (${identity.short}, ${identity.source})`;
}

// ── the manual update check ──────────────────────────────────────────────────────────────────────────

/** The verdict vocabulary. `behind` deliberately carries NO commit COUNT: the check is one unauthenticated
 *  GET of the upstream head, which knows the remote sha but not how many commits separate it from ours
 *  (that needs the object graph, i.e. a fetch). Counting would mean guessing. */
export const UPDATE_CHECK_STATUSES = ["up-to-date", "behind", "unknown"] as const;
export type UpdateCheckStatus = (typeof UPDATE_CHECK_STATUSES)[number];

/** What the upstream probe found: the branch head's sha and when it was committed. */
export const upstreamHeadSchema = z.object({
  commit: z.string().min(1),
  short: z.string().min(1),
  /** ISO-8601 commit date, or `null` when the payload carried none. */
  committedAt: z.string().min(1).nullable(),
});
export type UpstreamHead = z.infer<typeof upstreamHeadSchema>;

/** What ONE upstream probe found. A failure is a RETURNED reason, never a throw, so the domain verb that
 *  consumes it branches without importing an infra error class (the `MaterializeBackgroundResult` precedent). */
export type UpstreamProbeResult = { readonly ok: true; readonly head: UpstreamHead } | { readonly ok: false; readonly reason: string };

/** The injected op the update check runs on: one unauthenticated GET, wired at the composition root over the
 *  SSRF-safe egress belt. Declared here so the domain names the TYPE and never the network. */
export type UpstreamHeadProbe = () => Promise<UpstreamProbeResult>;

/** The whole verdict, as the About surface renders it. `reason` is non-null EXACTLY on the `unknown` arm —
 *  an unknown that cannot say WHY (offline? no local commit? rate-limited?) is the same useless empty the
 *  named-empty rule exists to forbid. */
export const updateCheckSchema = z.object({
  status: z.enum(UPDATE_CHECK_STATUSES),
  /** The local commit this verdict compared — `unknown` when the process could not derive one. */
  local: z.string().min(1),
  remote: upstreamHeadSchema.nullable(),
  reason: z.string().min(1).nullable(),
});
export type UpdateCheck = z.infer<typeof updateCheckSchema>;

/** Decide the verdict. PURE — the probe's I/O happens above this, so the whole verdict table is driven by a
 *  spec with no network.
 *
 *  An UNRESOLVED local commit is `unknown`, never `behind`: a container built from a zip, or a checkout with
 *  no `.git`, genuinely cannot be compared, and reporting "an update is available" to a box that may already
 *  be current is worse than saying so. */
export function compareToUpstream(local: string, remote: UpstreamHead | null, failure: string | null): UpdateCheck {
  if (remote === null) {
    return { status: "unknown", local, remote: null, reason: failure ?? "the upstream head could not be read" };
  }
  if (local === UNKNOWN_COMMIT) {
    return { status: "unknown", local, remote, reason: "this build carries no commit, so it cannot be compared to upstream" };
  }
  return { status: local === remote.commit ? "up-to-date" : "behind", local, remote, reason: null };
}
