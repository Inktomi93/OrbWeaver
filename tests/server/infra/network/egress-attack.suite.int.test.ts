// SSRF bypass-matrix regression guard (task #55 adversarial re-verify). Exercises the REAL installed global
// dispatcher against the known IP-literal/IPv6/encoding SSRF bypass classes, plus safeFetch's per-hop
// re-validation and the cross-origin credential-header strip. Guards three fixes landed this pass:
//   - `0.0.0.0/8` + IPv6 `::/96` added to DEFAULT_TRUSTED_RANGES (0.0.0.0 / :: routed to loopback on Linux,
//     the IPv4-compatible ::a.b.c.d block embeds an arbitrary IPv4 → all were UN-blocked before).
//   - followRedirects strips Authorization/Cookie the moment a redirect crosses origin (Bearer-key exfil).
// Offline + deterministic: a private literal resolves to itself and is rejected before any socket dial.

import { installEgressFirewall, safeFetch, shouldBlockEgress } from "@orb/server/infra/network";
import { afterAll, beforeAll, describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures";

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

const PRIVATE_TARGETS: readonly string[] = [
  "http://127.0.0.1/x",
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
  "http://localhost/x", // hostname → DNS-rebind lookup gate
];

describe("egress firewall — adversarial SSRF bypass matrix (task #55)", () => {
  const original = globalSlots[UNDICI_GLOBAL_DISPATCHER];
  beforeAll(() => {
    installEgressFirewall();
  });
  afterAll(() => {
    globalSlots[UNDICI_GLOBAL_DISPATCHER] = original;
  });

  test("every private/loopback/link-local/encoded target is BLOCKED", async () => {
    const results = await Promise.all(PRIVATE_TARGETS.map(async (url) => [url, await probe(url)] as const));
    const holes = results.filter(([, r]) => r !== "BLOCKED");
    expect(holes).toEqual([]);
  });

  test("redirect to a private literal is blocked at the re-dispatched hop (per-hop re-validation)", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", (u: URL | string) => {
      const url = String(u);
      calls.push(url);
      if (url === "http://public.test/models") {
        return Promise.resolve(Response.redirect("http://127.0.0.1/x", 302));
      }
      // hop1 reaches the connector — the matrix above proves the real dispatcher rejects 127.0.0.1.
      return Promise.reject(new Error("SSRF_BLOCKED: 127.0.0.1 → 127.0.0.1"));
    });
    await expect(safeFetch("http://public.test/models")).rejects.toThrow("SSRF_BLOCKED");
    expect(calls).toEqual(["http://public.test/models", "http://127.0.0.1/x"]);
    vi.unstubAllGlobals();
  });

  test("credential headers are STRIPPED on a cross-origin redirect (Bearer-key exfil defense)", async () => {
    const sent: Record<string, string>[] = [];
    vi.stubGlobal("fetch", (u: URL | string, init?: RequestInit) => {
      sent.push({ ...(init?.headers as Record<string, string>) });
      return String(u) === "https://benign.test/models"
        ? Promise.resolve(Response.redirect("https://attacker.test/collect", 302))
        : Promise.resolve(new Response("{}", { status: 200 }));
    });
    await safeFetch("https://benign.test/models", {
      headers: { authorization: "Bearer sk-secret", "x-custom": "keep" },
    });
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
