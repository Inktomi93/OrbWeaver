import { unlinkSync } from "node:fs";
import process from "node:process";
import { runTool, UsageError } from "../../_shared/run-tool.ts";
import {
  adoptDevStackGroup,
  adoptionText,
  captureDevStackIdentity,
  devStackGroupHasMembers,
  devStackIdentityFilePath,
  readDevStackIdentity,
  recordedDevStackVerdict,
  signalAdoptedDevStackGroup,
  signalDevStackIdentity,
  writeDevStackIdentity,
} from "../lib/dev-process-identity.ts";

const repoRoot = process.cwd();
const CAPTURE_ATTEMPTS = 100;
const CAPTURE_RETRY_MS = 20;

function errnoIs(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function print(verdict: { readonly verdict: string; readonly pgid?: number; readonly reason?: string }): void {
  process.stdout.write(`RESULT dev-identity verdict=${verdict.verdict} pgid=${verdict.pgid ?? "none"} reason=${JSON.stringify(verdict.reason ?? "")}\n`);
}

async function captureAfterExec(pid: number, attempts = CAPTURE_ATTEMPTS): Promise<number> {
  const identity = captureDevStackIdentity(repoRoot, pid);
  if (identity !== null) {
    writeDevStackIdentity(identity);
    print({ verdict: "owned", pgid: identity.pgid });
    return 0;
  }
  if (attempts <= 1) {
    print({ verdict: "refused", reason: "spawned leader never reached the strict stack identity" });
    return 1;
  }
  await new Promise((resolve) => setTimeout(resolve, CAPTURE_RETRY_MS));
  return await captureAfterExec(pid, attempts - 1);
}

function probe(): number {
  const verdict = recordedDevStackVerdict(repoRoot);
  print(verdict);
  return verdict.verdict === "owned" ? 0 : 1;
}

/** WHAT WAS VERIFIED, AND HOW (#1013 receipt 1: `status` reported a pidfile group from a different era as
 *  though the number itself meant something). One line, always, naming the evidence rather than a state:
 *  a witnessed leader, an adopted marked group, an unadoptable one and its unmarked pids, or absence.
 *  Non-destructive by construction — it reads `/proc` and signals nothing. */
function describeOwnership(): number {
  const verdict = recordedDevStackVerdict(repoRoot);
  if (verdict.verdict === "owned") {
    process.stdout.write(
      `DESCRIBE dev-stack basis=leader-identity pgid=${verdict.pgid} detail=${JSON.stringify(`leader pid ${verdict.pgid} witnessed: /proc identity matches the launch record byte for byte`)}\n`,
    );
    return 0;
  }
  if (verdict.verdict !== "departed") {
    process.stdout.write(`DESCRIBE dev-stack basis=${verdict.verdict} pgid=none detail=${JSON.stringify(verdict.reason)}\n`);
    return verdict.verdict === "absent" ? 0 : 1;
  }
  const identity = readDevStackIdentity(repoRoot);
  const adoption = identity === null ? null : adoptDevStackGroup(identity);
  if (adoption === null) {
    process.stdout.write(`DESCRIBE dev-stack basis=unreadable pgid=${verdict.pgid} detail=${JSON.stringify(verdict.reason)}\n`);
    return 1;
  }
  process.stdout.write(`DESCRIBE dev-stack basis=${adoption.kind} pgid=${adoption.pgid} detail=${JSON.stringify(adoptionText(adoption))}\n`);
  return adoption.kind === "adoptable" || adoption.kind === "empty" ? 0 : 1;
}

/** ADOPT a leaderless group and signal it (#1013). The standing rule is untouched — `signal` above still
 *  refuses a departed leader — this is the STRICTER second door: it signals only when EVERY live member of
 *  the recorded group carries the launch marker the record names, which is more evidence of ownership than
 *  a witnessed leader's pgid alone ever was. A record with no marker, a group with an unmarked member, or
 *  a leader that is still ALIVE all refuse; the last because a live leader is `signal`'s job, not this. */
function adoptSignal(arg: string | undefined): number {
  if (arg !== "SIGTERM" && arg !== "SIGKILL") {
    throw new UsageError("adopt-signal requires SIGTERM or SIGKILL");
  }
  const verdict = recordedDevStackVerdict(repoRoot);
  if (verdict.verdict !== "departed") {
    print({ ...verdict, reason: `adopt-signal applies only to a DEPARTED leader; this record is ${verdict.verdict}` });
    return 1;
  }
  const identity = readDevStackIdentity(repoRoot);
  if (identity === null) {
    print(verdict);
    return 1;
  }
  const adoption = signalAdoptedDevStackGroup(identity, arg);
  print({ verdict: adoption.kind === "adoptable" ? "adopted" : "refused", pgid: adoption.pgid, reason: adoptionText(adoption) });
  // An EMPTY group is not a failure: there was provably nothing left to signal, the same outcome as a
  // delivered one (the #1162 reasoning, applied to this door).
  return adoption.kind === "adoptable" || adoption.kind === "empty" ? 0 : 1;
}

function signal(arg: string | undefined): number {
  if (arg !== "SIGTERM" && arg !== "SIGKILL") {
    throw new UsageError("signal requires SIGTERM or SIGKILL");
  }
  const identity = readDevStackIdentity(repoRoot);
  if (identity === null) {
    const verdict = recordedDevStackVerdict(repoRoot);
    print(verdict);
    return verdict.verdict === "absent" ? 0 : 1;
  }
  const verdict = signalDevStackIdentity(identity, arg);
  // A DEPARTED leader is not automatically a failed signal (#1162): when the recorded group has no members
  // left there is provably nothing to signal, which is the same outcome as a delivered one. The refusal
  // survives untouched for the case it was minted for — a leaderless group that still holds a survivor,
  // whose ownership nobody can witness.
  if (verdict.verdict === "departed") {
    const survivors = devStackGroupHasMembers(verdict.pgid);
    print(survivors ? verdict : { verdict: "absent", pgid: verdict.pgid, reason: `dev-stack group ${verdict.pgid} has no members left; nothing to signal` });
    return survivors ? 1 : 0;
  }
  print(verdict);
  return verdict.verdict === "signaled" || verdict.verdict === "absent" ? 0 : 1;
}

/** Delete the launch record and report the verdict that authorized it. */
function clearIdentity(verdict: { readonly verdict: string; readonly pgid?: number; readonly reason?: string }): number {
  // @orb-waive caught-failure-ownership(error): ENOENT means the already-absent identity file needs no deletion; every other unlink failure surfaces and prevents a cleared verdict. Ends if another absence code is supported.
  try {
    unlinkSync(devStackIdentityFilePath(repoRoot));
  } catch (error) {
    if (!errnoIs(error, "ENOENT")) {
      throw error;
    }
  }
  print(verdict);
  return 0;
}

/** The teardown's LAST word (#1162). It used to demand the `absent` verdict, which `recordedDevStackVerdict`
 *  can only reach when the record file is ALREADY GONE — and this verb is the only thing that deletes it.
 *  So after every successful KILL the leader was dead, the verdict read `departed`, and stack.sh printed
 *  "group N still has verified survivors after KILL — manual cleanup required" over a group that had just
 *  exited cleanly. Not a race: unconditional, on a claim nothing had checked.
 *
 *  A departed leader leaves exactly one answerable question, and it is the one the warning asserts: does
 *  the GROUP still hold a member? Empty — the record describes nothing, so clear it and report stopped.
 *  Populated — the alarm is TRUE, and it prints with the survivor claim it actually verified. */
function clearAbsent(): number {
  const verdict = recordedDevStackVerdict(repoRoot);
  if (verdict.verdict === "departed") {
    if (devStackGroupHasMembers(verdict.pgid)) {
      print(verdict);
      return 1;
    }
    return clearIdentity({ verdict: "absent", pgid: verdict.pgid, reason: `dev-stack group ${verdict.pgid} has no members left; clearing the launch record` });
  }
  if (verdict.verdict !== "absent") {
    print(verdict);
    return 1;
  }
  return clearIdentity(verdict);
}

await runTool(async () => {
  const [verb, arg] = process.argv.slice(2);
  if (verb === "capture") {
    return await captureAfterExec(Number(arg));
  }
  if (verb === "probe") {
    return probe();
  }
  if (verb === "signal") {
    return signal(arg);
  }
  if (verb === "clear-absent") {
    return clearAbsent();
  }
  if (verb === "describe") {
    return describeOwnership();
  }
  if (verb === "adopt-signal") {
    return adoptSignal(arg);
  }
  throw new UsageError("usage: dev-identity-entry.ts capture <pid> | probe | describe | signal SIGTERM|SIGKILL | adopt-signal SIGTERM|SIGKILL | clear-absent");
});
