// infra/plugin-host/realm — the membrane floor (01 §1). Proves: ambient non-determinism is overwritten
// with THROWING stubs (Date / Math.random / performance — the runtime's three ambient time/entropy sources),
// no I/O globals are reachable (setTimeout / fetch / process / require absent), the guest global object is an
// EXACT ALLOW-LIST whose only non-intrinsic entry is `orb`, the
// version gate (`orb.host(1)` serves, `orb.host(2)` throws loudly — the D46 fail-on-V2 clause), the
// injected seams are the guest's sole time/entropy/id sources, and the per-drain log ring is bounded, drains
// DESTRUCTIVELY (#806 — a drain hands over "everything since the last drain" and empties the ring; there is
// no reset that could destroy a floated continuation's lines), and mirrors accepted lines at push time.
//
// THE ALLOW-LIST IS THE LESSON, not decoration: this file's ambient pins used to be a FIXED SIX-NAME probe
// plus a test whose title claimed "the only non-standard global is orb" while its body asserted only
// `typeof orb`. Both passed for months against a realm that handed every guest a live `performance.now()`.
// A closed list is the only shape that fails on a name nobody thought to probe for.
//
// Guest probe strings reach the ambient stubs via SUBSCRIPT access (bracket notation) deliberately — the
// test-determinism gate is a line-regex that flags an ambient `Date` / `Math` member call even inside a
// string literal, so the probes must reference the stubs without spelling that dotted member call. The one
// PROPERTY-read probe (`typeof performance.timeOrigin`) is dot-notation on purpose — bracket access on a
// property read (not a call) reads the same either way — and #831 widened the gate to recognise that exact
// spelling, so it now carries the shared `@orb-waive test-determinism(performance.timeOrigin)` marker
// instead of a bracket dodge.

import { estimateTokens } from "@orb/kit/tokens";
import type { HostSeams } from "@orb/server/infra/plugin-host";
import { getPluginQuickJS, installRealm, LogRing } from "@orb/server/infra/plugin-host";
import type { QuickJSContext } from "quickjs-emscripten-core";
import { isFail } from "quickjs-emscripten-core";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const FIXED_EPOCH = 1_700_000_000_000;

/** EVERY name a guest can enumerate on `globalThis` after `installRealm`. Three classes, and the class is the
 *  judgement — adding a name here is a security decision, not bookkeeping:
 *   - ES INTRINSICS (Array/JSON/Promise/…): pure, no host authority, no ambient state.
 *   - NEUTRALIZED ambient sources: `Date`, `Math` (its `random`) and `performance` are all THROWING STUBS —
 *     present so a guest feature-detects, inert so it cannot read time or entropy without the injected seams.
 *   - The ONE installed entry: `orb`.
 *  Two deliberate admissions to record rather than hide: `WeakRef` + `FinalizationRegistry` are GC-observability
 *  side channels (a guest can learn when the collector runs). They are ES intrinsics of the chosen runtime, and
 *  removing them would break legitimate guest code; the exposure is memory-timing, never host authority.
 *  `SharedArrayBuffer` carries no `Atomics` here (no `Atomics` global ⇒ no wait/notify timer) and there is no
 *  worker to share it with. */
const ALLOWED_GLOBALS: readonly string[] = [
  // ── ES intrinsics ──
  "AggregateError",
  "Array",
  "ArrayBuffer",
  "BigInt",
  "BigInt64Array",
  "BigUint64Array",
  "Boolean",
  "DOMException",
  "DataView",
  "Error",
  "EvalError",
  "FinalizationRegistry",
  "Float16Array",
  "Float32Array",
  "Float64Array",
  "Function",
  "Infinity",
  "Int16Array",
  "Int32Array",
  "Int8Array",
  "InternalError",
  "Iterator",
  "JSON",
  "Map",
  "NaN",
  "Number",
  "Object",
  "Promise",
  "Proxy",
  "RangeError",
  "ReferenceError",
  "Reflect",
  "RegExp",
  "Set",
  "SharedArrayBuffer",
  "String",
  "Symbol",
  "SyntaxError",
  "TypeError",
  "URIError",
  "Uint16Array",
  "Uint32Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "WeakMap",
  "WeakRef",
  "WeakSet",
  "decodeURI",
  "decodeURIComponent",
  "encodeURI",
  "encodeURIComponent",
  "escape",
  "eval",
  "globalThis",
  "isFinite",
  "isNaN",
  "parseFloat",
  "parseInt",
  "queueMicrotask",
  "undefined",
  "unescape",
  // ── neutralized ambient time/entropy (throwing stubs — see installRealm's AMBIENT_STUBS) ──
  "Date",
  "Math",
  "performance",
  // ── the one installed entry ──
  "orb",
];

