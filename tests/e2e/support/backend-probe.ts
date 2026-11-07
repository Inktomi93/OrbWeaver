// The live specs' environment verdict, read from the production probe. Only an engine that is not there may skip a
// live arm; an answer that says the stack or its row is wrong is a product failure, so it throws.
import type { CredentialHealth } from "@orb/contracts/credentials";

// The credentials domain draws the same line: below this, the server answered and is up.
const HTTP_SERVER_ERROR_MIN = 500;

/** Why the local engine is unavailable, or null when the probe earned an `ok`. */
export function localBackendUnavailableReason(health: CredentialHealth): string | null {
  switch (health.status) {
    case "ok":
      return null;
    case "unreachable":
      if (health.httpStatus !== undefined && health.httpStatus < HTTP_SERVER_ERROR_MIN) {
        throw new Error(`The local engine answered HTTP ${health.httpStatus}, so it is up and the harness connection is wrong: ${health.reason}`);
      }
      return `no local chat backend on this stack: ${health.reason}`;
    case "revoked":
      throw new Error(`The local engine refused the harness connection: ${health.reason}`);
    case "unchecked":
      throw new Error(`The local engine probe reached no verdict: ${health.reason}`);
    // A throttled answer carries no verdict. The keyless harness row never earns one; a keyed row must not skip on it.
    case "throttled":
      throw new Error("The local engine probe was throttled, so availability is unknown");
  }
}
