// TRIPWIRE for the cross-COPY dispatcher contract the whole SSRF egress firewall rests on.
//
// THE CONTRACT. `infra/network/egress.installEgressFirewall()` governs outbound traffic by handing a
// custom `Agent` to the **npm `undici` package**'s `setGlobalDispatcher`, then TRUSTING that Node's
// BUILT-IN global `fetch` — which is served by node's OWN bundled copy of undici, a different copy of a
// different version — picks that dispatcher up. The two copies hand off through a shared
// `Symbol.for("undici.globalDispatcher.<n>")` slot on `globalThis`. Nothing but this convention makes the
// firewall apply to `fetch`, and it is an upstream courtesy, not a documented API.
//
// WHY THIS FILE EXISTS (read this before deleting it as redundant). `egress.int.test.ts` already covers
// the contract TRANSITIVELY — it installs the firewall and asserts a real `fetch` is SSRF-blocked, so a
// broken handoff does turn it red. But it diagnoses the break as a POLICY failure: its message reads
// "a private address was not blocked", which sends the reader into `shouldBlockEgress`/the range tables
// hunting a logic bug that isn't there. This suite isolates CONTRACT from POLICY. It carries no SSRF
// policy at all — a canary connector that records and rejects — so when it goes red the answer is
// unambiguous: **the dispatcher is no longer wired to `fetch`**, and the firewall is silently governing
// nothing while every other gate stays green. Keep both; they fail differently on purpose.
//
// RUN IT ON EVERY node OR undici BUMP. The contract has already MOVED once: undici 7 used slot `.1`,
// undici 8 uses `.2` (node's bundled 8.x still populates `.1` as a legacy alias that nothing reads).
// This suite asserts the handoff through the PUBLIC API only, so it stays correct across slot renames —
// which is exactly why it, and not a hardcoded symbol, is the thing to trust.

import { createRequire } from "node:module";
import type { buildConnector, Dispatcher } from "undici";
import { Agent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { afterAll, afterEach, beforeAll, describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

// RFC 5737 TEST-NET-1 — guaranteed unroutable, so a contract break cannot accidentally dial a real host.
// The PORT MUST STAY NORMAL: `fetch` refuses a "bad port" (9/discard, 25/smtp, …) BEFORE it ever consults
// a dispatcher, so a bad-port probe never reaches the connector and reports a FALSE contract break. The
// bad-port trap is itself asserted below so a future edit cannot quietly reintroduce it.
const PROBE_URL = "http://192.0.2.1:8080/dispatcher-contract-probe";
const BAD_PORT_URL = "http://192.0.2.1:9/dispatcher-contract-probe";
const CANARY_SIGNAL = "CANARY_CONNECTOR_REACHED";
const ERR_CHAIN_DEPTH = 6;

function errorChainText(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; depth < ERR_CHAIN_DEPTH && cur !== null && cur !== undefined; depth++) {
    parts.push(cur instanceof Error ? `${cur.name}: ${cur.message}` : String(cur));
    cur = cur instanceof Error ? (cur as { cause?: unknown }).cause : undefined;
  }
  return parts.join(" <- ");
}

interface CanaryAgent {
  readonly agent: Agent;
  /** How many times undici asked this dispatcher's connector to open a socket. */
  hits: () => number;
}

/** An Agent that RECORDS every connect attempt and then REJECTS it — no socket is ever opened. */
function canaryAgent(): CanaryAgent {
  let hits = 0;
  const connect: buildConnector.connector = (_options, callback): void => {
    hits++;
    callback(new Error(CANARY_SIGNAL), null);
  };
  return { agent: new Agent({ connect }), hits: (): number => hits };
}

describe("undici ↔ node cross-copy dispatcher contract (the SSRF firewall's substrate)", () => {
  // Captured through the PUBLIC accessor, never a hardcoded globalThis symbol — the slot name is undici's
  // private business and has already changed once (.1 → .2 across the 7→8 major).
  let original: Dispatcher;
  beforeAll(() => {
    original = getGlobalDispatcher();
  });
  afterEach(() => {
    setGlobalDispatcher(original);
  });
  afterAll(() => {
    setGlobalDispatcher(original);
  });

  // THE LOAD-BEARING ASSERTION. If this goes red, `installEgressFirewall()` is a no-op against `fetch`
  // and every outbound request in the process is unfirewalled.
  test("the npm undici package's setGlobalDispatcher governs Node's BUILT-IN global fetch", async () => {
    const canary = canaryAgent();
    setGlobalDispatcher(canary.agent);

    const err = await fetch(PROBE_URL).catch((e: unknown) => e);

    // 1. The dispatcher was actually consulted — the handoff happened.
    expect(canary.hits(), "global fetch never reached the installed dispatcher's connector").toBe(1);
    // 2. And the connector's verdict is what decided the request (the firewall's rejection must PROPAGATE,
    //    not be swallowed and retried against a default dispatcher).
    expect(err).toBeInstanceOf(Error);
    expect(errorChainText(err)).toContain(CANARY_SIGNAL);
  });

  // The catalog comment promises "tracks Node's bundled undici major". That promise was a LIE for months
  // (catalog pinned 7.x while node bundled 8.x) and nothing caught it. This is the thing that catches it:
  // a major skew is the single most likely way the handoff above breaks.
  test("the npm undici major MATCHES node's bundled undici major (the catalog comment, enforced)", () => {
    const npmVersion = (createRequire(import.meta.url)("undici/package.json") as { version: string }).version;
    // `process.versions` is an index-signature record, so the bundled entry is `string | undefined`. Assert
    // it EXISTS first — a node that stopped reporting a bundled undici is itself news worth failing on.
    const bundledVersion = process.versions["undici"];
    const major = (v: string): string => v.split(".")[0] ?? "";

    expect(bundledVersion, "node no longer reports a bundled undici version").toBeTypeOf("string");
    expect(major(npmVersion), `npm undici ${npmVersion} vs node bundled ${bundledVersion ?? "(none)"} — majors must match`).toBe(major(bundledVersion ?? ""));
  });

  // Guards the PROBE, not the product: proves port 9 is rejected before any dispatcher is consulted, so
  // the "use a normal port" rule above is executable rather than a comment somebody can talk themselves
  // out of. A probe on a bad port would report a green contract as broken.
  test("a bad-port target is refused PRE-dispatch — why the probe port must stay normal", async () => {
    const canary = canaryAgent();
    setGlobalDispatcher(canary.agent);

    const err = await fetch(BAD_PORT_URL).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect(canary.hits(), "port 9 reached the connector — the bad-port list changed; re-pick the probe port").toBe(0);
    expect(errorChainText(err)).not.toContain(CANARY_SIGNAL);
  });

  // Slot-agnostic round trip: whatever private symbol undici uses, its own accessors must agree. This is
  // what lets every other test here (and the egress suites' teardown) trust the public API instead of
  // poking `globalThis`.
  test("getGlobalDispatcher round-trips exactly what setGlobalDispatcher installed", () => {
    const canary = canaryAgent();
    setGlobalDispatcher(canary.agent);
    expect(getGlobalDispatcher()).toBe(canary.agent);

    setGlobalDispatcher(original);
    expect(getGlobalDispatcher()).toBe(original);
  });
});