/** A deterministic seam bundle — no ambient anything (a fixed clock, a seeded LCG, a counter id). */
function makeSeams(seed = 1): { seams: HostSeams; log: LogRing } {
  let state = seed;
  let counter = 0;
  const seams: HostSeams = {
    nowEpochMs: () => FIXED_EPOCH,
    nextRandom: () => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state / 2_147_483_648;
    },
    mintId: () => `id-${counter++}`,
  };
  return { seams, log: new LogRing() };
}

/** Install a realm on a fresh context and return both (caller disposes the context). */
async function realmContext(seed = 1): Promise<{ ctx: QuickJSContext; log: LogRing }> {
  const mod = await getPluginQuickJS();
  const ctx = mod.newContext();
  const { seams, log } = makeSeams(seed);
  installRealm(ctx, seams, log);
  return { ctx, log };
}

/** Eval a string-returning guest expression; throws if the guest errored. */
function evalString(ctx: QuickJSContext, code: string): string {
  const result = ctx.evalCode(code);
  if (isFail(result)) {
    const message = ctx.getString(result.error);
    result.error.dispose();
    throw new Error(`guest errored: ${message}`);
  }
  const out = ctx.getString(result.value);
  result.value.dispose();
  return out;
}

describe("installRealm — ambient denial", () => {
  test("Date is a throwing stub (no ambient clock leaks in)", async () => {
    const { ctx } = await realmContext();
    try {
      // `Date['now']()` reaches the stub without the literal the determinism gate bans.
      expect(evalString(ctx, "try { Date['now'](); 'NO-THROW' } catch (e) { e.message }")).toContain("disabled");
      expect(evalString(ctx, "try { new (globalThis['Date'])(); 'NO-THROW' } catch (e) { 'threw' }")).toBe("threw");
    } finally {
      ctx.dispose();
    }
  });

  test("Math.random is a throwing stub", async () => {
    const { ctx } = await realmContext();
    try {
      expect(evalString(ctx, "try { Math['random'](); 'NO-THROW' } catch (e) { e.message }")).toContain("disabled");
    } finally {
      ctx.dispose();
    }
  });

  test("the ambient `performance` clock is a throwing stub (no capability-free time source)", async () => {
    const { ctx } = await realmContext();
    try {
      // A bare quickjs-ng context ships `performance.now()` — a real, monotonic, sub-microsecond clock a guest
      // could read with NO capability, defeating the injected seams (D46: clock/PRNG/ids reach the guest ONLY
      // via host functions) and handing a hostile guest a timer for the DoS deadline + timing side channels.
      expect(evalString(ctx, "try { performance['now'](); 'NO-THROW' } catch (e) { e.message }")).toContain("disabled");
      // `timeOrigin` goes with it — the stub is a fresh object, not a patched one.
      // @orb-waive test-determinism(performance.timeOrigin): the SUBJECT is the guest realm's ambient-clock DENIAL — this probe asserts the stub carries no timeOrigin, it never reads a real clock (#831)
      expect(evalString(ctx, "typeof performance.timeOrigin")).toBe("undefined");
      // POSITIVE CONTROL for the assertion itself: the name IS still there (the stub is an overwrite, so a
      // silently-failed assignment would leave a WORKING clock here and this probe must be able to see it).
      expect(evalString(ctx, "typeof performance")).toBe("object");
      expect(evalString(ctx, "String(Object.getOwnPropertyNames(performance))")).toBe("now");
    } finally {
      ctx.dispose();
    }
  });

  test("no I/O / ambient-authority globals are reachable", async () => {
    const { ctx } = await realmContext();
    try {
      const probe = "[typeof setTimeout, typeof setInterval, typeof fetch, typeof process, typeof require, typeof XMLHttpRequest].join(',')";
      expect(evalString(ctx, probe)).toBe("undefined,undefined,undefined,undefined,undefined,undefined");
    } finally {
      ctx.dispose();
    }
  });

  // THE REALM ALLOW-LIST — the pin that has to exist because "absent from a bare context" is an assumption, not
  // a fact: `performance` shipped live precisely because all three "no ambient" tests were structurally blind to
  // it (a fixed six-NAME probe that never named it; a test titled "the only non-standard global is orb" whose
  // body asserted only `typeof orb`; and an escape-suite set-diff taken against a BARE context, which carries
  // the same ambient source and therefore cancels it out). A closed list over the whole global object is the
  // only shape that goes RED on arrival when a quickjs-ng bump adds `crypto` / `Temporal` / `Atomics` / a timer.
  test("the guest global object is an EXACT allow-list (a new runtime global goes red here)", async () => {
    const { ctx } = await realmContext();
    try {
      const actual = evalString(ctx, "Object.getOwnPropertyNames(globalThis).sort().join(',')").split(",");
      expect(actual).toEqual([...ALLOWED_GLOBALS].sort());
      // The claim the mis-titled test never made: `orb` is the ONE non-intrinsic entry, and it is the surface.
      expect(evalString(ctx, "typeof orb")).toBe("object");
      expect(evalString(ctx, "typeof orb.host")).toBe("function");
    } finally {
      ctx.dispose();
    }
  });
});

