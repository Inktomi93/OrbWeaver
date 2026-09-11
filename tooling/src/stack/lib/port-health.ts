import { budget } from "@orb/tooling/_shared/load-budget";
import type { PortHealth } from "../contract/types.ts";

// A CEILING, load-scaled through the one policy (#1232): the literal is the QUIET-BOX base.
const HEALTH_PROBE_TIMEOUT_MS_BASE = 2000;
const HEALTH_PROBE_TIMEOUT_MS = budget(HEALTH_PROBE_TIMEOUT_MS_BASE);

function errorCode(error: unknown): unknown {
  if (typeof error !== "object" || error === null) {
    return;
  }
  const cause = "cause" in error ? error.cause : undefined;
  if (typeof cause === "object" && cause !== null && "code" in cause) {
    return cause.code;
  }
  return "code" in error ? error.code : undefined;
}

export async function probePortHealth(port: number, request: typeof fetch = fetch): Promise<PortHealth> {
  // @orb-waive caught-failure-ownership(error): connection refusal is the only absent verdict; every other rejection becomes an unproven result that launchOneEngine refuses before headroom or spawn. Ends if unproven can authorize launch.
  try {
    const response = await request(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS) });
    return response.ok ? { kind: "healthy" } : { kind: "unproven", reason: `health endpoint answered ${response.status}` };
  } catch (error) {
    if (errorCode(error) === "ECONNREFUSED") {
      return { kind: "absent" };
    }
    return { kind: "unproven", reason: error instanceof Error ? error.message : String(error) };
  }
}
