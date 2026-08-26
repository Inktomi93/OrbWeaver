import { unlinkSync } from "node:fs";
import process from "node:process";
import { runTool, UsageError } from "../../_shared/run-tool.ts";
import {
  captureDevStackIdentity,
  devStackIdentityFilePath,
  readDevStackIdentity,
  recordedDevStackVerdict,
  signalDevStackIdentity,
  writeDevStackIdentity,
} from "../lib/dev-process-identity.ts";

const repoRoot = process.cwd();
const CAPTURE_ATTEMPTS = 100;
const CAPTURE_RETRY_MS = 20;

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
  print(verdict);
  return verdict.verdict === "signaled" || verdict.verdict === "absent" ? 0 : 1;
}

function clearAbsent(): number {
  const verdict = recordedDevStackVerdict(repoRoot);
  if (verdict.verdict !== "absent") {
    print(verdict);
    return 1;
  }
  try {
    unlinkSync(devStackIdentityFilePath(repoRoot));
  } catch {
    // Already absent.
  }
  print(verdict);
  return 0;
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
  throw new UsageError("usage: dev-identity-entry.ts capture <pid> | probe | signal SIGTERM|SIGKILL | clear-absent");
});