describe("installRealm — orb.host version gate", () => {
  test("orb.host(1) serves the surface", async () => {
    const { ctx } = await realmContext();
    try {
      expect(evalString(ctx, "'' + orb.host(1).version")).toBe("1");
    } finally {
      ctx.dispose();
    }
  });

  test("orb.host(2) throws the typed HostVersionError by NAME across the boundary (fail-on-unserved-major)", async () => {
    const { ctx } = await realmContext();
    try {
      // The CONTRACT a guest feature-detects on is `e.name` (01 §3) — a V2-compiled plugin catches
      // `e.name === "HostVersionError"`, NOT a message substring. Assert the name (the actual contract) so the
      // typed-class throw is what's pinned, not the human-readable message text.
      expect(evalString(ctx, "try { orb.host(2); 'NO-THROW' } catch (e) { e.name }")).toBe("HostVersionError");
    } finally {
      ctx.dispose();
    }
  });
});

describe("installRealm — injected seams are the guest's only time/entropy/ids", () => {
  test("clock returns the injected epoch", async () => {
    const { ctx } = await realmContext();
    try {
      expect(evalString(ctx, "'' + orb.host(1).clock.nowEpochMs()")).toBe(String(FIXED_EPOCH));
    } finally {
      ctx.dispose();
    }
  });

  test("random is the seeded PRNG (in [0,1), advances)", async () => {
    const { ctx } = await realmContext();
    try {
      const out = evalString(ctx, "const h = orb.host(1); const a = h.random.next(); const b = h.random.next(); JSON.stringify([a >= 0 && a < 1, a !== b])");
      expect(JSON.parse(out)).toEqual([true, true]);
    } finally {
      ctx.dispose();
    }
  });

  test("ids mint opaque unique strings", async () => {
    const { ctx } = await realmContext();
    try {
      expect(evalString(ctx, "const h = orb.host(1); h.ids.mint() + ',' + h.ids.mint()")).toBe("id-0,id-1");
    } finally {
      ctx.dispose();
    }
  });

  test("log routes to the host ring", async () => {
    const { ctx, log } = await realmContext();
    try {
      evalString(ctx, "orb.host(1).log.info('hello from guest'); 'ok'");
      expect(log.drain()).toContain("[info] hello from guest");
    } finally {
      ctx.dispose();
    }
  });

  // #788 F13 — the FREE token-count estimator. It is the kit `estimateTokens` engine computed host-side, so the
  // guest sees the SAME number the rest of the platform budgets on; a non-string arg is the empty-string estimate
  // (the realm's fail-safe), never a throw.
  test("tokens.count returns the kit estimate for the guest's own string (a non-string arg is 0)", async () => {
    const { ctx } = await realmContext();
    try {
      const sample = "The quick brown fox jumps over the lazy dog.";
      expect(evalString(ctx, `'' + orb.host(1).tokens.count(${JSON.stringify(sample)})`)).toBe(String(estimateTokens(sample)));
      expect(evalString(ctx, "'' + orb.host(1).tokens.count('')")).toBe("0");
      expect(evalString(ctx, "'' + orb.host(1).tokens.count(12345)")).toBe("0");
    } finally {
      ctx.dispose();
    }
  });
});

