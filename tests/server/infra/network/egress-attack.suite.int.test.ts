// SSRF bypass-matrix regression guard (task #55 adversarial re-verify). Exercises the REAL installed global
// dispatcher against the known IP-literal/IPv6/encoding SSRF bypass classes, plus safeFetch's per-hop
// re-validation and the cross-origin credential-header strip. Guards three fixes landed this pass:
//   - `0.0.0.0/8` + IPv6 `::/96` added to DEFAULT_TRUSTED_RANGES (0.0.0.0 / :: routed to loopback on Linux,
//     the IPv4-compatible ::a.b.c.d block embeds an arbitrary IPv4 → all were UN-blocked before).
//   - followRedirects strips Authorization/Cookie the moment a redirect crosses origin (Bearer-key exfil).
// Offline + deterministic: a private literal resolves to itself and is rejected before any socket dial.

import { __setEgressResolverForTest, ANY_HOST, installEgressFirewall, safeFetch, shouldBlockEgress } from "@orb/server/infra/network";
import { afterAll, beforeAll, describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const UNDICI_GLOBAL_DISPATCHER = Symbol.for("undici.globalDispatcher.1");
const globalSlots = globalThis as typeof globalThis & Record<symbol, unknown>;
const ABORT_MS = 1500;
const ERR_CHAIN_DEPTH = 8;
const SNIPPET = 80;

function errorChainText(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; depth < ERR_CHAIN_DEPTH && cur !== null && cur !== undefined; depth++) {
    parts.push(cur instanceof Error ? `${cur.name}: ${cur.message}` : String(cur));
    cur = cur instanceof Error ? (cur as { cause?: unknown }).cause : undefined;
  }
  return parts.join(" <- ");
}

// "BLOCKED" iff the SSRF connector rejected it; any other outcome (a socket opened, ECONNREFUSED, a TLS
// handshake) means the firewall let it through — a bypass.
async function probe(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ABORT_MS);
  try {
    await fetch(url, { signal: ctrl.signal });
    return "PASSED:connected";
  } catch (e) {
    const txt = errorChainText(e);
    return txt.includes("SSRF_BLOCKED") ? "BLOCKED" : `PASSED:${txt.slice(0, SNIPPET)}`;
  } finally {
    clearTimeout(timer);
  }
}

// Every private/loopback/link-local/encoded target on a NON-configured port (port 80 here) STILL blocks.
// The internal-backend allowlist is host:PORT-scoped (least-privilege): the 127.0.0.1 encodings below hit
// the loopback HOST but NOT a configured backend PORT, so they remain SSRF-blocked — the encoded-127
// bypass classes gain nothing. (The exact configured backend host:ports are proved allowed separately.)
const PRIVATE_TARGETS: readonly string[] = [
  "http://127.0.0.1/x", // loopback host, port 80 — NOT a configured backend port
  "http://169.254.169.254/latest/meta-data/",
  "http://10.0.0.1/x",
  "http://192.168.1.1/x",
  "http://172.16.0.1/x",
  "http://100.64.0.1/x",
  "http://2130706433/x", // decimal 127.0.0.1 (WHATWG URL normalizes before undici)
  "http://0177.0.0.1/x", // octal
  "http://0x7f000001/x", // hex
  "http://127.1/x", // short form
  "http://0.0.0.0/x", // all-zeros → loopback on Linux
  "http://[::1]/x",
  "http://[::ffff:127.0.0.1]/x", // IPv4-mapped
  "http://[::ffff:a9fe:a9fe]/x", // IPv4-mapped link-local metadata
  "http://[fe80::1]/x", // link-local
  "http://[fc00::1]/x", // ULA
  "http://[0:0:0:0:0:0:0:1]/x", // uncompressed loopback
  "http://[::]/x", // unspecified → loopback on Linux
  "http://[::ffff:0.0.0.0]/x",
  "http://[::127.0.0.1]/x", // deprecated IPv4-compatible
  "http://localhost/x", // hostname → DNS-rebind lookup gate, port 80 not a configured backend
];

// The box's OWN configured backends, host:PORT-scoped: the vLLM engines (127.0.0.1:8701/8702/8703) are
// allowed at EXACTLY those host:ports (declared internal intent). An allowed target with nothing listening
// yields a plain connect failure (ECONNREFUSED/timeout), NOT our SSRF_BLOCKED signal. This does NOT weaken
// the safeFetch path — its unconditional private-range denial never consults this allowlist.
const AUTO_ALLOWED_BACKENDS: readonly string[] = [
  "http://127.0.0.1:8701/x", // vLLM embed engine
  "http://127.0.0.1:8702/x", // vLLM rerank engine
  "http://127.0.0.1:8703/x", // vLLM gen engine
];

