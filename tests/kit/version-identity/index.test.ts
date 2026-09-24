// @orb/kit/version-identity — the pure half of the build-identity system: text → sha, and (local, remote)
// → verdict. Everything here runs with no filesystem and no network, which is the whole reason the I/O was
// split away from it: the server reader, the container build stamp and this spec all share ONE derivation.

import {
  compareToUpstream,
  formatVersionIdentity,
  gitDirRedirect,
  headRefName,
  resolveCommit,
  shortCommit,
  UNKNOWN_COMMIT,
  updateCheckSchema,
  versionIdentitySchema,
} from "@orb/kit/version-identity";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const SHA = "823d76f4343a1cea086b17a1b5bf212b44c17a7d";
const SHA256 = "a".repeat(64);
const OTHER = "f00dcafe1234567890abcdef1234567890abcdef";
const BRANCH = "refs/heads/main";

describe("headRefName", () => {
  test("reads the ref out of a symbolic HEAD", () => {
    expect(headRefName(`ref: ${BRANCH}\n`)).toBe(BRANCH);
  });

  test("a detached HEAD names no ref", () => {
    expect(headRefName(`${SHA}\n`)).toBeNull();
  });

  test("an absent HEAD names no ref", () => {
    expect(headRefName(null)).toBeNull();
  });
});

describe("resolveCommit", () => {
  test("a detached HEAD is the sha itself", () => {
    expect(resolveCommit({ head: `${SHA}\n`, headRef: null, packedRefs: null })).toBe(SHA);
  });

  test("a sha-256 object id resolves too (64 hex, not just 40)", () => {
    expect(resolveCommit({ head: `${SHA256}\n`, headRef: null, packedRefs: null })).toBe(SHA256);
  });

  test("a loose ref answers when present", () => {
    expect(resolveCommit({ head: `ref: ${BRANCH}\n`, headRef: `${SHA}\n`, packedRefs: null })).toBe(SHA);
  });

  test("packed-refs answers when the loose file is gone, matching the NAME and not merely the first row", () => {
    const packed = `# pack-refs with: peeled fully-peeled sorted \n${OTHER} refs/heads/other\n${SHA} ${BRANCH}\n`;
    expect(resolveCommit({ head: `ref: ${BRANCH}\n`, headRef: null, packedRefs: packed })).toBe(SHA);
  });

  test("a PEELED tag row (`^<oid>`, no name) is never mistaken for a ref", () => {
    const packed = `${OTHER} refs/tags/v1\n^${SHA}\n`;
    expect(resolveCommit({ head: `ref: ${BRANCH}\n`, headRef: null, packedRefs: packed })).toBeNull();
  });

  test("a ref that exists NOWHERE is null — a branch checked out before its first commit", () => {
    expect(resolveCommit({ head: `ref: ${BRANCH}\n`, headRef: null, packedRefs: "" })).toBeNull();
  });

  test("garbage in HEAD is null, never a partial read", () => {
    expect(resolveCommit({ head: "not a ref and not a sha", headRef: `${SHA}\n`, packedRefs: null })).toBeNull();
  });
});

describe("gitDirRedirect", () => {
  test("reads the gitdir out of a linked worktree's `.git` FILE", () => {
    expect(gitDirRedirect("gitdir: /repo/.git/worktrees/lane\n")).toBe("/repo/.git/worktrees/lane");
  });

  test("a directory's HEAD text is not a redirect", () => {
    expect(gitDirRedirect(`ref: ${BRANCH}\n`)).toBeNull();
  });
});

describe("shortCommit", () => {
  test("truncates to 12 — the length that pastes into `git show`", () => {
    expect(shortCommit(SHA)).toBe("823d76f4343a");
  });

  test("`unknown` passes through WHOLE — a truncated 'unkno' would read like a sha prefix", () => {
    expect(shortCommit(UNKNOWN_COMMIT)).toBe(UNKNOWN_COMMIT);
  });
});

describe("compareToUpstream — the whole verdict table", () => {
  const remote = { commit: OTHER, short: "f00dcafe1234", committedAt: "2026-09-17T12:00:00Z" };

  test("the same commit is up-to-date, with no reason to explain", () => {
    expect(compareToUpstream(SHA, { ...remote, commit: SHA, short: "823d76f4343a" }, null)).toEqual({
      status: "up-to-date",
      local: SHA,
      remote: { commit: SHA, short: "823d76f4343a", committedAt: "2026-09-17T12:00:00Z" },
      reason: null,
    });
  });

  test("a DIFFERENT upstream commit is behind, and carries the remote so the UI can name it", () => {
    const verdict = compareToUpstream(SHA, remote, null);
    expect(verdict.status).toBe("behind");
    expect(verdict.remote).toEqual(remote);
    // No commit COUNT: one GET of the head cannot know the distance, and guessing would be a lie.
    expect(Object.keys(verdict)).toEqual(["status", "local", "remote", "reason"]);
  });

  test("a FAILED probe is `unknown` and keeps the probe's own reason — never a silent up-to-date", () => {
    expect(compareToUpstream(SHA, null, "couldn't reach GitHub — this box may be offline")).toEqual({
      status: "unknown",
      local: SHA,
      remote: null,
      reason: "couldn't reach GitHub — this box may be offline",
    });
  });

  test("a failed probe with NO reason still states one — an unknown that cannot say why is a useless empty", () => {
    expect(compareToUpstream(SHA, null, null).reason).not.toBeNull();
  });

  test("an UNKNOWN local commit is `unknown`, NOT behind — an uncomparable box is never told to update", () => {
    const verdict = compareToUpstream(UNKNOWN_COMMIT, remote, null);
    expect(verdict.status).toBe("unknown");
    expect(verdict.reason).toContain("cannot be compared");
  });

  test("every verdict satisfies the wire schema it is sent over", () => {
    for (const verdict of [compareToUpstream(SHA, remote, null), compareToUpstream(SHA, null, "offline"), compareToUpstream(UNKNOWN_COMMIT, remote, null)]) {
      expect(updateCheckSchema.safeParse(verdict).success).toBe(true);
    }
  });
});

describe("the identity shape", () => {
  test("`builtAt` is optional — a checkout has no build instant to report", () => {
    expect(versionIdentitySchema.safeParse({ version: "1.0.0", commit: SHA, short: "823d76f4343a", source: "checkout" }).success).toBe(true);
  });

  test("an unknown SOURCE is refused — the arm decides how the UI explains provenance", () => {
    expect(versionIdentitySchema.safeParse({ version: "1.0.0", commit: SHA, short: "823d76f4343a", source: "guess" }).success).toBe(false);
  });

  test("the human line is what the issue form asks a reporter to paste", () => {
    expect(formatVersionIdentity({ version: "0.4.1", commit: SHA, short: "823d76f4343a", source: "container" })).toBe("v0.4.1 (823d76f4343a, container)");
  });
});
