// THE CAPTURE-CEILING PIN for the `ledger-claims` range read (#2284) — the half of this verb that needs a
// real repository, which is why it is here and not beside the pure judgement pins in ./ledger-claims.test.ts
// (that file's header states the tier boundary: "a planted control never needs a real repository").
//
// THE LIE THIS REPRODUCES. `readClaimRange` shells `git log` through `runNicedSync`, and before the fix it
// named no `maxBuffer`. node's `spawnSync` default is ~1 MiB and it does NOT truncate at the ceiling — it
// KILLS the child with ENOBUFS — so a large range came back `status: null` with empty stdout, and the verb's
// refusal printed `git log <range> failed (status null)`. That sentence is about git. The cause was a default
// nobody chose, in a verb whose ONE intended use is a barrier over a whole merge train: measured on the real
// repository 2026-09-13, 1,023,170 bytes of log was judged fine and 1,457,840 bytes exited 2 blaming git.
//
// BOTH DIRECTIONS IN ONE FIXTURE, because a ceiling that only ever refuses proves nothing about a ceiling
// that works. The same planted repository and the same range are read twice: once under a ceiling smaller
// than the log (the refusal must name OUR number and say git did not fail) and once under an ample one (the
// commits must come back and PARSE). A pin holding only the first arm would pass on a reader that refused
// unconditionally; a pin holding only the second would pass on the pre-fix code.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { parseClaimCommits, readClaimRange } from "../../../../tooling/src/verify/ops/ledger-claims.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** Enough commit BODY to blow past a small planted ceiling without writing a slow fixture. The body is what
 *  `--format=%B` emits, so this is the same payload axis a real merge-train range grows along. */
const BODY_FILLER_BYTES = 40_000;
const COMMITS = 6;
const DEFAULT_CEILING_BODY_BYTES = 180_000;
const DEFAULT_CEILING_COMMITS = 7;
/** Below the fixture's total output and far below anything production uses — the point is that the CALLER's
 *  number is what stopped the read, so the refusal has to name a number the caller can see here. */
const TINY_CEILING_BYTES = 4096;
const AMPLE_CEILING_BYTES = 16 * 1024 * 1024;

function git(cwd: string, args: readonly string[]): void {
  const res = runNicedSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "user.email=pin@orbweaver.test", "-c", "user.name=pin", ...args], { cwd });
  if (res.status !== 0) {
    throw new Error(`fixture git ${args.join(" ")} exited ${String(res.status)}: ${res.stderr}`);
  }
}

/** A repository whose range output is comfortably over TINY_CEILING_BYTES and comfortably under the ample
 *  one, so the two arms below differ ONLY in the ceiling they pass. */
function plantRange(
  scratch: string,
  { bodyBytes = BODY_FILLER_BYTES, commits = COMMITS }: { readonly bodyBytes?: number; readonly commits?: number } = {},
): { readonly base: string } {
  git(scratch, ["init", "--quiet"]);
  writeFileSync(join(scratch, "seed.txt"), "seed\n");
  git(scratch, ["add", "--all"]);
  git(scratch, ["commit", "--quiet", "-m", "seed"]);
  const base = runNicedSync("git", ["rev-parse", "HEAD"], { cwd: scratch }).stdout.trim();
  for (let n = 0; n < commits; n += 1) {
    writeFileSync(join(scratch, `file-${String(n)}.txt`), `${String(n)}\n`);
    git(scratch, ["add", "--all"]);
    const message = join(scratch, ".git", "commit-message.fixture");
    writeFileSync(message, `planted ${String(n)}\n\n${"x".repeat(bodyBytes)}\n`);
    git(scratch, ["commit", "--quiet", "-F", message]);
  }
  return { base };
}

test("a range over the capture ceiling refuses by NAMING the ceiling, and never blames git", ({ scratch }) => {
  const { base } = plantRange(scratch);

  const refused = readClaimRange(scratch, base, "HEAD", TINY_CEILING_BYTES);
  expect(refused).toHaveProperty("error");
  const message = "error" in refused ? refused.error : "";
  // The three things the old refusal could not say: whose ceiling it was, what its value is, and that the
  // subject is innocent. `status null` said none of them.
  expect(message).toContain(String(TINY_CEILING_BYTES));
  expect(message).toContain("ENOBUFS");
  expect(message).toContain("git did not fail");
  expect(message).not.toContain("status null");

  // THE POSITIVE CONTROL, same repository, same range, ample ceiling: the read succeeds AND parses, so the
  // arm above is the ceiling refusing rather than the fixture being unreadable.
  const read = readClaimRange(scratch, base, "HEAD", AMPLE_CEILING_BYTES);
  expect(read).toHaveProperty("stdout");
  const commits = parseClaimCommits("stdout" in read ? read.stdout : "");
  expect(commits).toHaveLength(COMMITS);
  expect(commits.flatMap((c) => c.files)).toContain("file-0.txt");
});

test("the production-arity range read captures and parses a log larger than spawnSync's default", ({ scratch }) => {
  const { base } = plantRange(scratch, { bodyBytes: DEFAULT_CEILING_BODY_BYTES, commits: DEFAULT_CEILING_COMMITS });

  // No fourth argument: this is the production call shape in `ledgerClaims`, rather than another explicit
  // ceiling test. The planted payload crosses Node's roughly 1 MiB spawnSync default and remains ordinary
  // ledger input, so success proves the production default reaches the parser instead of dying at capture.
  const read = readClaimRange(scratch, base, "HEAD");
  expect(read).toHaveProperty("stdout");
  const stdout = "stdout" in read ? read.stdout : "";
  expect(Buffer.byteLength(stdout)).toBeGreaterThan(1024 * 1024);
  const commits = parseClaimCommits(stdout);
  expect(commits).toHaveLength(DEFAULT_CEILING_COMMITS);
  expect(commits.flatMap((commit) => commit.files)).toContain("file-0.txt");
});

test("a spawn failure is reported as a spawn failure, not as a git exit status", ({ scratch }) => {
  plantRange(scratch);
  // ENOENT is the other `status: null` this door used to flatten — the same null the ENOBUFS kill produced,
  // from a completely different cause. Reached through a cwd that does not exist, which `spawnSync` fails
  // before git ever runs.
  const res = readClaimRange(join(scratch, "no-such-dir"), "HEAD~1", "HEAD");
  expect(res).toHaveProperty("error");
  const message = "error" in res ? res.error : "";
  expect(message).toContain("could not be spawned");
  expect(message).toContain("is not a verdict");
});
