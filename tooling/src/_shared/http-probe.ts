// The HTTP liveness probes: an async `fetch` for supervisors, and a synchronous twin for the synchronous
// stage paths, where the request runs in a short-lived node child and its exit code is the answer.
import process from "node:process";
import { budget } from "./load-budget.ts";
import { runNicedSync } from "./proc.ts";

/** The env keys the probe child reads; spelled once, so the script and its launcher cannot drift. */
const PROBE_URL_ENV = "ORB_HTTP_PROBE_URL";
const PROBE_TIMEOUT_ENV = "ORB_HTTP_PROBE_TIMEOUT_MS";
/** The quiet-box request ceiling; load-scaled through the one policy. */
const PROBE_TIMEOUT_BASE_MS = 2000;
/** Headroom for the child to start and exit around the request itself. */
const CHILD_OVERHEAD_MS = 5000;

/** Does `url` answer a 2xx within the load-scaled budget? Any failure to answer is `false`. */
export async function httpOk(url: string): Promise<boolean> {
  // @orb-waive caught-failure-ownership(catch): a refused connection, a timeout and a non-2xx are all "not answering" to a liveness probe, which every caller reads as "not up yet", never as a verdict about the thing probed. Ends if a caller distinguishes the failure kinds.
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

/** Does `url` answer a 2xx within the load-scaled budget? Any failure to answer is `false`. */
export function httpOkSync(url: string): boolean {
  const timeoutMs = budget(PROBE_TIMEOUT_BASE_MS);
  const env: NodeJS.ProcessEnv = {
    // biome-ignore lint/style/noProcessEnv: the probe child inherits PATH and the rest of the ambient environment; only the two protocol keys are added, and neither is app configuration.
    ...process.env,
    [PROBE_URL_ENV]: url,
    [PROBE_TIMEOUT_ENV]: String(timeoutMs),
  };
  return (
    runNicedSync(process.execPath, ["--input-type=module", "-e", PROBE_SCRIPT], { env, timeout: timeoutMs + CHILD_OVERHEAD_MS, stdio: "ignore" }).status === 0
  );
}
