// foundation/version — the boot-time build-identity reader, driven over REAL fixture directories on disk
// (int, not unit: the whole point of this module is that it reads plain files, so a mocked fs would be
// testing the mock).
//
// The four arms that matter, each one a shape this repository actually produces:
//   HEAD → loose ref            a normal checkout
//   HEAD → packed-refs          a checkout after `git gc` — the loose file is simply gone
//   detached HEAD               a CI/`snap --isolated` checkout at a sha
//   HEAD naming a ref nowhere   the CONTAINER BUILD's throwaway `git init` (no branch was ever committed)
// plus the stamp's precedence over all of them, and a root with no `.git` at all.
//
// No git binary is involved on either side: the fixtures are written as text, which is exactly how the
// reader will meet them inside an image.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildVersionStamp,
  readGitCommit,
  readPackageVersion,
  readVersionIdentity,
  readVersionStamp,
  VERSION_STAMP_FILE,
} from "@orb/server/foundation/version";
import { afterEach, beforeEach, describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const COMMIT = "823d76f4343a1cea086b17a1b5bf212b44c17a7d";
const OTHER_COMMIT = "f00dcafe1234567890abcdef1234567890abcdef";
const BRANCH = "refs/heads/main";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "orb-version-"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "orbweaver", version: "1.4.2" }), "utf8");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Write a `.git` DIRECTORY with the given plain files — the shape the reader actually meets. */
async function gitDir(files: { readonly head?: string; readonly looseRef?: string; readonly packedRefs?: string }): Promise<void> {
  const dir = join(root, ".git");
  await mkdir(join(dir, "refs", "heads"), { recursive: true });
  if (files.head !== undefined) {
    await writeFile(join(dir, "HEAD"), files.head, "utf8");
  }
  if (files.looseRef !== undefined) {
    await writeFile(join(dir, BRANCH), files.looseRef, "utf8");
  }
  if (files.packedRefs !== undefined) {
    await writeFile(join(dir, "packed-refs"), files.packedRefs, "utf8");
  }
}

describe("readGitCommit", () => {
  test("HEAD → a loose ref resolves to that ref's sha", async () => {
    await gitDir({ head: `ref: ${BRANCH}\n`, looseRef: `${COMMIT}\n` });
    expect(readGitCommit(root)).toBe(COMMIT);
  });

  test("HEAD → a PACKED ref resolves when the loose file is gone (post-gc — the common steady state)", async () => {
    await gitDir({
      head: `ref: ${BRANCH}\n`,
      packedRefs: `# pack-refs with: peeled fully-peeled sorted \n${OTHER_COMMIT} refs/heads/other\n${COMMIT} ${BRANCH}\n`,
    });
    expect(readGitCommit(root)).toBe(COMMIT);
  });

  test("a LOOSE ref WINS over a stale packed row for the same branch (git's own order)", async () => {
    await gitDir({ head: `ref: ${BRANCH}\n`, looseRef: `${COMMIT}\n`, packedRefs: `${OTHER_COMMIT} ${BRANCH}\n` });
    expect(readGitCommit(root)).toBe(COMMIT);
  });

  test("a DETACHED HEAD is already the sha", async () => {
    await gitDir({ head: `${COMMIT}\n` });
    expect(readGitCommit(root)).toBe(COMMIT);
  });

  test("HEAD naming a ref that exists NOWHERE is null — the container build's throwaway `git init`", async () => {
    // `git init` writes HEAD pointing at refs/heads/main before any commit exists. The honest answer is "I
    // don't know", NOT a fabricated sha and NOT a throw that would kill the build or the boot.
    await gitDir({ head: `ref: ${BRANCH}\n` });
    expect(readGitCommit(root)).toBeNull();
  });

  test("no `.git` at all is null — a zip download, or an image", () => {
    expect(readGitCommit(root)).toBeNull();
  });
});

