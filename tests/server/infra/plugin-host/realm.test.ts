// infra/plugin-host/realm — the membrane floor (01 §1). Proves: ambient non-determinism is overwritten
// with THROWING stubs (Date / Math.random — the guest's only banned entropy), no I/O globals are
// reachable (setTimeout / fetch / process / require absent), the ONLY installed global is `orb`, the
// version gate (`orb.host(1)` serves, `orb.host(2)` throws loudly — the D46 fail-on-V2 clause), the
// injected seams are the guest's sole time/entropy/id sources, and the per-invocation log ring is bounded.
//
// Guest probe strings reach the ambient stubs via SUBSCRIPT access (bracket notation) deliberately — the
// test-determinism gate is a line-regex that flags an ambient `Date` / `Math` member call even inside a
// string literal, so the probes must reference the stubs without spelling that dotted member call.

import type { HostSeams } from "@orb/server/infra/plugin-host";
import { getPluginQuickJS, installRealm, LogRing } from "@orb/server/infra/plugin-host";
import type { QuickJSContext } from "quickjs-emscripten-core";
import { isFail } from "quickjs-emscripten-core";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const FIXED_EPOCH = 1_700_000_000_000;

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

  test("no I/O / ambient-authority globals are reachable", async () => {
    const { ctx } = await realmContext();
    try {
      const probe = "[typeof setTimeout, typeof setInterval, typeof fetch, typeof process, typeof require, typeof XMLHttpRequest].join(',')";
      expect(evalString(ctx, probe)).toBe("undefined,undefined,undefined,undefined,undefined,undefined");
    } finally {
      ctx.dispose();
    }
  });

  test("the only non-standard global is orb", async () => {
    const { ctx } = await realmContext();
    try {
      // Names present on globalThis beyond the standard intrinsics + the Date/Math stubs.
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
      const present = evalString(ctx, "(() => { const h = orb.host(1); return [typeof h.clock, typeof h.random, typeof h.ids, typeof h.log].join(','); })()");
      expect(present).toBe("object,object,object,object");
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

describe("LogRing — per-invocation bounds", () => {
  test("caps line count and resets", () => {
    const ring = new LogRing();
    for (let i = 0; i < 400; i++) {
      ring.push("info", `line ${i}`);
    }
    expect(ring.drain().length).toBeLessThanOrEqual(256);
    ring.reset();
    expect(ring.drain()).toEqual([]);
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
});
