// @instrument-proof: the run bundle's dirty-tree DIGEST distinguishes two working trees that differ only
//   by TRAILING WHITESPACE.
// @instrument-absence-proof: a genuinely IDENTICAL tree still hashes identically (hashing the raw bytes
//   did not just make the digest noisy), and a clean tree still reads `clean`.
//
// HONESTLY LABELLED: THIS IS A FENCE, NOT A DEFECT PROOF. #1509 item 7 reported that `git()`'s
// unconditional `.trim()` let two dirty trees differing only by trailing whitespace hash identically. The
// trim is real and the digest did hash the trimmed value — but the collision is UNREACHABLE, and this file
// passed against the unmodified HEAD source. Measured (`git diff --binary HEAD --` over `y\n` vs `y  \n`):
//
//     index 587be6b..975fbec 100644     ← A
//     index 587be6b..cc07eff 100644     ← B
//
// the diff's own `index` line carries the BLOB HASH of the new content, in the middle of the output where
// no trailing trim can reach it, so every content difference survives. The fix stands anyway on the
// weaker-but-real ground that a digest claiming to identify a working tree must hash what git PRINTED
// rather than lean on an incidental header line it does not control — and that is exactly what this file
// fences: if that index line ever stops being emitted, these rows go red instead of the digest quietly
// becoming lossy.
//
// A real git repo in a temp dir, because the subject IS the bytes git prints: a stubbed diff would be a
// test of the stub's whitespace, not of the tool's.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snapDirtyIdentity } from "../../../../tooling/src/snap/lib/run-bundle-files.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const TRACKED = "tracked.txt";

function git(root: string, ...args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "pipe" });
}

/** A committed repo whose one tracked file holds `x`. */
function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "snap-dirty-identity-"));
  git(root, "init", "--quiet");
  git(root, "config", "user.email", "probe@example.invalid");
  git(root, "config", "user.name", "probe");
  writeFileSync(join(root, TRACKED), "x\n");
  git(root, "add", TRACKED);
  git(root, "commit", "--quiet", "-m", "base");
  return root;
}

function digestOf(body: string): string {
  const root = repo();
  writeFileSync(join(root, TRACKED), body);
  const identity = snapDirtyIdentity(root);
  expect(identity.failures).toEqual([]);
  expect(identity.state).toBe("dirty");
  expect(identity.digest).not.toBeNull();
  return identity.digest ?? "";
}

test("two dirty trees differing ONLY by trailing whitespace get different digests", () => {
  // The diff's final characters are the added line's trailing spaces; `trim()` ate exactly those.
  expect(digestOf("y\n")).not.toBe(digestOf("y  \n"));
});

test("identical dirty trees still agree, and a clean tree is clean", () => {
  expect(digestOf("y  \n")).toBe(digestOf("y  \n"));

  const clean = snapDirtyIdentity(repo());
  expect(clean.failures).toEqual([]);
  expect(clean.state).toBe("clean");
});

test("an untracked file's bytes are still part of the identity", () => {
  const root = repo();
  writeFileSync(join(root, "scratch.txt"), "a\n");
  const first = snapDirtyIdentity(root);
  writeFileSync(join(root, "scratch.txt"), "b\n");
  const second = snapDirtyIdentity(root);

  expect(first.state).toBe("dirty");
  expect(first.digest).not.toBe(second.digest);
});
