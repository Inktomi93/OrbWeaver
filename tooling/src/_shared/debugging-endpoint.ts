// The ephemeral Chromium DEBUGGING ENDPOINT — ONE home for the launch shape a stateful session, the
// DevTools-SDK cascade runtime and an attaching sibling all share: a persistent profile launched with
// `--remote-debugging-port=0`, whose OS-assigned port Chrome publishes in `<profile>/DevToolsActivePort`
// only after it binds. The launch itself stays in ./browser.ts (gate `tooling-shared-plumbing` arm B) and
// the attach stays there too (arm H); this module owns the profile-dir lifecycle and the port READ.
// ./devtools-runtime.ts carried a private copy of the reader until #1231 promoted it here.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export const REMOTE_DEBUGGING_PORT_ARG = "--remote-debugging-port=0";
const DEBUG_PORT_ATTEMPTS = 200;
const DEBUG_PORT_RETRY_MS = 25;
const ACTIVE_PORT_FILE = "DevToolsActivePort";

export interface DebuggingProfile {
  readonly profileDir: string;
  /** The launch args that make Chrome publish its endpoint — handed to `launchProbeSession` verbatim. */
  readonly browserArgs: readonly string[];
  readonly close: () => Promise<void>;
}

/** A throwaway profile dir whose browser publishes an ephemeral debugging port. Closed after the browser
 *  (a `ProbeSession.cleanup` entry) — the dir holds Chrome's own state and nothing a run reads. */
export async function createDebuggingProfile(): Promise<DebuggingProfile> {
  const profileDir = await mkdtemp(join(tmpdir(), "orb-debug-profile-"));
  return {
    profileDir,
    browserArgs: [REMOTE_DEBUGGING_PORT_ARG],
    close: async (): Promise<void> => {
      await rm(profileDir, { recursive: true, force: true });
    },
  };
}

/** Chrome publishes its OS-assigned debugging port only after it binds — poll for it, bounded, and THROW
 *  when the budget expires: an endpoint nobody can read is a launch failure, never a comfortable null. */
export async function readDebuggingPort(profileDir: string): Promise<number> {
  const file = join(profileDir, ACTIVE_PORT_FILE);
  for (let attempt = 0; attempt < DEBUG_PORT_ATTEMPTS; attempt += 1) {
    // @orb-waive caught-failure-ownership(catch): the file exists only after Chrome binds its ephemeral endpoint; the bounded loop owns the race and throws below when its budget expires. Ends if exhaustion stops throwing.
    try {
      const [line] = (await readFile(file, "utf8")).split("\n");
      const port = Number(line);
      if (Number.isInteger(port) && port > 0) {
        return port;
      }
    } catch {
      // not published yet
    }
    await sleep(DEBUG_PORT_RETRY_MS);
  }
  throw new Error(`Chrome did not publish ${ACTIVE_PORT_FILE} under ${profileDir}`);
}

export function debuggingEndpointUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

/** The `http://127.0.0.1:<port>` endpoint `attachProbeSession` / `connectOverCDP` take. */
export async function readDebuggingEndpoint(profileDir: string): Promise<string> {
  return debuggingEndpointUrl(await readDebuggingPort(profileDir));
}
