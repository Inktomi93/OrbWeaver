// The SSRF egress firewall must be INSTALLED (not merely defined) AND actually block the real attack path.
// Regression guard for the s7 HIGH: the installer had zero call sites, so the global undici dispatcher
// stayed Node's default and every outbound fetch ran with NO private-address block. `entry/lifecycle` now
// calls `installEgressFirewall()` at boot. This exercises the installer end-to-end against the REAL global
// dispatcher and proves BOTH gates:
//   - IP-LITERAL targets (169.254.169.254, [::1]) — the exact SSRF vectors in the report; these
//     skip undici's DNS lookup, so the connector-level literal guard is what rejects them.
// The rejection is the branch that also fires `securityEvent("egress_blocked")`. Offline + deterministic:
// a literal resolves to itself, so nothing is ever dialed.
//
// INTERNAL-BACKEND AUTO-ALLOW (PORT-SCOPED): the box's own backends are auto-allowlisted by
// installEgressFirewall at their EXACT host:port — vLLM engines 127.0.0.1:8701/8702/8703, declared internal
// intent like the OIDC issuer. Those are proved
// NOT-SSRF-blocked below: an allowed loopback target with nothing listening yields a plain connection error
// (ECONNREFUSED), NOT our SSRF_BLOCKED signal. Least-privilege: a NON-configured loopback port (e.g.
// 127.0.0.1:22) stays BLOCKED. This does not touch the safeFetch path, whose unconditional private-range
// denial never consults the allowlist.

import { fetchOpenAiModels, installEgressFirewall } from "@orb/server/infra/network";
import { afterAll, beforeAll, describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

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

  test("still blocks an IPv6 loopback LITERAL ([::1]) — NOT an internal backend, stays SSRF-blocked", async () => {
    const err = await fetch("http://[::1]/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(errorChainText(err)).toContain("SSRF_BLOCKED");
  });

  // The box's OWN vLLM engines are hardcoded http://127.0.0.1:<VLLM_*_PORT> (engine/client.ts) — port-scoped
  // allowlisted so the server's own inference isn't SSRF-blocked. Proof: the connect is ATTEMPTED (nothing
  // listens on this port in the test worker → ECONNREFUSED/timeout), so the failure is NOT our SSRF_BLOCKED
  // signal. The env defaults are 8701/8702/8703 (foundation/env floor, as the runner sees them).
  test("auto-allows the exact vLLM backend host:ports (127.0.0.1:8701/8702/8703) — connect attempted, not SSRF-blocked", async () => {
    const results = await Promise.all(
      [8701, 8702, 8703].map(async (port) => [port, errorChainText(await fetch(`http://127.0.0.1:${port}/models`).catch((e: unknown) => e))] as const),
    );
    for (const [port, txt] of results) {
      expect(txt, `127.0.0.1:${port}`).not.toContain("SSRF_BLOCKED");
    }
  });

  // LEAST-PRIVILEGE: a NON-configured loopback port stays SSRF-blocked even though the HOST is 127.0.0.1.
  // This is the whole point of port-scoping — the firewall is not a blanket loopback pass. (Port 9998 is a
  // normal high port — NOT one of Node/undici's "bad port" set, which fetch rejects before the connector.)
  test("still blocks a NON-configured loopback port (127.0.0.1:9998) — least-privilege, host alone is not enough", async () => {
    const err = await fetch("http://127.0.0.1:9998/x").catch((e: unknown) => e);
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