describe("installRealm — the P4b surface pin (determinism floor ONLY this slice)", () => {
  // The membrane host-fn CALL surface (chat/worldInfo/variables/notifications/imagery) + the registration
  // namespaces (tools/events/transforms) + net ride P4b (they need guest↔host value marshalling + invocation-
  // chat-context / the resident-handler runtime). This slice's realm exposes ONLY the determinism floor +
  // `grants`-less version gate. Pinning their ABSENCE is what makes the port's `invoke` + the compose
  // `registerTransform`/`subscribeEvent` throws UNREACHABLE (activation can never collect a registration a
  // guest could not create), not silent stubs — a guest feature-detects (`"tools" in host`), the design's
  // additive-optional-within-V1 evolution (01 §3). When a P4b namespace lands, flip its assertion here.
  test("the floor is present; every P4b namespace is absent (guest feature-detectable)", async () => {
    const { ctx } = await realmContext();
    try {
      const present = evalString(
        ctx,
        "(() => { const h = orb.host(1); return [typeof h.clock, typeof h.random, typeof h.ids, typeof h.log, typeof h.tokens].join(','); })()",
      );
      expect(present).toBe("object,object,object,object,object");
      const p4b = evalString(
        ctx,
        "(() => { const h = orb.host(1); return ['chat','worldInfo','variables','notifications','imagery','tools','events','transforms','net','grants'].map((k) => k in h).join(','); })()",
      );
      expect(p4b).toBe("false,false,false,false,false,false,false,false,false,false");
    } finally {
      ctx.dispose();
    }
  });
});

describe("LogRing — per-drain bounds, destructive drain, the push-time mirror", () => {
  test("caps line count; a drain EMPTIES the ring and re-arms the budget for the next interval (#806)", () => {
    const ring = new LogRing();
    for (let i = 0; i < 400; i++) {
      ring.push("info", `line ${i}`);
    }
    expect(ring.drain().length).toBeLessThanOrEqual(256);
    // Destructive: the second drain is empty, and the ring accepts a fresh interval's worth again — the lines a
    // floated continuation pushes between two invocations are attributed to the next drain, never destroyed.
    expect(ring.drain()).toEqual([]);
    ring.push("warn", "after");
    expect(ring.drain()).toEqual(["[warn] after"]);
  });

  test("the mirror sees every ACCEPTED line at push time, as the ring keeps it (level + clamped text)", () => {
    const seen: [string, string][] = [];
    const ring = new LogRing({ mirror: (level, message) => void seen.push([level, message]) });
    ring.push("warn", "search failed: boom");
    ring.push("info", "x".repeat(20_000));
    // Mirrored BEFORE any drain — a reader is not in the path.
    expect(seen[0]).toEqual(["warn", "search failed: boom"]);
    const [clampedLevel, clampedText] = seen[1] ?? ["", ""];
    expect(clampedLevel).toBe("info");
    expect(clampedText.length).toBeLessThan(20_000); // the clamp the ring applied, not the raw message
    // Past the cap nothing is accepted — and nothing is mirrored (the ring's volume cap IS the mirror's).
    ring.push("info", "dropped");
    expect(seen).toHaveLength(2);
    expect(ring.drain()[1]).toBe(`[info] ${clampedText}`);
    // …and the drain re-armed the budget, so the NEXT interval's lines are accepted and mirrored again.
    ring.push("info", "next interval");
    expect(seen).toHaveLength(3);
  });

  test("caps byte volume regardless of line count", () => {
    const ring = new LogRing();
    const big = "x".repeat(2000);
    for (let i = 0; i < 20; i++) {
      ring.push("info", big);
    }
    const totalBytes = ring.drain().reduce((sum, line) => sum + line.length, 0);
    expect(totalBytes).toBeLessThanOrEqual(16_384 + big.length);
  });

  // The budget is a RETENTION bound now that `port` keeps drained lines in a runtime ring (#627): the
  // pre-existing "check the budget, then push whatever" shape let ONE guest line carry the whole 32 MiB heap
  // past a ring documented as 16 KiB, and a retained 32 MiB line is the unbounded-per-instance allocation
  // #613 closed elsewhere. A single oversized line is CLAMPED to what is left of the budget.
  test("ONE oversized line cannot exceed the byte budget (it is clamped, not admitted whole)", () => {
    const ring = new LogRing();
    ring.push("info", "x".repeat(1_000_000));
    const drained = ring.drain(); // captured ONCE — a drain is destructive (#806)
    const totalChars = drained.reduce((sum, line) => sum + line.length, 0);
    expect(totalChars).toBeLessThanOrEqual(16_384);
    expect(drained).toHaveLength(1);
  });
});
