// SSRF bypass-matrix regression guard (task #55 adversarial re-verify). Exercises the REAL installed global
// dispatcher against the known IP-literal/IPv6/encoding SSRF bypass classes, plus safeFetch's per-hop
// re-validation and the cross-origin credential-header strip. Guards three fixes landed this pass:
//   - `0.0.0.0/8` + IPv6 `::/96` added to DEFAULT_TRUSTED_RANGES (0.0.0.0 / :: routed to loopback on Linux,
//     the IPv4-compatible ::a.b.c.d block embeds an arbitrary IPv4 → all were UN-blocked before).
//   - followRedirects strips Authorization/Cookie the moment a redirect crosses origin (Bearer-key exfil).
// Offline + deterministic: a private literal resolves to itself and is rejected before any socket dial.
//
// ── THE SECOND INPUT (2026-09-20, inference program F12) ─────────────────────────────────────────────────
// The retired admission model auto-allowed three env-declared loopback ENGINE PORTS (and, beside it, whatever
// the single owner row had saved). Both are deleted. The guard now takes ONE deployment-declared set of hosts
// and CIDRs (`AppSettings.privateEndpointAllowlist`, published by the composition root), and that set is the
// only thing that can widen it — so the adversarial question this file now has to answer is not "can an
// attacker reach the engine ports" but:
//     GIVEN one private host is admitted, what ELSE becomes reachable?
// The answer this file pins: nothing. An entry admits its own host (at any port — F12 is host/CIDR-scoped,
// the egress.int.test companion pins that widening) and NOTHING else — not a neighbouring private address,
// not a suffix-confusable name, not the never-admissible link-local class, and above all NOT the
// self-enforcing `safeFetch` path, whose unconditional private-range denial never consults the allowlist.

