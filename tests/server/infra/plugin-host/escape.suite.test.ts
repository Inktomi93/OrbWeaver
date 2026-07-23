// infra/plugin-host — the P6 hostile-guest escape/isolation CORPUS (plugin-design/04 §P4/§P6). Each test is a
// real adversarial payload against the LIVE QuickJS membrane, not a mock — it PINS a "safe by construction"
// claim the membrane review (verdict SOUND) could argue but never exhaustively exercised. The suite is the
// permanent regression floor for the isolation boundary; a case that ever goes red is a real escape.
//
// Deliberately NOT re-pinned here (covered elsewhere — do not duplicate): ambient Date/Math.random/setTimeout
// denial + the version gate (realm.test.ts); the host→guest RESULT collapse of non-JSON values (marshal.test.ts);
// the capability gate + forged-handle rejection + host-authority write ceiling + the CSPRNG token + the
// P4b-TAIL absent-namespace-by-construction set + the single fire-and-forget dispose drain (port.test.ts,
// membrane.test.ts); DoS deadline/OOM/stack containment (sandbox.test.ts). This file adds the NET-NEW corpus:
// realm-escape walks, cross-boundary prototype pollution, the guest→host INBOUND inert boundary, the
// stale-token / single-chat-per-invocation invariant, the ≤32 concurrency cap, the monotonic-clock DoS kill,
// and the multi-pending teardown drain.

import process from "node:process";
import type { PluginBridge } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import type { HostSeams } from "@orb/server/infra/plugin-host";
import { createPluginHost, getPluginQuickJS, installRealm, LogRing, Sandbox } from "@orb/server/infra/plugin-host";
import type { QuickJSContext } from "quickjs-emscripten-core";
import { isFail } from "quickjs-emscripten-core";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

const FIXED_EPOCH = 1_700_000_000_000;
const CHAT_A = "chat_aaaa000000000000000000000" as ChatId;
const CHAT_B = "chat_bbbb000000000000000000000" as ChatId;
const LONG = 30_000;

function makeSeams(seed = 1): HostSeams {
  let state = seed;
  let counter = 0;
  return {
    nowEpochMs: (): number => FIXED_EPOCH,
    nextRandom: (): number => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state / 2_147_483_648;
    },
    mintId: (): string => `id-${counter++}`,
  };
}

function makeHost(): ReturnType<typeof createPluginHost> {
  return createPluginHost(makeSeams());
}

/** Install a realm on a fresh context (caller disposes). */
async function realmContext(): Promise<QuickJSContext> {
  const mod = await getPluginQuickJS();
  const ctx = mod.newContext();
  installRealm(ctx, makeSeams(), new LogRing());
  return ctx;
}

/** Eval a string-returning guest expression; throws if the guest itself errored (a corpus payload must run). */
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

// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// 1. SANDBOX ESCAPE — the constructor/eval/Function walks reach ONLY the guest's own realm.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("escape — realm walks reach only the guest global, never a host reference", () => {
  test("the constructor-chain Function escape resolves to the GUEST globalThis (not a host global)", async () => {
    const ctx = await realmContext();
    try {
      // The classic sandbox-break: ({}).constructor.constructor === Function; call it to build a fn in the guest
      // realm. Its globalThis IS the guest global — a sandboxed realm with `orb` and NO host/Node authority.
      expect(evalString(ctx, "String(({}).constructor.constructor('return globalThis')() === globalThis)")).toBe("true");
      // orb IS present on that global (the one intended entry); host/Node ambient authority is NOT reachable.
      expect(evalString(ctx, "String(({}).constructor.constructor('return typeof globalThis.orb')())")).toBe("object");
      const hostRefs = "['process','require','global','Buffer','module','__dirname','fetch','XMLHttpRequest']";
      expect(evalString(ctx, `${hostRefs}.map((k) => (new Function('return typeof globalThis[' + JSON.stringify(k) + ']'))()).join(',')`)).toBe(
        "undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined",
      );
    } finally {
      ctx.dispose();
    }
  });

  test("eval + Function are reachable but operate ONLY on the guest realm", async () => {
    const ctx = await realmContext();
    try {
      // eval/Function are NOT deleted (they carry no host authority in QuickJS — a fresh WASM realm). They evaluate
      // guest code against the guest global; they cannot manufacture a host reference that does not already exist.
      expect(evalString(ctx, "String(eval('1 + 2'))")).toBe("3");
      expect(evalString(ctx, "String((new Function('return globalThis'))() === globalThis)")).toBe("true");
      // Even an eval that tries to reach the host clock hits the throwing ambient Date stub, not a real one. The
      // guest Date-constructor source is assembled by string concatenation so the determinism gate's line scan
      // (which polices the TEST's own clock, not this guest payload) doesn't false-positive on it.
      expect(evalString(ctx, "try { eval('new Date' + '()'); 'NO-THROW' } catch (e) { 'threw' }")).toBe("threw");
    } finally {
      ctx.dispose();
    }
  });

  test("the guest global set differs from a bare context by EXACTLY {orb} (a real set-diff, not a typeof spot-check)", async () => {
    const mod = await getPluginQuickJS();
    const bare = mod.newContext();
    const realm = mod.newContext();
    try {
      installRealm(realm, makeSeams(), new LogRing());
      const namesOf = (ctx: QuickJSContext): Set<string> => new Set(evalString(ctx, "Object.getOwnPropertyNames(globalThis).join(',')").split(","));
      const bareNames = namesOf(bare);
      const realmNames = namesOf(realm);
      const added = [...realmNames].filter((n) => !bareNames.has(n));
      const removed = [...bareNames].filter((n) => !realmNames.has(n));
      // installRealm ADDS exactly `orb` and REMOVES nothing — Date/Math are overwritten in place (throwing stubs),
      // not new globals. So the ONLY non-standard name a guest can enumerate is `orb`.
      expect(added).toEqual(["orb"]);
      expect(removed).toEqual([]);
    } finally {
      bare.dispose();
      realm.dispose();
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// 2. PROTOTYPE POLLUTION — a guest `__proto__` payload cannot mutate a HOST object across the boundary.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("escape — prototype pollution does not cross the membrane", () => {
  test("a guest __proto__ payload dumped host-side lands as an OWN key and never touches host Object.prototype", async () => {
    const ctx = await realmContext();
    try {
      const before = (Object.prototype as Record<string, unknown>)["__polluted__"];
      const result = ctx.evalCode('JSON.parse(\'{"__proto__":{"__polluted__":true},"real":1}\')');
      if (isFail(result)) {
        result.error.dispose();
        throw new Error("guest failed to build the payload");
      }
      const dumped = ctx.dump(result.value) as Record<string, unknown>;
      result.value.dispose();
      // The payload crosses as INERT DATA: `__proto__` is a plain own key (JSON.parse never walks the prototype),
      // so nothing is assigned to the host's Object.prototype — a fresh host object stays clean.
      expect(Object.keys(dumped).sort()).toEqual(["__proto__", "real"]);
      expect((Object.prototype as Record<string, unknown>)["__polluted__"]).toBe(before);
      expect(Object.hasOwn({}, "__polluted__")).toBe(false);
    } finally {
      ctx.dispose();
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// 3. MARSHALLING — the INBOUND (guest→host arg) boundary admits no live reference. marshal.test pins the
//    OUTBOUND (host→guest result) collapse; this pins the mirror: a guest cannot smuggle a callable/live ref
//    into a host-fn body via an argument (the host sees only dead, structured-clone-safe data).
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("escape — the guest→host argument boundary is inert (no callable/live ref crosses)", () => {
  /** A bridge that CAPTURES the raw ops the membrane forwarded to applyVariableOps (host authority granted). */
  function capturingBridge(): { bridge: PluginBridge; captured: { ops: readonly unknown[] | null } } {
    const captured: { ops: readonly unknown[] | null } = { ops: null };
    const bridge: PluginBridge = {
      chat: {
        listMessages: () => Promise.resolve([]),
        getVariables: () => Promise.resolve({ tension: "4" }),
        applyVariableOps: (_chatId, ops) => {
          captured.ops = ops as readonly unknown[];
          return Promise.resolve();
        },
        requestTurn: () => Promise.resolve(),
      },
      worldInfo: { upsertEntry: () => Promise.resolve() },
      imagery: { generatePicture: () => Promise.resolve({ assetId: "asset_x0000000000000000000000" }) },
      variables: { get: () => Promise.resolve(null), set: () => Promise.resolve(), delete: () => Promise.resolve() },
      storage: { get: () => Promise.resolve(null), set: () => Promise.resolve(), delete: () => Promise.resolve(), list: () => Promise.resolve([]) },
      notifications: { post: () => Promise.resolve() },
      surfaceQuickReply: () => Promise.resolve(),
    };
    return { bridge, captured };
  }

  test("a function / arrow smuggled inside an argument reaches the host as inert data, never a callable", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge, captured } = capturingBridge();
    // The op carries function-valued fields; if the membrane leaked a live guest callable the host would receive a
    // function it could invoke back into the guest. It must instead see dead data (dropped / stringified).
    const main =
      "const h = orb.host(1); h.chat.applyVariableOps(h.chat.current(), [{ op: 'set', key: 'k', value: 'v', leak: function(){ return 'pwn'; }, arrow: () => 'pwn' }]).then(() => h.log.info('done'));";
    const outcome = await host.createInstance({
      mainJs: main,
      grants: ["chat.read", "chat.variables.write"],
      bridge,
      chat: { chatId: CHAT_A, canWrite: true, automationDepth: 0 },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const op = (captured.ops?.[0] ?? {}) as Record<string, unknown>;
    expect(op["op"]).toBe("set");
    expect(op["key"]).toBe("k");
    // No live callable crossed — every value the host received is non-function.
    for (const value of Object.values(op)) {
      expect(typeof value).not.toBe("function");
    }
    host.dispose(outcome.instance);
  });

  test("a throwing getter on an argument is contained host-side (dump cannot be weaponized into a host crash)", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = capturingBridge();
    // A guest getter that throws while the host marshals the argument must NOT escape as a host exception; the call
    // completes (the guest's own code ran during dump and was contained), the process stays healthy.
    const main =
      "const h = orb.host(1); const evil = {}; Object.defineProperty(evil, 'boom', { enumerable: true, get(){ throw new Error('getter-boom'); } }); h.chat.applyVariableOps(h.chat.current(), [evil]).then(() => h.log.info('survived')).catch(() => h.log.info('survived'));";
    const outcome = await host.createInstance({
      mainJs: main,
      grants: ["chat.read", "chat.variables.write"],
      bridge,
      chat: { chatId: CHAT_A, canWrite: true, automationDepth: 0 },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    // Either branch logs "survived"; the point is the host never threw out of the marshalling boundary.
    expect(host.readLog(outcome.instance).some((l) => l.message === "survived")).toBe(true);
    host.dispose(outcome.instance);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// 4. HANDLE FORGERY — the single-chat-per-invocation invariant. A token minted for one invocation is DEAD in
//    the next (a fresh CSPRNG token per scope), so a resident plugin cannot hoard a handle to read a chat it
//    once saw after the scope moves. (The forged-string + CSPRNG-shape pins live in port.test/membrane.test.)
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("escape — a stale chat handle cannot read a prior/other chat (single-chat-per-invocation)", () => {
  test("a resident tool that hoards invocation A's token cannot use it during invocation B — no cross-chat read", { timeout: LONG }, async () => {
    const host = makeHost();
    let seen: ChatId | null = null;
    const bridge: PluginBridge = {
      chat: {
        listMessages: () => Promise.resolve([]),
        getVariables: (chatId) => {
          seen = chatId;
          return Promise.resolve({ which: String(chatId) });
        },
        applyVariableOps: () => Promise.resolve(),
        requestTurn: () => Promise.resolve(),
      },
      worldInfo: { upsertEntry: () => Promise.resolve() },
      imagery: { generatePicture: () => Promise.resolve({ assetId: "asset_x0000000000000000000000" }) },
      variables: { get: () => Promise.resolve(null), set: () => Promise.resolve(), delete: () => Promise.resolve() },
      storage: { get: () => Promise.resolve(null), set: () => Promise.resolve(), delete: () => Promise.resolve(), list: () => Promise.resolve([]) },
      notifications: { post: () => Promise.resolve() },
      surfaceQuickReply: () => Promise.resolve(),
    };
    // First call stashes the token into the resident guest global; second call replays the STALE token.
    const main = `
      const h = orb.host(1);
      h.tools.register({
        name: "probe",
        description: "d",
        parameters: { type: "object", properties: {} },
        handler: async () => {
          if (!globalThis.__stash) { globalThis.__stash = h.chat.current(); return "stashed"; }
          try { const v = await h.chat.getVariables(globalThis.__stash); return "LEAKED:" + v.which; }
          catch (e) { return "blocked:" + e.message; }
        },
      });
      'ok';`;
    const outcome = await host.createInstance({ mainJs: main, grants: ["tools.register", "chat.read"], bridge, chat: null });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const ref = outcome.instance.tools[0]?.handler;
    if (ref === undefined) {
      throw new Error("no handler ref");
    }
    // Invocation A scoped to CHAT_A — the tool stashes A's token.
    expect(await host.invoke(outcome.instance, ref, "{}", { chatId: CHAT_A, canWrite: false, automationDepth: 0 })).toBe("stashed");
    // Invocation B scoped to CHAT_B — the token minted for A (still held by the guest) is now stale (≠ B's token),
    // so the read is REFUSED at the boundary before the bridge is ever reached. No cross-chat read of A or B.
    const second = await host.invoke(outcome.instance, ref, "{}", { chatId: CHAT_B, canWrite: false, automationDepth: 0 });
    expect(second).toContain("blocked");
    expect(second).toContain("invalid chat handle");
    expect(seen).toBeNull(); // the bridge was NEVER reached with a stale handle
    host.dispose(outcome.instance);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// 5. RESOURCE — the concurrency cap + the monotonic-clock DoS kill + the multi-pending teardown drain.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("escape — resource ceilings hold under adversarial load", () => {
  /** Assert no unhandled rejection escapes while a late host settle is dropped by the alive guard. */
  async function withNoUnhandledRejection(fn: () => Promise<void>): Promise<void> {
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      rejections.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      await fn();
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
    expect(rejections).toEqual([]);
  }

  test("the 33rd concurrent host call is rejected (≤32 in-flight cap) and the 32 pending drain cleanly at dispose", { timeout: LONG }, async () => {
    const host = makeHost();
    let release!: (v: Record<string, string>) => void;
    const gate = new Promise<Record<string, string>>((r) => {
      release = r;
    });
    const bridge: PluginBridge = {
      chat: {
        listMessages: () => Promise.resolve([]),
        getVariables: () => gate,
        applyVariableOps: () => Promise.resolve(),
        requestTurn: () => Promise.resolve(),
      },
      worldInfo: { upsertEntry: () => Promise.resolve() },
      imagery: { generatePicture: () => Promise.resolve({ assetId: "asset_x0000000000000000000000" }) },
      variables: { get: () => Promise.resolve(null), set: () => Promise.resolve(), delete: () => Promise.resolve() },
      storage: { get: () => Promise.resolve(null), set: () => Promise.resolve(), delete: () => Promise.resolve(), list: () => Promise.resolve([]) },
      notifications: { post: () => Promise.resolve() },
      surfaceQuickReply: () => Promise.resolve(),
    };
    // Fire 40 gated host calls in ONE invocation; the gate never settles during it. 32 are admitted (stay pending),
    // calls 33–40 reject synchronously with the back-pressure error → exactly 8 rejections.
    const main = `
      const h = orb.host(1);
      let rejected = 0;
      for (let i = 0; i < 40; i++) {
        h.chat.getVariables(h.chat.current()).catch((e) => { if (String(e.message).indexOf('too many concurrent') >= 0) rejected++; });
      }
      Promise.resolve().then(() => h.log.info('rejected:' + rejected));
      'done';`;
    const outcome = await host.createInstance({ mainJs: main, grants: ["chat.read"], bridge, chat: { chatId: CHAT_A, canWrite: true, automationDepth: 0 } });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(host.readLog(outcome.instance).some((l) => l.message === "rejected:8")).toBe(true);
    // 32 host calls are STILL pending (gate unreleased). Disposing must drain all of them without aborting the
    // shared WASM module — the multi-pending generalization of port.test's single fire-and-forget drain.
    await withNoUnhandledRejection(async () => {
      host.dispose(outcome.instance);
      release({ tension: "1" });
      await gate;
    });
  });

  test("net.fetch cannot escape its manifest netHosts wall — a guest-controlled URL to an undeclared host is refused", { timeout: LONG }, async () => {
    // The SSRF containment claim: net.fetch is host-performed through safeFetch pinned to the MANIFEST netHosts,
    // never a guest-supplied allowlist. A hostile guest with the grant + a fully guest-controlled URL still
    // cannot reach a host it did not declare (blocked at the allowlist BEFORE any DNS/connect — hermetic), and
    // an https→http scheme downgrade to a DECLARED host is refused too. The URL is the guest's; the wall is not.
    const host = makeHost();
    const bridge: PluginBridge = {
      chat: {
        listMessages: () => Promise.resolve([]),
        getVariables: () => Promise.resolve({}),
        applyVariableOps: () => Promise.resolve(),
        requestTurn: () => Promise.resolve(),
      },
      worldInfo: { upsertEntry: () => Promise.resolve() },
      imagery: { generatePicture: () => Promise.resolve({ assetId: "asset_x0000000000000000000000" }) },
      variables: { get: () => Promise.resolve(null), set: () => Promise.resolve(), delete: () => Promise.resolve() },
      storage: { get: () => Promise.resolve(null), set: () => Promise.resolve(), delete: () => Promise.resolve(), list: () => Promise.resolve([]) },
      notifications: { post: () => Promise.resolve() },
      surfaceQuickReply: () => Promise.resolve(),
    };
    const main = `
      const h = orb.host(1);
      Promise.all([
        h.net.fetch("https://169.254.169.254/latest/meta-data/").then(() => "REACHED-metadata").catch((e) => "blocked:" + e.message),
        h.net.fetch("https://internal.evil/steal").then(() => "REACHED-evil").catch((e) => "blocked:" + e.message),
        h.net.fetch("http://api.allowed.test/x").then(() => "REACHED-downgrade").catch((e) => "blocked:" + e.message),
      ]).then((r) => h.log.info("net:" + JSON.stringify(r)));`;
    // Only api.allowed.test is declared; a link-local IP literal, an undeclared host, and an http downgrade are all walled.
    const outcome = await host.createInstance({ mainJs: main, grants: ["net.fetch"], bridge, chat: null, netHosts: ["api.allowed.test"] });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const line = host.readLog(outcome.instance).find((l) => l.message.startsWith("net:"));
    const results = JSON.parse(line?.message.slice("net:".length) ?? "[]") as string[];
    expect(results.every((r) => r.startsWith("blocked:"))).toBe(true);
    expect(results.some((r) => r.includes("REACHED"))).toBe(false);
    host.dispose(outcome.instance);
  });

  test("turn.trigger cannot fund a FOREIGN budget — a guest cannot name/forge the funder, only (admitted chatId, depth+1, hints) cross", {
    timeout: LONG,
  }, async () => {
    // The authority-blind claim: the FUNDER (installer) is closed over DOMAIN-SIDE; the membrane forwards ONLY
    // (chatId, childDepth, hints) to bridge.chat.requestTurn. A hostile guest that smuggles extra args — a forged
    // funder id, a spoofed depth, a foreign chat id — changes NONE of that: the chatId is the ADMITTED token's
    // (a forged handle fails resolution), the depth is the host-stamped invocation-depth+1 (not guest-supplied),
    // and no funder crosses at all. So a plugin can never fund a turn on a budget it doesn't own.
    const host = makeHost();
    const seen: { args: readonly unknown[] } = { args: [] };
    const bridge: PluginBridge = {
      chat: {
        listMessages: () => Promise.resolve([]),
        getVariables: () => Promise.resolve({}),
        applyVariableOps: () => Promise.resolve(),
        requestTurn: (chatId, automationDepth, p) => {
          seen.args = [chatId, automationDepth, p];
          return Promise.resolve();
        },
      },
      worldInfo: { upsertEntry: () => Promise.resolve() },
      imagery: { generatePicture: () => Promise.resolve({ assetId: "asset_x0000000000000000000000" }) },
      variables: { get: () => Promise.resolve(null), set: () => Promise.resolve(), delete: () => Promise.resolve() },
      storage: { get: () => Promise.resolve(null), set: () => Promise.resolve(), delete: () => Promise.resolve(), list: () => Promise.resolve([]) },
      notifications: { post: () => Promise.resolve() },
      surfaceQuickReply: () => Promise.resolve(),
    };
    // The guest passes a MALICIOUS 3rd+ arg (a forged funder) + a spoofed depth field on the hints — all ignored.
    const main =
      "const h = orb.host(1); h.chat.requestTurn(h.chat.current(), { guided: 'x', funderUserId: 'user_ATTACKER', automationDepth: 0 }, 'user_ATTACKER', 999).then(() => h.log.info('done'));";
    const outcome = await host.createInstance({
      mainJs: main,
      grants: ["chat.read", "turn.trigger"],
      bridge,
      chat: { chatId: CHAT_A, canWrite: true, automationDepth: 1 },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    // Exactly (admitted chatId, host-stamped depth 1+1=2, projected hints) — no funder arg, no attacker id anywhere.
    expect(seen.args).toHaveLength(3);
    expect(seen.args[0]).toBe(CHAT_A);
    expect(seen.args[1]).toBe(2);
    expect(seen.args[2]).toEqual({ guided: "x" }); // funderUserId + automationDepth on the hints are dropped by the projection
    expect(JSON.stringify(seen.args)).not.toContain("ATTACKER");
    host.dispose(outcome.instance);
  });

  test("a busy loop that reads the (frozen) guest clock still dies at the DoS deadline — the interrupt is a MONOTONIC real clock", {
    timeout: LONG,
  }, async () => {
    // Sharp edge #3: the DoS interrupt reads a monotonic real clock (performance.now), NOT the guest's injected seam.
    // A guest that hammers its own frozen clock in a tight loop cannot stall the kill — freezing time is not a DoS.
    const sandbox = await Sandbox.create(makeSeams(), { limits: { cpuDeadlineMs: 150 } });
    try {
      const outcome = await sandbox.evalGuest("const h = orb.host(1); while (true) { h.clock.nowEpochMs(); }");
      expect(outcome.ok).toBe(false);
      expect(outcome.error?.message).toContain("interrupted");
    } finally {
      sandbox.dispose();
    }
  });
});
