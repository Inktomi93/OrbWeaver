// The HTTP liveness probes: an async `fetch` for supervisors, and a synchronous twin for the synchronous
// stage paths, where the request runs in a short-lived node child and its exit code is the answer.
import process from "node:process";
import { budget } from "../host/load-budget.ts";
import { runNicedSync } from "../process/proc.ts";
import { inheritedProcessEnv } from "../process/process-env.ts";

/** The env keys the probe child reads; spelled once, so the script and its launcher cannot drift. */
const PROBE_URL_ENV = "ORB_HTTP_PROBE_URL";
const PROBE_TIMEOUT_ENV = "ORB_HTTP_PROBE_TIMEOUT_MS";
/** The quiet-box request ceiling; load-scaled through the one policy. */
const PROBE_TIMEOUT_BASE_MS = 2000;
/** Headroom for the child to start and exit around the request itself. */
const CHILD_OVERHEAD_MS = 5000;

/** Does `url` answer a 2xx within the load-scaled budget? Any failure to answer is `false`. */
export async function httpOk(url: string): Promise<boolean> {
  // a refused connection, a timeout and a non-2xx all answer false, and each caller states what false means: dev-status prints "healthz unreachable" and runDevChildren warns when the server never answered /healthz. Ends if a caller needs the failure kind.
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(budget(PROBE_TIMEOUT_BASE_MS)) })).ok;
  } catch {
    return false;
  }
}

const PROBE_SCRIPT = [
  `const url = process.env[${JSON.stringify(PROBE_URL_ENV)}];`,
  `const timeout = Number(process.env[${JSON.stringify(PROBE_TIMEOUT_ENV)}]);`,
  "const res = await fetch(url, { signal: AbortSignal.timeout(timeout) }).catch(() => null);",
  "process.exitCode = res !== null && res.ok ? 0 : 1;",
].join("\n");

const BODY_SCRIPT = [
  `const url = process.env[${JSON.stringify(PROBE_URL_ENV)}];`,
  `const timeout = Number(process.env[${JSON.stringify(PROBE_TIMEOUT_ENV)}]);`,
  "const res = await fetch(url, { signal: AbortSignal.timeout(timeout) }).catch(() => null);",
  "if (res !== null && res.ok) { process.stdout.write(await res.text()); }",
  "process.exitCode = res !== null && res.ok ? 0 : 1;",
].join("\n");

function probeChild(url: string, script: string, stdio: "ignore" | "collect"): { readonly ok: boolean; readonly stdout: string } {
  const timeoutMs = budget(PROBE_TIMEOUT_BASE_MS);
  const env = inheritedProcessEnv({ [PROBE_URL_ENV]: url, [PROBE_TIMEOUT_ENV]: String(timeoutMs) });
  const res = runNicedSync(process.execPath, ["--input-type=module", "-e", script], { env, timeout: timeoutMs + CHILD_OVERHEAD_MS, stdio });
  return { ok: res.status === 0, stdout: res.stdout };
}

/** Does `url` answer a 2xx within the load-scaled budget? Any failure to answer is `false`. */
export function httpOkSync(url: string): boolean {
  return probeChild(url, PROBE_SCRIPT, "ignore").ok;
}

/** The JSON body a 2xx answer carried, or null: no answer, a non-2xx, or a body that is not JSON. */
export function httpJsonSync(url: string): unknown {
  const res = probeChild(url, BODY_SCRIPT, "collect");
  if (!res.ok) {
    return null;
  }
  // a 2xx body that is not JSON answers null, and its one caller fixtureStatus turns null into config === null, so fixtureVerdict returns { up: false, reason } naming /api/auth/config as unreachable. Ends if a second caller reads null as anything but a refusal.
  try {
    return JSON.parse(res.stdout);
  } catch {
    return null;
  }
}
