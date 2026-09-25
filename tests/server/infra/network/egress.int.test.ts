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
// ── THE F12 DEPLOYMENT ALLOWLIST (rewritten 2026-09-20, inference program §14 fork F12) ──────────────────
// What this file pinned until today was the RETIRED admission model: an env-declared internal-backend bypass
// (`internalBackendHostPorts`, keyed on `VLLM_ENGINE_HOST` + the three engine ports) and, beside it, an
// owner-ROW derivation that published whatever endpoints the single `users.role='owner'` row had saved. Both
// were a one-box premise — they assumed one privileged human whose LAN is the LAN — and both are DELETED.
// There is no vLLM-named code path, no `VLLM_*` key in the server schema, and no principal anywhere near the
// guard.
//
// The replacement is ONE deployment setting, `AppSettings.privateEndpointAllowlist` (env floor
// `PRIVATE_ENDPOINT_ALLOWLIST`, DB override wins), published onto this guard at boot and after every
// Governance write (`entry/compose/services.ts`). A private/loopback/link-local target is admitted IFF its
// host — or its literal/resolved ADDRESS, for a CIDR entry — is in that set; a public target rides the
// unchanged SSRF guard. THREE properties this file owes, because each is a way the model can silently rot:
//   1. It is per-DEPLOYMENT, never per-principal. `endpointAdmission(baseUrl)` and the connector take a URL
//      and nothing else — there is no seam an "…unless they are the owner" branch could hide in. The
//      owner-vs-member half is proven where principals EXIST, at the write seam that calls this:
//      tests/server/domain/connection/verbs/connections.int.test.ts ("per-DEPLOYMENT, not per-principal").
//   2. It is HOST/CIDR-scoped by default and OPTIONALLY host:PORT-scoped (the port arm, 2026-09-20). A
//      BARE entry (`127.0.0.1`, `ollama.lan`, `192.168.1.0/24`) admits its subject at EVERY port —
//      unchanged, and pinned below so the next person to edit the allowlist meets that widening as a
//      stated fact. An entry MAY instead carry a port (`127.0.0.1:8703`, `[::1]:8703`, `ollama.lan:11434`)
//      and then that host is admitted at those ports and NO other. Precedence is stated, not emergent:
//      the NARROWER spelling is the host's last word — listing `127.0.0.1` beside `127.0.0.1:8703` admits
//      :8703 only. A port on a CIDR is REFUSED (the DNS gate that consults ranges is port-blind).
//   3. Nothing the operator can spell reaches link-local/multicast/6to4/Teredo (`NEVER_ADMISSIBLE_RANGES`),
//      enforced twice — on the literal at publish, and on the RESOLVED address at the DNS gate.
// The safeFetch path is untouched by all of it: its unconditional private-range denial never consults the
// allowlist (the `ownerConfiguredEndpoint` class is the one named opt-out, compose-bound, not caller-suppliable).