import {
  __setEgressResolverForTest,
  ANY_HOST,
  EgressBlockedError,
  endpointAdmission,
  installEgressFirewall,
  publishPrivateEndpointAllowlist,
  safeFetch,
  shouldBlockEgress,
} from "@orb/server/infra/network";
import type { Dispatcher } from "undici";
import { getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { afterAll, afterEach, beforeAll, describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

// Capture/restore via undici's PUBLIC accessors — NEVER a hardcoded `Symbol.for("undici.globalDispatcher.N")`.
// undici 8 moved that slot from `.1` to `.2` and kept `.1` as a legacy alias nothing reads, so the old
// symbol-poking restore became a silent no-op that leaked the installed firewall into later tests in the
// same worker. The accessors survive slot renames; the handoff they rest on is guarded by
// dispatcher-contract.suite.int.test.ts. The published allowlist gets the same discipline: every arm
// publishes its own whole set and the teardown publishes EMPTY.
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

// Every private/loopback/link-local/encoded target STILL blocks while the deployment admits nothing — the
// born state of a multi-user install, and the state of a replica that has not published yet (fail-closed).
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

// With loopback ADMITTED, these must still be refused: admitting one private host is not admitting the
// private range. Every one is a DIFFERENT address from the admitted `127.0.0.1` — including the IPv6
// loopback, which is a separate entry an operator must state separately.
const NEIGHBOURS_OF_LOOPBACK: readonly string[] = [
  "http://10.0.0.1/x",
  "http://192.168.1.1/x",
  "http://172.16.0.1/x",
  "http://169.254.169.254/latest/meta-data/",
  "http://[::1]/x",
  "http://[fc00::1]/x",
];

describe("egress firewall — adversarial SSRF bypass matrix (task #55)", () => {
  const original: Dispatcher = getGlobalDispatcher();
  beforeAll(() => {
    installEgressFirewall();
    publishPrivateEndpointAllowlist([]);
  });
  afterEach(() => {
    publishPrivateEndpointAllowlist([]);
  });
  afterAll(() => {
    setGlobalDispatcher(original);
    publishPrivateEndpointAllowlist([]);
  });

  test("every private/loopback/link-local/encoded target is BLOCKED while the deployment admits nothing", async () => {
    const results = await Promise.all(PRIVATE_TARGETS.map(async (url) => [url, await probe(url)] as const));
    const holes = results.filter(([, r]) => r !== "BLOCKED");
    expect(holes).toEqual([]);
  });

  // THE CONTAINMENT PROPERTY — the one an operator's edit is judged against. One admitted host opens that
  // host and nothing else. (The positive half — that the admitted host IS dialled — is the same-invocation
  // control here: if `127.0.0.1:8703` were blocked too, this arm would prove nothing about containment.)
  test("admitting loopback opens loopback ONLY — every neighbouring private address stays BLOCKED", async () => {
    publishPrivateEndpointAllowlist(["127.0.0.1"]);
    expect(await probe("http://127.0.0.1:8703/x")).not.toBe("BLOCKED"); // the control: the entry really took effect
    const results = await Promise.all(NEIGHBOURS_OF_LOOPBACK.map(async (url) => [url, await probe(url)] as const));
    const opened = results.filter(([, r]) => r !== "BLOCKED");
    expect(opened).toEqual([]);
  });

  // Encoding classes against an ADMITTED host: WHATWG URL normalizes decimal/octal/hex/short-form to the
  // same v4 literal, so they are the SAME host and admitting it admits them — stated so the next reader does
  // not mistake it for a hole. The hole would be the reverse (an encoding reaching a host NOT admitted),
  // which is the neighbour matrix above.
  test("an admitted v4 host is the same host however it is encoded (normalization, not a bypass)", async () => {
    publishPrivateEndpointAllowlist(["127.0.0.1"]);
    for (const url of ["http://2130706433:8703/x", "http://0177.0.0.1:8703/x", "http://0x7f000001:8703/x", "http://127.1:8703/x"]) {
      expect(await probe(url), url).not.toBe("BLOCKED");
    }
  });

  // HOST-KEY CONFUSION. The allowlist is an EXACT `Set` lookup, deliberately unlike safeFetch's
  // `allowedHosts`, which supports a leading-dot suffix wildcard. A suffix match here would let anyone who
  // can register `ollama.lan.attacker.example` inherit an operator's LAN admission.
  test("a hostname entry is an EXACT key — no suffix, prefix or subdomain inherits it", () => {
    publishPrivateEndpointAllowlist(["ollama.lan"]);
    expect(endpointAdmission("http://ollama.lan:11434")).toBe("admitted");
    expect(endpointAdmission("http://ollama.lan.attacker.example:11434")).toBe("public"); // judged at the DNS gate, never pre-admitted
    expect(endpointAdmission("http://evil-ollama.lan:11434")).toBe("public");
    expect(endpointAdmission("http://sub.ollama.lan:11434")).toBe("public");
    // Case is folded on BOTH sides (publish lower-cases the entry, the read lower-cases the host), so an
    // operator's capitalisation is not a silently inert entry.
    publishPrivateEndpointAllowlist(["Ollama.LAN"]);
    expect(endpointAdmission("http://OLLAMA.lan:11434")).toBe("admitted");
  });

  // The IPv6 bracket round-trip `unbracket` exists for: `new URL(...).hostname` KEEPS the brackets while
  // undici's connector hands the connect wrapper the bare form. If either side stopped unbracketing, an
  // IPv6 entry could never match its own endpoint and a self-hoster's `::1` box would be silently unreachable.
  test("an IPv6 entry matches its own bracketed endpoint (the unbracket contract, both sides)", async () => {
    publishPrivateEndpointAllowlist(["::1"]);
    expect(endpointAdmission("http://[::1]:8703")).toBe("admitted");
    expect(await probe("http://[::1]:8703/x")).not.toBe("BLOCKED");
    // …and the v4 loopback is a DIFFERENT entry: `::1` does not carry it.
    expect(endpointAdmission("http://127.0.0.1:8703")).toBe("refused");
  });

  // An operator who writes a host:PORT entry gets NOTHING admitted — the entry parses as a hostname key that
  // no host can equal, so it is inert. That is the safe direction (fail-closed), and it is pinned because
  // the model it replaced WAS host:port-scoped: a runbook carried over from it silently admits nothing.
  test("a host:PORT entry is INERT, never a port grant — the fail-closed direction", () => {
    publishPrivateEndpointAllowlist(["127.0.0.1:8703"]);
    expect(endpointAdmission("http://127.0.0.1:8703")).toBe("refused");
  });

  // THE FENCE THAT MATTERS MOST: the allowlist is an input to the GLOBAL backstop only. safeFetch is
  // self-enforcing (D61 B5a / hub-browse H1) and its resolve→validate→pin private-range denial must never
  // consult it — otherwise admitting a LAN host for inference would also open every user-influenced fetch
  // (databank scrapeWeb, plugin bundle installs, provider-returned image URLs) to that host.
  test("the allowlist does NOT widen safeFetch — a user-influenced URL resolving to an ADMITTED host is still refused", async () => {
    publishPrivateEndpointAllowlist(["127.0.0.1", "10.0.0.0/8"]);
    __setEgressResolverForTest(() => Promise.resolve(["127.0.0.1"]));
    const err = await safeFetch("https://user-supplied.test/x", { allowedHosts: ANY_HOST }).catch((e: unknown) => e);
    __setEgressResolverForTest(null);
    expect(err).toBeInstanceOf(EgressBlockedError);
    expect((err as EgressBlockedError).reason).toBe("private-address");
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
