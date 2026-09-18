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

import process from "node:process";
import { fetchOpenAiModels, installEgressFirewall } from "@orb/server/infra/network";
import type { Dispatcher } from "undici";
import { getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { afterAll, beforeAll, describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

// Capture/restore the process-global dispatcher through undici's PUBLIC accessors. Restoring is MANDATORY:
// leaving the firewall installed would block a sibling integration test's real 127.0.0.1 healthz fetch
// (lifecycle.int.test) if it shares this worker process.
//   This used to poke `Symbol.for("undici.globalDispatcher.1")` directly, because undici was a
//   `packages/server` dep and pnpm-strict made it unresolvable from tests/. `undici` is now mirrored into
//   root devDependencies (the house pattern — cf. jose/hono/fflate/sharp) precisely so this file can use the
//   real API. That matters: undici 8 MOVED the slot to `.2` and left `.1` behind as a legacy alias nothing
//   reads, so the old symbol-poking restore silently became a no-op and leaked the firewall into every
//   later test in the worker. Never hardcode the slot; the accessors are the contract.
//   (The handoff those accessors depend on is itself guarded by dispatcher-contract.suite.int.test.ts.)

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
  const original: Dispatcher = getGlobalDispatcher();
  beforeAll(() => {
    // EGRESS_FIREWALL defaults to "true" (env floor) exactly as production boot sees it → the installer
    // swaps in the private-IP-rejecting dispatcher.
    installEgressFirewall();
  });
  afterAll(() => {
    setGlobalDispatcher(original);
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

// ── VLLM_ENGINE_HOST relocation: the internal-backend bypass FOLLOWS the declared engine host ────────────
// Profile-2/D2 (docs/design/containerize-prod-image-spec.md §3.6): a slim app container points at an
// EXTERNAL vLLM via VLLM_ENGINE_HOST; the egress private-range block must open for exactly
// `<that host>:<the three engine ports>` — declared operator intent, the same class as the OIDC-issuer
// auto-allow — and CLOSE for the loopback default it replaced (the set READS env, it never accumulates).
// The env floor is frozen at module load, so this drives a FRESH module registry with a crafted
// process.env (the tests/server/foundation/env/index.test.ts reimport pattern). 127.0.0.2 is used as the
// relocated host: still local (a connect attempt fails FAST as ECONNREFUSED, never a slow dial-out), but
// NEVER where the engines actually bind (they bind 127.0.0.1 — build-argv LOOPBACK_HOST), so nothing can
// be listening and the pass/block verdicts stay deterministic on a box with a live fleet.
describe("installEgressFirewall — VLLM_ENGINE_HOST relocates the internal-backend bypass", () => {
  let snapshot: Record<string, string | undefined>;
  let original: Dispatcher;

  // biome-ignore-start lint/style/noProcessEnv: the VLLM_ENGINE_HOST describe DRIVES the sole env reader by crafting process.env (the reimport pattern from tests/server/foundation/env/index.test.ts).
  beforeAll(async () => {
    snapshot = { ...process.env };
    for (const k of Object.keys(process.env)) {
      delete process.env[k];
    }
    process.env["VITEST"] = "1";
    process.env["ORB_ENV_NO_FILE"] = "1";
    // NO AUTH_FALLBACK pin: #2406 made it resolve per mode, so a wiped env boots at single-user + owner.
    // (Between #1864 and #2406 this floor had to state it or the re-import threw before any egress code ran.)
    process.env["VLLM_ENGINE_HOST"] = "127.0.0.2";
    vi.resetModules();
    const freshNetwork = await import("@orb/server/infra/network");
    original = getGlobalDispatcher();
    freshNetwork.installEgressFirewall();
  });
  // biome-ignore-end lint/style/noProcessEnv: end of the block above

  // biome-ignore-start lint/style/noProcessEnv: the VLLM_ENGINE_HOST describe DRIVES the sole env reader by crafting process.env (the reimport pattern from tests/server/foundation/env/index.test.ts).
  afterAll(() => {
    setGlobalDispatcher(original);
    for (const k of Object.keys(process.env)) {
      delete process.env[k];
    }
    Object.assign(process.env, snapshot);
    vi.resetModules();
  });
  // biome-ignore-end lint/style/noProcessEnv: end of the block above

  test("the relocated host's exact engine ports pass — connect attempted (ECONNREFUSED), not SSRF-blocked", async () => {
    const results = await Promise.all(
      [8701, 8702, 8703].map(async (port) => [port, errorChainText(await fetch(`http://127.0.0.2:${port}/models`).catch((e: unknown) => e))] as const),
    );
    for (const [port, txt] of results) {
      expect(txt, `127.0.0.2:${port}`).not.toContain("SSRF_BLOCKED");
    }
  });

  test("a NON-configured port on the relocated host stays SSRF-blocked (port-scoping survives relocation)", async () => {
    const err = await fetch("http://127.0.0.2:9998/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(errorChainText(err)).toContain("SSRF_BLOCKED");
  });

  test("the DISPLACED loopback default is no longer bypassed — the set reads env, it never accumulates", async () => {
    const err = await fetch("http://127.0.0.1:8701/models").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(errorChainText(err)).toContain("SSRF_BLOCKED");
  });
});
