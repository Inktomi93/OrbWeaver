// @orb/kit/version-identity — the pure half of the build-identity system: text → sha, and (local, remote)
// → verdict. Everything here runs with no filesystem and no network, which is the whole reason the I/O was
// split away from it: the server reader, the container build stamp and this spec all share ONE derivation.

import type { VersionIdentity } from "@orb/kit/version-identity";
import {
  compareToLatestRelease,
  compareToMainHead,
  formatVersionIdentity,
  gitDirRedirect,
  headRefName,
  releaseChannelOf,
  releaseTagRef,
  resolveCommit,
  resolveRef,
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
const TAG = "refs/tags/v0.1.0";

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

describe("resolveRef — the release tag lookup", () => {
  test("a packed ANNOTATED tag resolves to its peeled commit, not to the tag object", () => {
    expect(resolveRef(TAG, null, `${OTHER} ${TAG}\n^${SHA}\n`)).toBe(SHA);
  });

  test("a packed lightweight tag resolves to its own row, and a peeled row of the NEXT tag is not borrowed", () => {
    expect(resolveRef(TAG, null, `${SHA} ${TAG}\n${OTHER} refs/tags/v0.2.0\n^${SHA256}\n`)).toBe(SHA);
  });

  test("a loose tag wins over the packed table", () => {
    expect(resolveRef(TAG, `${SHA}\n`, `${OTHER} ${TAG}\n`)).toBe(SHA);
  });
});

describe("releaseChannelOf", () => {
  test("the commit its own release tag names is stable", () => {
    expect(releaseChannelOf(SHA, SHA)).toBe("stable");
  });

  test("a tag on another commit, no tag, or no commit is main — a build that cannot prove it is the release is not one", () => {
    expect(releaseChannelOf(SHA, OTHER)).toBe("main");
    expect(releaseChannelOf(SHA, null)).toBe("main");
    expect(releaseChannelOf(null, null)).toBe("main");
  });

  test("the tag is release-please's `v<version>` spelling", () => {
    expect(releaseTagRef("0.1.0")).toBe(TAG);
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

describe("compareToMainHead — the main verdict table", () => {
  const remote = { channel: "main", commit: OTHER, short: "f00dcafe1234", committedAt: "2026-09-17T12:00:00Z" } as const;

  test("the same commit is up-to-date, with no reason to explain", () => {
    expect(compareToMainHead(SHA, { ...remote, commit: SHA, short: "823d76f4343a" }, null)).toEqual({
      status: "up-to-date",
      local: SHA,
      remote: { channel: "main", commit: SHA, short: "823d76f4343a", committedAt: "2026-09-17T12:00:00Z" },
      reason: null,
    });
  });

  test("a DIFFERENT upstream commit is behind, and carries the remote so the UI can name it", () => {
    const verdict = compareToMainHead(SHA, remote, null);
    expect(verdict.status).toBe("behind");
    expect(verdict.remote).toEqual(remote);
    // No commit COUNT: one GET of the head cannot know the distance, and guessing would be a lie.
    expect(Object.keys(verdict)).toEqual(["status", "local", "remote", "reason"]);
  });

  test("a FAILED probe is `unknown` and keeps the probe's own reason — never a silent up-to-date", () => {
    expect(compareToMainHead(SHA, null, "couldn't reach GitHub — this box may be offline")).toEqual({
      status: "unknown",
      local: SHA,
      remote: null,
      reason: "couldn't reach GitHub — this box may be offline",
    });
  });

  test("a failed probe with NO reason still states one — an unknown that cannot say why is a useless empty", () => {
    expect(compareToMainHead(SHA, null, null).reason).not.toBeNull();
  });

  test("an UNKNOWN local commit is `unknown`, NOT behind — an uncomparable box is never told to update", () => {
    const verdict = compareToMainHead(UNKNOWN_COMMIT, remote, null);
    expect(verdict.status).toBe("unknown");
    expect(verdict.reason).toContain("cannot be compared");
  });
});

describe("compareToLatestRelease — the stable verdict table", () => {
  const release = { channel: "stable", version: "0.2.0", publishedAt: "2026-10-01T12:00:00Z" } as const;

  test("a newer latest release is behind, carrying the release so the UI can name it", () => {
    expect(compareToLatestRelease("0.1.0", release, null)).toEqual({ status: "behind", local: "0.1.0", remote: release, reason: null });
  });

  test("the same version is up-to-date", () => {
    expect(compareToLatestRelease("0.2.0", release, null).status).toBe("up-to-date");
  });

  test("ordering is numeric: 0.10.0 is newer than 0.9.0, so a 0.9.0 box is behind", () => {
    expect(compareToLatestRelease("0.9.0", { ...release, version: "0.10.0" }, null).status).toBe("behind");
  });

  test("a build AHEAD of the latest release has nothing newer to take, so it is never told to downgrade", () => {
    expect(compareToLatestRelease("0.3.0", release, null).status).toBe("up-to-date");
  });

  test("a failed probe is `unknown` with the probe's reason, and states one when the probe gave none", () => {
    expect(compareToLatestRelease("0.1.0", null, "no stable release has been published on GitHub yet")).toEqual({
      status: "unknown",
      local: "0.1.0",
      remote: null,
      reason: "no stable release has been published on GitHub yet",
    });
    expect(compareToLatestRelease("0.1.0", null, null).reason).not.toBeNull();
  });
});

describe("the wire schema", () => {
  const head = { channel: "main", commit: OTHER, short: "f00dcafe1234", committedAt: null } as const;
  const release = { channel: "stable", version: "0.2.0", publishedAt: null } as const;

  test("every verdict satisfies the wire schema it is sent over", () => {
    for (const verdict of [
      compareToMainHead(SHA, head, null),
      compareToMainHead(SHA, null, "offline"),
      compareToMainHead(UNKNOWN_COMMIT, head, null),
      compareToLatestRelease("0.1.0", release, null),
      compareToLatestRelease("0.1.0", null, "offline"),
    ]) {
      expect(updateCheckSchema.safeParse(verdict).success).toBe(true);
    }
  });

  test("an upstream arm carrying the OTHER channel's fields is refused — the arms are strict", () => {
    expect(updateCheckSchema.safeParse({ status: "behind", local: "0.1.0", remote: { ...release, commit: OTHER }, reason: null }).success).toBe(false);
  });
});

describe("the identity shape", () => {
  const identity: VersionIdentity = { version: "0.4.1", commit: SHA, short: "823d76f4343a", source: "container", channel: "main" };

  test("`builtAt` is optional — a checkout has no build instant to report", () => {
    expect(versionIdentitySchema.safeParse({ ...identity, source: "checkout" }).success).toBe(true);
  });

  test("an unknown SOURCE is refused — the arm decides how the UI explains provenance", () => {
    expect(versionIdentitySchema.safeParse({ ...identity, source: "guess" }).success).toBe(false);
  });

  test("an unknown CHANNEL is refused — the channel decides the version line and the update upstream", () => {
    expect(versionIdentitySchema.safeParse({ ...identity, channel: "beta" }).success).toBe(false);
  });

  test("a stable release prints as its tag", () => {
    expect(formatVersionIdentity({ ...identity, channel: "stable" })).toBe("v0.4.1");
  });

  test("a main build prints as a dev pre-release with the short commit as build metadata", () => {
    expect(formatVersionIdentity(identity)).toBe("0.4.1-dev+823d76f4343a");
  });
});