describe("egress firewall — adversarial SSRF bypass matrix (task #55)", () => {
  const original = globalSlots[UNDICI_GLOBAL_DISPATCHER];
  beforeAll(() => {
    installEgressFirewall();
  });
  afterAll(() => {
    globalSlots[UNDICI_GLOBAL_DISPATCHER] = original;
  });

  test("every private/loopback/link-local/encoded target on a non-configured port is BLOCKED", async () => {
    const results = await Promise.all(PRIVATE_TARGETS.map(async (url) => [url, await probe(url)] as const));
    const holes = results.filter(([, r]) => r !== "BLOCKED");
    expect(holes).toEqual([]);
  });

  test("the exact configured backend host:ports (vLLM 8701/8702/8703) are ALLOWED, not SSRF-blocked", async () => {
    // Each connect is ATTEMPTED (probe returns "PASSED:..." on any non-SSRF outcome incl. ECONNREFUSED) —
    // proving the firewall let the declared internal backend through rather than rejecting it. Least-privilege:
    // the SAME loopback host on port 80 (in PRIVATE_TARGETS above) is still BLOCKED — only these ports pass.
    const results = await Promise.all(AUTO_ALLOWED_BACKENDS.map(async (url) => [url, await probe(url)] as const));
    const wrongly = results.filter(([, r]) => r === "BLOCKED");
    expect(wrongly).toEqual([]);
  });

  test("redirect to a private-RESOLVING host is blocked at the re-dispatched hop (H1 per-hop re-validation)", async () => {
    // hop0 resolves public; the redirect target resolves loopback — safeFetch's OWN resolve→validate on the
    // new hop rejects it (independent of the global firewall). The private hop is never dialed.
    __setEgressResolverForTest((host) => Promise.resolve(host === "internal.test" ? ["127.0.0.1"] : ["93.184.216.34"]));
    const calls: string[] = [];
    vi.stubGlobal("fetch", (u: URL | string) => {
      const url = String(u);
      calls.push(url);
      return url.startsWith("https://public.test")
        ? Promise.resolve(Response.redirect("https://internal.test/x", 302))
        : Promise.resolve(new Response("{}", { status: 200 }));
    });
    await expect(safeFetch("https://public.test/models", { allowedHosts: ANY_HOST })).rejects.toMatchObject({ reason: "private-address" });
    expect(calls).toEqual(["https://public.test/models"]); // hop1 refused before dial
    __setEgressResolverForTest(null);
    vi.unstubAllGlobals();
  });

  test("credential headers are STRIPPED on a cross-origin redirect (Bearer-key exfil defense)", async () => {
    __setEgressResolverForTest(() => Promise.resolve(["93.184.216.34"]));
    const sent: Record<string, string>[] = [];
    vi.stubGlobal("fetch", (u: URL | string, init?: RequestInit) => {
      sent.push({ ...(init?.headers as Record<string, string>) });
      return String(u) === "https://benign.test/models"
        ? Promise.resolve(Response.redirect("https://attacker.test/collect", 302))
        : Promise.resolve(new Response("{}", { status: 200 }));
    });
    await safeFetch("https://benign.test/models", {
      allowedHosts: ANY_HOST,
      headers: { authorization: "Bearer sk-secret", "x-custom": "keep" },
    });
    __setEgressResolverForTest(null);
    vi.unstubAllGlobals();
    expect(sent[0]?.["authorization"]).toBe("Bearer sk-secret"); // hop0: user's own configured origin
    expect(sent[1]?.["authorization"]).toBeUndefined(); // hop1: attacker origin → stripped
    expect(sent[1]?.["x-custom"]).toBe("keep"); // non-credential headers still forwarded
  });

  test("pure decision: public + allowlisted-private addresses are NOT blocked (no false-positive brick)", () => {
    const ranges = [
      "0.0.0.0/8",
      "127.0.0.0/8",
      "10.0.0.0/8",
      "172.16.0.0/12",
      "192.168.0.0/16",
      "100.64.0.0/10",
      "169.254.0.0/16",
      "::/96",
      "::1/128",
      "fc00::/7",
      "fe80::/10",
    ];
    const empty = new Set<string>();
    expect(shouldBlockEgress("104.18.0.1", "openrouter.ai", empty, ranges)).toBe(false);
    expect(shouldBlockEgress("1.1.1.1", "one.one.one.one", empty, ranges)).toBe(false);
    expect(shouldBlockEgress("2606:4700::1", "cloudflare.com", empty, ranges)).toBe(false);
    const allow = new Set(["idp.internal"]);
    expect(shouldBlockEgress("10.1.2.3", "idp.internal", allow, ranges)).toBe(false);
    expect(shouldBlockEgress("10.1.2.3", "evil.example", allow, ranges)).toBe(true);
  });
});