import type { LookupFunction } from "node:net";
import process from "node:process";
import {
  __firewallConnectForTest,
  __setFirewallLookupForTest,
  endpointAdmission,
  installEgressFirewall,
  publishPrivateEndpointAllowlist,
} from "@orb/server/infra/network";
import type { Dispatcher } from "undici";
import { getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { afterAll, afterEach, beforeAll, beforeEach, describe, vi } from "vitest";
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
//
// The PUBLISHED ALLOWLIST is module state and needs the same discipline: every arm republishes the whole
// set (that IS the production contract — a removed entry closes by its ABSENCE from the next publish) and
// the teardown publishes EMPTY, so no arm can widen a sibling suite's guard.

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

/** "BLOCKED" iff OUR connector rejected the dial; "attempted" for any other outcome (ECONNREFUSED on an
 *  admitted-but-dead port is the normal one) — i.e. the firewall let it through. Nothing is ever dialed for
 *  a blocked target: the refusal happens before the socket. */
async function dialVerdict(url: string): Promise<"BLOCKED" | "attempted"> {
  const err: unknown = await fetch(url).then(
    () => null,
    (e: unknown) => e,
  );
  return errorChainText(err).includes("SSRF_BLOCKED") ? "BLOCKED" : "attempted";
}

/** A firewall lookup that answers every name with `address`, in both shapes node's lookup callback takes. */
function answering(address: string): LookupFunction {
  const family = address.includes(":") ? 6 : 4;
  return (_hostname, options, callback): void => {
    if (options.all === true) {
      callback(null, [{ address, family }]);
      return;
    }
    callback(null, address, family);
  };
}

describe("installEgressFirewall — boot-installed global SSRF dispatcher (s7 HIGH regression)", () => {
  // Importing `@orb/server/infra/network` above already loaded undici + set its default dispatcher.
  const original: Dispatcher = getGlobalDispatcher();
  beforeAll(() => {
    // EGRESS_FIREWALL defaults to "true" (env floor) exactly as production boot sees it → the installer
    // swaps in the private-IP-rejecting dispatcher. The allowlist is published EMPTY: that is a fresh
    // MULTI-USER install's born value, and it is also what a replica that has not published yet holds —
    // the guard fails CLOSED, admitting nothing.
    installEgressFirewall();
    publishPrivateEndpointAllowlist([]);
  });
  afterAll(() => {
    setGlobalDispatcher(original);
    publishPrivateEndpointAllowlist([]);
  });

  test("blocks the cloud-metadata link-local LITERAL (169.254.169.254) — the connector gate, never dialed", async () => {
    const err = await fetch("http://169.254.169.254/latest/meta-data/").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(errorChainText(err)).toContain("SSRF_BLOCKED");
  });

  test("still blocks an IPv6 loopback LITERAL ([::1]) while the allowlist is empty", async () => {
    const err = await fetch("http://[::1]/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(errorChainText(err)).toContain("SSRF_BLOCKED");
  });

  // The F12 receipt an empty set owes, and the one the retired model got WRONG: with nothing admitted, the
  // box's own loopback backend is refused like any other private target. Under the deleted rules this exact
  // URL was auto-allowed — by the env-declared engine ports, or by the owner having saved it — which is the
  // whole reason both were retired. There is no principal in the call, and none in `endpointAdmission`'s
  // signature: an owner asking is byte-identical to a member asking.
  test("a fresh MULTI-USER install (born EMPTY) refuses the box's own loopback backend — no principal is consulted", async () => {
    expect(endpointAdmission("http://127.0.0.1:8703")).toBe("refused");
    expect(await dialVerdict("http://127.0.0.1:8703/v1/models")).toBe("BLOCKED");
  });

  test("still blocks an arbitrary loopback port (127.0.0.1:9998) — an empty set admits nothing", async () => {
    // Port 9998 is a normal high port — NOT one of Node/undici's "bad port" set, which fetch rejects before
    // the connector, so the refusal under test really is ours.
    const err = await fetch("http://127.0.0.1:9998/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(errorChainText(err)).toContain("SSRF_BLOCKED");
  });
});

// ── The admission itself: what a published set does, and what it can never do ────────────────────────────
// Every arm publishes its own WHOLE set (production's contract) and the teardown publishes empty. The dial
// assertions use a loopback host with nothing listening, so an admitted target fails ECONNREFUSED — which is
// exactly the evidence wanted: the connect was ATTEMPTED rather than refused by us.
describe("publishPrivateEndpointAllowlist — the deployment's private-endpoint admission (F12)", () => {
  const original: Dispatcher = getGlobalDispatcher();
  beforeAll(() => {
    installEgressFirewall();
  });
  afterEach(() => {
    publishPrivateEndpointAllowlist([]);
    __setFirewallLookupForTest(null);
  });
  afterAll(() => {
    setGlobalDispatcher(original);
    publishPrivateEndpointAllowlist([]);
  });

  test("an ADMITTED loopback endpoint is dialled, not SSRF-blocked — for whoever asks", async () => {
    publishPrivateEndpointAllowlist(["127.0.0.1"]);
    expect(endpointAdmission("http://127.0.0.1:8703")).toBe("admitted");
    expect(await dialVerdict("http://127.0.0.1:8703/v1/models")).toBe("attempted");
  });

  // THE WIDENING A BARE ENTRY BUYS, stated rather than discovered, and the BACKWARD-COMPATIBILITY pin for
  // the port arm: a bare host/CIDR entry still admits its subject at EVERY port, exactly as before
  // 2026-09-20. An operator who admits `127.0.0.1` on a multi-user box has admitted every service on it to
  // any member who can author an endpoint connection — which is precisely why the port spelling now exists
  // (the two arms below). This pin is what proves the port arm is STRICTLY ADDITIVE: no deployment that
  // never writes a port changes behaviour.
  test("a BARE entry still admits its host at EVERY port — the port arm is strictly additive", async () => {
    publishPrivateEndpointAllowlist(["127.0.0.1"]);
    expect(await dialVerdict("http://127.0.0.1:9998/x")).toBe("attempted");
  });

  // THE PORT ARM. Both directions in ONE invocation: the named port is really dialled AND a neighbouring
  // port on the SAME admitted host is really refused. A one-sided arm would pass just as well on a belt
  // that admits nothing at all, so the positive half is the planted control for the negative half.
  test("a host:PORT entry admits ONLY that port on that host", async () => {
    publishPrivateEndpointAllowlist(["127.0.0.1:8703"]);
    expect(endpointAdmission("http://127.0.0.1:8703")).toBe("admitted");
    expect(await dialVerdict("http://127.0.0.1:8703/v1/models")).toBe("attempted");
    // The ports the host-scoped spelling silently handed out — `:22` is the one the retired
    // internal-backend rule named explicitly as staying blocked.
    expect(endpointAdmission("http://127.0.0.1:22")).toBe("refused");
    expect(endpointAdmission("http://127.0.0.1:9998")).toBe("refused");
    expect(await dialVerdict("http://127.0.0.1:9998/x")).toBe("BLOCKED");
  });

  // PRECEDENCE, decided rather than emergent: the NARROWER spelling wins. An operator who writes the port
  // has said it out loud, and the safe reading of a contradictory pair is the smaller grant. Order-free —
  // it is a property of the published SET, not of which line came first.
  test("a port entry NARROWS its own bare spelling — the narrower wins, in either order", async () => {
    publishPrivateEndpointAllowlist(["127.0.0.1", "127.0.0.1:8703"]);
    expect(endpointAdmission("http://127.0.0.1:8703")).toBe("admitted");
    expect(endpointAdmission("http://127.0.0.1:9998")).toBe("refused");
    publishPrivateEndpointAllowlist(["127.0.0.1:8703", "127.0.0.1"]);
    expect(endpointAdmission("http://127.0.0.1:8703")).toBe("admitted");
    expect(endpointAdmission("http://127.0.0.1:9998")).toBe("refused");
    expect(await dialVerdict("http://127.0.0.1:9998/x")).toBe("BLOCKED");
  });

  // The narrowing has TWO enforcers and they cover different inputs — measured with a planted control, not
  // assumed. The identical bare spelling is dropped at PUBLISH (so the read never sees it); a CONTAINING
  // CIDR survives the publish untouched, and only `admittedByAllowlist`'s early return stops it re-widening
  // the port-scoped host. Removing that early return leaves the arm above green and reds THIS one.
  test("a containing CIDR does NOT re-widen a port-scoped host — and still covers its other addresses", async () => {
    publishPrivateEndpointAllowlist(["127.0.0.0/8", "127.0.0.1:8703"]);
    expect(endpointAdmission("http://127.0.0.1:8703")).toBe("admitted");
    expect(endpointAdmission("http://127.0.0.1:9998")).toBe("refused");
    expect(await dialVerdict("http://127.0.0.1:9998/x")).toBe("BLOCKED");
    // …and the CIDR is not revoked for everyone else: a DIFFERENT address inside it keeps every port.
    expect(endpointAdmission("http://127.0.0.9:9998")).toBe("admitted");
    expect(await dialVerdict("http://127.0.0.9:9998/x")).toBe("attempted");
  });

  // The port a URL does not state is the SCHEME's default, on both sides of the comparison — otherwise an
  // entry written `ollama.lan:80` would never match `http://ollama.lan`, the URL a user actually types.
  test("a port entry is judged against the scheme's default when the URL states none", () => {
    publishPrivateEndpointAllowlist(["ollama.lan:80"]);
    expect(endpointAdmission("http://ollama.lan")).toBe("admitted");
    expect(endpointAdmission("https://ollama.lan")).toBe("public"); // :443 is a different port
  });

  // A CIDR cannot carry a port: the gate that consults ranges is the DNS lookup override, and node's
  // `dns.lookup` never sees one. Accepting `192.168.1.0/24:8080` would be a promise the belt cannot keep
  // for a HOSTNAME target, so it is refused outright rather than honoured for literals only.
  test("a port on a CIDR is REFUSED — the range gate is port-blind by construction", () => {
    publishPrivateEndpointAllowlist(["192.168.1.0/24:8080"]);
    expect(endpointAdmission("http://192.168.1.10:8080")).toBe("refused");
    publishPrivateEndpointAllowlist(["192.168.1.0/24"]); // the control: the same CIDR without a port works
    expect(endpointAdmission("http://192.168.1.10:8080")).toBe("admitted");
  });

  // THE NO-TELL HALF, which matters as much as the feature. An entry that can never match must not sit
  // there silently: the publish REFUSES it (it never becomes an unmatchable key) and SAYS SO at warn —
  // with COUNTS only, because an entry list would put the operator's LAN topology in every boot log.
  test("an unmatchable entry is refused and COUNTED at warn — never a silently inert key", async () => {
    const warn = vi.fn();
    const log = (await import("@orb/server/foundation/observability")).getLog();
    const prior = log.warn;
    log.warn = warn;
    try {
      // one good entry + three that can never match: an out-of-range port, a whole URL, a bad prefix.
      publishPrivateEndpointAllowlist(["127.0.0.1:8703", "127.0.0.1:99999", "http://127.0.0.1:8703", "192.168.1.0/99"]);
    } finally {
      log.warn = prior;
    }
    const counts = warn.mock.calls[0]?.[0] as { refused?: number; hostPorts?: number } | undefined;
    expect(counts?.refused).toBe(3);
    expect(counts?.hostPorts).toBe(1);
    expect(endpointAdmission("http://127.0.0.1:8703")).toBe("admitted"); // the good entry still lands
  });

  // An entry is read by the SAME parser `isInRanges` matches with (`@orb/kit/ip`). A mapped `::ffff:a.b.c.d` is
  // an IPv4 address there, so it admits that address; a zone id is not an address there, so it is refused.
  test("an IPv4-mapped entry admits its address and a zone-id entry is refused, as the range match reads them", async () => {
    const warn = vi.fn();
    const log = (await import("@orb/server/foundation/observability")).getLog();
    const prior = log.warn;
    log.warn = warn;
    try {
      publishPrivateEndpointAllowlist(["::ffff:192.168.1.10", "fe80::1%eth0", "::ffff:10.0.0.0/104"]);
    } finally {
      log.warn = prior;
    }
    const counts = warn.mock.calls[0]?.[0] as { refused?: number } | undefined;
    expect(counts?.refused).toBe(2);
    expect(endpointAdmission("http://192.168.1.10:8000")).toBe("admitted");
    expect(endpointAdmission("http://[::ffff:192.168.1.10]:8000")).toBe("admitted");
    expect(endpointAdmission("http://192.168.1.11:8000")).toBe("refused");
    expect(endpointAdmission("http://10.0.0.5:8000")).toBe("refused");
  });

  test("a private address OUTSIDE the set stays blocked while a sibling is admitted", async () => {
    publishPrivateEndpointAllowlist(["127.0.0.1"]);
    expect(endpointAdmission("http://10.0.0.5:8000")).toBe("refused");
    expect(await dialVerdict("http://10.0.0.5:8000/v1/models")).toBe("BLOCKED");
  });

  // The CIDR spelling is dialled against a LOOPBACK /8, deliberately: an ADMITTED target is really
  // connected to, and a dial at a routable-but-absent LAN address hangs until the suite timeout, while
  // loopback refuses instantly. The RFC1918 half is decided by `endpointAdmission` and never dialled.
  test("a CIDR entry admits every address inside it (the LAN-subnet spelling)", async () => {
    publishPrivateEndpointAllowlist(["127.0.0.0/8"]);
    expect(endpointAdmission("http://127.0.0.9:8000")).toBe("admitted");
    expect(await dialVerdict("http://127.0.0.9:8000/v1/models")).toBe("attempted");
    // …and only inside it: an address outside the entry is untouched by it.
    expect(endpointAdmission("http://192.168.1.10:8000")).toBe("refused");
    expect(await dialVerdict("http://192.168.1.10:8000/v1/models")).toBe("BLOCKED");
  });

  // The publish is WHOLE-SET by design: a Governance edit that drops an entry closes it by its ABSENCE from
  // the next publish, never by a delete call nobody wrote. The dial is re-judged live, so the close takes
  // effect on the very next connect — no cache, no restart.
  test("a removed entry closes by ABSENCE of the next publish, on the next connect", async () => {
    publishPrivateEndpointAllowlist(["127.0.0.1"]);
    expect(await dialVerdict("http://127.0.0.1:8703/v1/models")).toBe("attempted");
    publishPrivateEndpointAllowlist([]);
    expect(endpointAdmission("http://127.0.0.1:8703")).toBe("refused");
    expect(await dialVerdict("http://127.0.0.1:8703/v1/models")).toBe("BLOCKED");
  });

  // NEVER_ADMISSIBLE, the class the whole belt exists for. The operator here is not an attacker — they are
  // careless, or copying a stale runbook — and the answer is the same: the publish REFUSES the entry
  // (classify → null) and the guard blocks the dial anyway. `169.254.169.254` is the cloud-metadata service
  // (IAM credentials); `2002::/16` and `2001::/32` are tunnel blocks that embed an arbitrary inner address,
  // so admitting one would be admitting the whole internet through a loophole.
  test("link-local / multicast / tunnel blocks are refused HOWEVER the operator spells them", async () => {
    publishPrivateEndpointAllowlist(["169.254.169.254", "169.254.0.0/16", "fe80::/10", "224.0.0.1", "2002::/16", "2001::/32"]);
    expect(endpointAdmission("http://169.254.169.254")).toBe("refused");
    expect(await dialVerdict("http://169.254.169.254/latest/meta-data/")).toBe("BLOCKED");
    expect(endpointAdmission("http://[fe80::1]")).toBe("refused");
    expect(await dialVerdict("http://[fe80::1]/x")).toBe("BLOCKED");
    expect(endpointAdmission("http://[2002::1]")).toBe("refused");
  });

  // A hostname entry admits that NAME — and the name still resolves at connect, where the second
  // never-admissible check runs on the RESOLVED address. `localhost` is folded to loopback at the
  // write-time read so the pane's inline "Admit" affordance fires for the spelling people actually type.
  test("a HOSTNAME entry admits the name; `localhost` folds to loopback at the write-time read", () => {
    publishPrivateEndpointAllowlist(["ollama.lan"]);
    expect(endpointAdmission("http://ollama.lan:11434")).toBe("admitted");
    expect(endpointAdmission("http://other.lan:11434")).toBe("public"); // a NAME we cannot resolve here is not "refused" — the DNS gate judges it at connect
    publishPrivateEndpointAllowlist(["127.0.0.1"]);
    expect(endpointAdmission("http://localhost:8703")).toBe("admitted");
  });

  test("a public address rides the unchanged SSRF guard — the allowlist is not consulted for it", () => {
    publishPrivateEndpointAllowlist([]);
    expect(endpointAdmission("https://openrouter.ai")).toBe("public");
    expect(endpointAdmission("ftp://openrouter.ai")).toBe("invalid");
    expect(endpointAdmission("not-a-url")).toBe("invalid");
  });

  // An address the range parser cannot read is in NO range, so a gate that only asks "is it in a blocked range?"
  // passes it. Node dials a zone-scoped `fe80::1%lo`, and `@orb/kit/ip` returns null for it. Each gate gets its own
  // control pair first, which proves the injected answer is the one that gate judges. Every dial takes its own
  // port, so an admitted dial that did connect cannot hand a pooled socket to the next dial.
  test("the unlisted-host gate refuses a resolved address the range parser cannot read", async () => {
    publishPrivateEndpointAllowlist(["127.0.0.0/8"]);
    __setFirewallLookupForTest(answering("10.0.0.5"));
    expect(await dialVerdict("http://unlisted.test:8711/x")).toBe("BLOCKED");
    __setFirewallLookupForTest(answering("127.0.0.9"));
    expect(await dialVerdict("http://unlisted.test:8712/x")).toBe("attempted");
    __setFirewallLookupForTest(answering("fe80::1%lo"));
    expect(await dialVerdict("http://unlisted.test:8713/x")).toBe("BLOCKED");
  });

  test("the declared-host gate refuses a resolved address the range parser cannot read", async () => {
    publishPrivateEndpointAllowlist(["declared.lan"]);
    __setFirewallLookupForTest(answering("169.254.169.254"));
    expect(await dialVerdict("http://declared.lan:8721/x")).toBe("BLOCKED");
    __setFirewallLookupForTest(answering("127.0.0.1"));
    expect(await dialVerdict("http://declared.lan:8722/x")).toBe("attempted");
    __setFirewallLookupForTest(answering("fe80::1%lo"));
    expect(await dialVerdict("http://declared.lan:8723/x")).toBe("BLOCKED");
  });

  // `@orb/kit/ip` refuses a leading-zero octet, so `127.0.0.01` is no address here. Nor is it a hostname a URL can
  // carry: WHATWG reads a host whose last label is a number as IPv4. It is refused and counted, never a dead key.
  test("a leading-zero IPv4 entry is refused and COUNTED — neither a range nor a dead host key", async () => {
    const warn = vi.fn();
    const log = (await import("@orb/server/foundation/observability")).getLog();
    const prior = log.warn;
    log.warn = warn;
    try {
      publishPrivateEndpointAllowlist(["127.0.0.01", "012.0.0.1", "127.0.0.2"]);
    } finally {
      log.warn = prior;
    }
    const counts = warn.mock.calls[0]?.[0] as { refused?: number; hosts?: number } | undefined;
    expect(counts?.refused).toBe(2);
    expect(counts?.hosts).toBe(0);
    expect(endpointAdmission("http://127.0.0.1:8000")).toBe("refused");
    expect(endpointAdmission("http://127.0.0.2:8000")).toBe("admitted");
  });
});

// A zone-scoped literal (`::1%lo`) is an IP to node, which skips the DNS lookup for it, and no address to
// `@orb/kit/ip`, so neither the literal gate nor the lookup gate judges it. No URL can carry one (WHATWG refuses a
// zone), so these drive the connect function the global dispatcher uses. Nothing listens on the ports: a dial that
// gets through fails ECONNREFUSED, which is the evidence that it was attempted.
describe("the firewall connect function refuses a zone-scoped host before any socket", () => {
  function connectVerdict(hostname: string, port: string): Promise<string> {
    const connect = __firewallConnectForTest();
    return new Promise((resolve) => {
      connect({ hostname, host: `[${hostname}]:${port}`, protocol: "http:", port }, (err, socket) => {
        socket?.destroy();
        resolve(err === null ? "connected" : errorChainText(err));
      });
    });
  }

  beforeAll(() => {
    publishPrivateEndpointAllowlist([]);
  });

  test.each([
    ["the IPv6 loopback on a zone", "::1%lo", "8741"],
    ["a link-local address on a zone", "fe80::1%orbzone0", "8742"],
    ["a percent-encoded zone", "::1%25lo", "8743"],
  ])("%s (%s) is refused", async (_label, hostname, port) => {
    expect(await connectVerdict(hostname, port)).toContain("SSRF_BLOCKED");
  });

  test("control: the same function refuses the zone-free loopback literal, so the gate under test is the zone one", async () => {
    expect(await connectVerdict("::1", "8744")).toContain("SSRF_BLOCKED");
  });
});

// ── THE BORN VALUE: a FRESH install, end to end (env floor → the settings layer → publish → the verdict) ──
// The step-6b receipt is about what a box does on its FIRST boot with nobody having configured anything, so
// it is taken through the real floor resolver rather than against a copied literal — `layer({})` is what
// `entry/compose/services.ts` publishes from. The env floor is frozen at module load, so each arm drives a
// FRESH module registry with a crafted process.env (the reimport pattern from
// tests/server/foundation/env/index.test.ts).
/** The one key `AUTH_MODE=local` cannot boot without (`AUTH_MODE_REQUIRED_ENV`) — the scrypt pepper, not a
 *  subject of this file. Stated once so a mode arm reads as its own allowlist story. */
const SESSION_SECRET: readonly [string, string] = ["SESSION_SECRET", "test-session-secret-at-least-32-chars"];

describe("the BORN private-endpoint allowlist — single-user admits its own box, multi-user admits nothing", () => {
  let snapshot: Record<string, string | undefined>;
  let original: Dispatcher;

  // biome-ignore-start lint/style/noProcessEnv: this describe DRIVES the sole env reader (foundation/env) by crafting process.env — the reimport pattern from tests/server/foundation/env/index.test.ts.
  beforeEach(() => {
    snapshot = { ...process.env };
    original = getGlobalDispatcher();
  });

  afterEach(() => {
    setGlobalDispatcher(original);
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, snapshot);
    vi.resetModules();
    publishPrivateEndpointAllowlist([]);
  });

  /** Boot a fresh install at `mode`: wipe env → craft it → re-import the floor resolver AND the guard from a
   *  fresh registry → publish what a first boot would publish → install the firewall. Returns the fresh
   *  network module (its `endpointAdmission` reads the state `publish` just wrote). `extra` is TUPLES rather
   *  than an object literal because env keys are SCREAMING_SNAKE and an object key would be a naming-rule
   *  violation the assignment form does not have. */
  async function freshInstall(mode: string, extra: readonly (readonly [string, string])[] = []): Promise<typeof import("@orb/server/infra/network")> {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    process.env["VITEST"] = "1";
    process.env["ORB_ENV_NO_FILE"] = "1";
    process.env["AUTH_MODE"] = mode;
    for (const [key, value] of extra) {
      process.env[key] = value;
    }
    vi.resetModules();
    const { layer } = await import("../../../../packages/server/src/domain/settings/effective-config/layer.ts");
    const network = await import("@orb/server/infra/network");
    // Exactly what the composition root does at boot: resolve the config with NO stored overrides (a fresh
    // db has none), then hand the guard the resolved list.
    network.publishPrivateEndpointAllowlist(layer({}).privateEndpointAllowlist);
    network.installEgressFirewall();
    return network;
  }
  // biome-ignore-end lint/style/noProcessEnv: the crafted-env helpers above end here; the arms below read
  // only what `freshInstall` published. An unclosed range silently extends to END OF FILE.

  test("AUTH_MODE=single-user is born with loopback admitted — one human, one box, nothing to protect from", async () => {
    const network = await freshInstall("single-user");
    expect(network.endpointAdmission("http://127.0.0.1:8703")).toBe("admitted");
    expect(network.endpointAdmission("http://[::1]:8703")).toBe("admitted");
    expect(await dialVerdict("http://127.0.0.1:8703/v1/models")).toBe("attempted");
    // Loopback only — the born set is not a blanket private-range pass.
    expect(network.endpointAdmission("http://192.168.1.10:8000")).toBe("refused");
  });

  test("a fresh MULTI-USER install is born EMPTY — hosted providers only until an admin admits a host", async () => {
    const network = await freshInstall("local", [SESSION_SECRET]);
    expect(network.endpointAdmission("http://127.0.0.1:8703")).toBe("refused");
    expect(await dialVerdict("http://127.0.0.1:8703/v1/models")).toBe("BLOCKED");
    expect(network.endpointAdmission("https://openrouter.ai")).toBe("public");
  });

  test("PRIVATE_ENDPOINT_ALLOWLIST is the operator's floor and it OUTRANKS the mode default, both ways", async () => {
    // A multi-user box whose operator declared its LAN inference host…
    const declared = await freshInstall("local", [SESSION_SECRET, ["PRIVATE_ENDPOINT_ALLOWLIST", "10.0.0.0/8, 127.0.0.1"]]);
    expect(declared.endpointAdmission("http://10.0.0.5:8000")).toBe("admitted");
    expect(declared.endpointAdmission("http://127.0.0.1:8703")).toBe("admitted");
    // …and a single-user box whose operator declared an EMPTY one: an explicit empty string is a decision,
    // so the born loopback default does NOT re-appear under it.
    const emptied = await freshInstall("single-user", [["PRIVATE_ENDPOINT_ALLOWLIST", ""]]);
    expect(emptied.endpointAdmission("http://127.0.0.1:8703")).toBe("refused");
  });

  // The port spelling through the REAL floor resolver, not a copied literal: an operator migrating a
  // runbook from the retired host:PORT-scoped model writes exactly this in `PRIVATE_ENDPOINT_ALLOWLIST`,
  // and it now means what it says — the engine port and nothing else on that box.
  test("a PORT-scoped env floor survives end to end — the operator's runbook spelling means its port", async () => {
    const box = await freshInstall("local", [SESSION_SECRET, ["PRIVATE_ENDPOINT_ALLOWLIST", "127.0.0.1:8703, [::1]:8703"]]);
    expect(box.endpointAdmission("http://127.0.0.1:8703")).toBe("admitted");
    expect(box.endpointAdmission("http://[::1]:8703")).toBe("admitted");
    expect(box.endpointAdmission("http://127.0.0.1:22")).toBe("refused");
    expect(await dialVerdict("http://127.0.0.1:8703/v1/models")).toBe("attempted");
    expect(await dialVerdict("http://127.0.0.1:9998/x")).toBe("BLOCKED");
  });
});
