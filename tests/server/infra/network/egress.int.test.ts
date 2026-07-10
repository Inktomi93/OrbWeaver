// The SSRF egress firewall must be INSTALLED (not merely defined) AND actually block the real attack path.
// Regression guard for the s7 HIGH: the installer had zero call sites, so the global undici dispatcher
// stayed Node's default and every outbound fetch ran with NO private-address block. `entry/lifecycle` now
// calls `installEgressFirewall()` at boot. This exercises the installer end-to-end against the REAL global
// dispatcher and proves BOTH gates:
//   - IP-LITERAL targets (169.254.169.254, 127.0.0.1, [::1]) — the exact SSRF vectors in the report; these
//     skip undici's DNS lookup, so the connector-level literal guard is what rejects them.
//   - HOSTNAME targets (localhost) — rejected via the resolving lookup (DNS-rebind guard).
// The rejection is the branch that also fires `securityEvent("egress_blocked")`. Offline + deterministic:
// a literal resolves to itself and a name→loopback resolution needs no network, so nothing is ever dialed.

import { fetchOpenAiModels, installEgressFirewall } from "@orb/server/infra/network";
import { afterAll, beforeAll, describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

// undici stores the process-global dispatcher at this well-known globalThis slot. We can't `import "undici"`
// from the tests package (it's a `packages/server` dep, unresolvable here), so we capture/restore through the
// slot directly — restoring is MANDATORY: leaving the firewall installed would block a sibling integration
// test's real 127.0.0.1 healthz fetch (lifecycle.int.test) if it shares this worker process.
const UNDICI_GLOBAL_DISPATCHER = Symbol.for("undici.globalDispatcher.1");
const globalSlots = globalThis as typeof globalThis & Record<symbol, unknown>;

// Flatten the error → `.cause` chain into one string: undici wraps a connect rejection as a "fetch failed"
// TypeError whose cause carries our SSRF_BLOCKED signal.
function errorChainText(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; depth < 6 && cur !== null && cur !== undefined; depth++) {
    parts.push(cur instanceof Error ? `${cur.name}: ${cur.message}` : String(cur));
    cur = cur instanceof Error ? (cur as { cause?: unknown }).cause : undefined;
  }
  return parts.join(" <- ");
}

describe("installEgressFirewall — boot-installed global SSRF dispatcher (s7 HIGH regression)", () => {
  // Importing `@orb/server/infra/network` above already loaded undici + set its default dispatcher.
  const original = globalSlots[UNDICI_GLOBAL_DISPATCHER];
  beforeAll(() => {
    // EGRESS_FIREWALL defaults to "true" (env floor) exactly as production boot sees it → the installer
    // swaps in the private-IP-rejecting dispatcher.
    installEgressFirewall();
  });
  afterAll(() => {
    globalSlots[UNDICI_GLOBAL_DISPATCHER] = original;
  });

  test("blocks the cloud-metadata link-local LITERAL (169.254.169.254) — the connector gate, never dialed", async () => {
    const err = await fetch("http://169.254.169.254/latest/meta-data/").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(errorChainText(err)).toContain("SSRF_BLOCKED");
  });

  test("blocks a loopback LITERAL (127.0.0.1)", async () => {
    const err = await fetch("http://127.0.0.1/models").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(errorChainText(err)).toContain("SSRF_BLOCKED");
  });

  test("blocks an IPv6 loopback LITERAL ([::1])", async () => {
    const err = await fetch("http://[::1]/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(errorChainText(err)).toContain("SSRF_BLOCKED");
  });

  test("blocks a HOSTNAME that resolves to loopback (localhost) — the DNS-rebind lookup gate", async () => {
    const err = await fetch("http://localhost/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(errorChainText(err)).toContain("SSRF_BLOCKED");
  });

  test("fetchOpenAiModels drops a private-address baseUrl (defense-in-depth: firewall + safeFetch) → []", async () => {
    // The user-supplied `/models` probe (credentials.fetchModels/inspectEndpoint) must never reach an
    // internal endpoint. With the firewall installed, the SSRF connect is rejected; fetchOpenAiModels
    // swallows it and returns [] — no data leaked, no internal port-scan oracle.
    const ids = await fetchOpenAiModels({
      baseUrl: "http://169.254.169.254",
      apiKey: "sk-should-not-leak",
      headers: null,
    });
    expect(ids).toEqual([]);
  });
});