describe("readVersionIdentity", () => {
  test("a checkout reports the ROOT manifest version + the derived commit, short to 12", async () => {
    await gitDir({ head: `ref: ${BRANCH}\n`, looseRef: `${COMMIT}\n` });
    expect(readVersionIdentity(root)).toEqual({
      version: "1.4.2",
      commit: COMMIT,
      short: "823d76f4343a",
      source: "checkout",
    });
  });

  test("an unresolvable commit degrades to `unknown` — never a throw, never a fake sha", async () => {
    await gitDir({ head: `ref: ${BRANCH}\n` });
    const identity = readVersionIdentity(root);
    expect(identity.commit).toBe("unknown");
    expect(identity.short).toBe("unknown");
    expect(identity.source).toBe("checkout");
  });

  test("`dirty` is ABSENT from the shape — it is unknowable without git and is never faked", async () => {
    await gitDir({ head: `${COMMIT}\n` });
    expect(Object.keys(readVersionIdentity(root))).not.toContain("dirty");
  });

  test("a STAMPED version.json WINS over a .git beside it — the container build's `git init` cannot win", async () => {
    // Both present, disagreeing on purpose: the build stage has a throwaway .git AND the stamp, and the
    // stamp is the only one that knows the real commit.
    await gitDir({ head: `ref: ${BRANCH}\n` });
    await writeFile(join(root, VERSION_STAMP_FILE), JSON.stringify({ version: "1.4.2", commit: COMMIT, builtAt: "2026-09-18T09:30:00Z" }), "utf8");
    expect(readVersionIdentity(root)).toEqual({
      version: "1.4.2",
      commit: COMMIT,
      short: "823d76f4343a",
      builtAt: "2026-09-18T09:30:00Z",
      source: "container",
    });
  });

  test("a CORRUPT stamp is treated as ABSENT — the reader falls through to .git rather than failing", async () => {
    await gitDir({ head: `${COMMIT}\n` });
    await writeFile(join(root, VERSION_STAMP_FILE), "{ not json", "utf8");
    expect(readVersionStamp(root)).toBeNull();
    expect(readVersionIdentity(root).source).toBe("checkout");
    expect(readVersionIdentity(root).commit).toBe(COMMIT);
  });

  test("a stamp MISSING a required field is refused, not half-read", async () => {
    await writeFile(join(root, VERSION_STAMP_FILE), JSON.stringify({ version: "1.4.2", commit: COMMIT }), "utf8");
    expect(readVersionStamp(root)).toBeNull();
  });

  test("no manifest and no .git still answers — `unknown` on both halves", async () => {
    await rm(join(root, "package.json"));
    expect(readPackageVersion(root)).toBeNull();
    expect(readVersionIdentity(root)).toEqual({ version: "unknown", commit: "unknown", short: "unknown", source: "checkout" });
  });
});

describe("buildVersionStamp — the CONTENT the image build writes to version.json", () => {
  // The checked `scripts/build-version-stamp.ts` entry is the assembler's production caller; these tests pin
  // the content contract separately, so launcher reachability and stamp semantics each fail at their owner.
  test("derives the SAME version+commit the reader would, with the build instant passed IN (never an ambient clock)", async () => {
    await gitDir({ head: `ref: ${BRANCH}\n`, looseRef: `${COMMIT}\n` });
    expect(buildVersionStamp(root, "2026-09-18T09:30:00Z")).toEqual({ version: "1.4.2", commit: COMMIT, builtAt: "2026-09-18T09:30:00Z" });
  });

  test("a stamp built where git cannot answer records `unknown` rather than refusing the build", () => {
    expect(buildVersionStamp(root, "2026-09-18T09:30:00Z").commit).toBe("unknown");
  });

  test("the stamp it builds is exactly what the reader reads back — one derivation, both directions", async () => {
    await gitDir({ head: `${COMMIT}\n` });
    const stamp = buildVersionStamp(root, "2026-09-18T09:30:00Z");
    await writeFile(join(root, VERSION_STAMP_FILE), JSON.stringify(stamp), "utf8");
    expect(readVersionStamp(root)).toEqual(stamp);
    expect(readVersionIdentity(root)).toEqual({ ...stamp, short: "823d76f4343a", source: "container" });
  });
});

describe("a LINKED WORKTREE (every agent lane and every `snap --isolated` run is one)", () => {
  test("HEAD comes from the worktree's own git dir; the REFS come from the shared commondir", async () => {
    // The shape `git worktree add` produces: `.git` is a FILE, the worktree's git dir holds HEAD and a
    // `commondir` pointer, and the branch ref itself lives only in the main repository's refs.
    const main = join(root, "main.git");
    const linked = join(main, "worktrees", "lane");
    await mkdir(join(main, "refs", "heads"), { recursive: true });
    await mkdir(linked, { recursive: true });
    await writeFile(join(main, BRANCH), `${COMMIT}\n`, "utf8");
    await writeFile(join(linked, "HEAD"), `ref: ${BRANCH}\n`, "utf8");
    await writeFile(join(linked, "commondir"), "../..\n", "utf8");
    await writeFile(join(root, ".git"), `gitdir: ${linked}\n`, "utf8");

    expect(readGitCommit(root)).toBe(COMMIT);
  });
});
