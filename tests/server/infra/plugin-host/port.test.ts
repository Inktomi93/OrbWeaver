// infra/plugin-host/port + membrane — the PluginHostPort impl over the Sandbox (P4b-CORE). Proves the membrane
// end-to-end against the REAL QuickJS runtime with a fake `PluginBridge`: the determinism-floor run + log
// capture; the capability gate (an ungranted namespace call rejects); the opaque-handle resolution (a forged
// chat handle fails, no read); the host-authority write ceiling (a non-host `chat.variables.write` refused); and
// the RESIDENT-HANDLER runtime (a guest tool registered at activation round-trips through `invoke`). The
// composed-real router test covers the domain wiring; this is the runtime mirror + the security-gate pins.

import process from "node:process";
import type { InvocationChat, PluginBridge, PluginCapability, PluginHandlerRef, PluginInstance } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import type { HostSeams } from "@orb/server/infra/plugin-host";
import { createPluginHost, Sandbox } from "@orb/server/infra/plugin-host";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

const FIXED_EPOCH = 1_700_000_000_000;
const CHAT = "chat_test0000000000000000000" as ChatId;
const LONG = 30_000;
const COUNTER_ID_RE = /^id-\d+$/u;
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const INBOUND_CAP_RE = /inbound cap/u;
const QUEUE_FULL_RE = /queue full/u;
const HANDLER_BOOM_RE = /handler boom/u;

/** The concurrency-belt witness guest (a resident tool): (1) await a HUNG getVariables — returns control to the
 *  event loop mid-invocation, opening the race window; (2) requestTurn — forwards ITS invocation's
 *  automationDepth+1 to the bridge witness. Without per-instance serialization, a second concurrent invoke
 *  mutates the shared invocation-chat scope during the await, so the resumed handler reads the WRONG depth. */
const RACING_TOOL_SRC = `
  const h = orb.host(1);
  h.tools.register({
    name: "race",
    description: "await a hung host call, then requestTurn (stamps this invocation's depth+1)",
    parameters: { type: "object", properties: {} },
    handler: async () => {
      await h.chat.getVariables(h.chat.current());
      await h.chat.requestTurn(h.chat.current());
      return "done";
    },
  });
  'ok';`;

const RACING_GRANTS: readonly PluginCapability[] = ["tools.register", "chat.read", "turn.trigger"];

/** Spin the macrotask queue a few ticks so a mid-flight guest handler reaches its awaited (gated) host call. */
function settleTicks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

/** The concurrency-belt witness bridge: `getVariables` blocks on a per-call gate the test releases (opening the
 *  race window mid-invocation), and `requestTurn` records the depth each invocation forwarded (= that
 *  invocation's `automationDepth + 1`) — the clobber witness. FIFO release order mirrors the serialized run. */
interface RacingBridge {
  readonly bridge: PluginBridge;
  readonly gates: ((v: Record<string, string>) => void)[];
  readonly releaseNext: (v: Record<string, string>) => void;
  readonly forwardedDepths: number[];
}
function racingBridge(): RacingBridge {
  const base = fakeBridge().bridge;
  const gates: ((v: Record<string, string>) => void)[] = [];
  const forwardedDepths: number[] = [];
  const bridge: PluginBridge = {
    ...base,
    chat: {
      ...base.chat,
      getVariables: () =>
        new Promise<Record<string, string>>((resolve) => {
          gates.push(resolve);
        }),
      requestTurn: (_chatId, automationDepth) => {
        forwardedDepths.push(automationDepth);
        return Promise.resolve();
      },
    },
  };
  const releaseNext = (v: Record<string, string>): void => {
    const g = gates.shift();
    if (g === undefined) {
      throw new Error("test: no gated getVariables to release");
    }
    g(v);
  };
  return { bridge, gates, releaseNext, forwardedDepths };
}

/** Activate a RESIDENT instance whose one tool is the racing witness (await a hung host call, then requestTurn). */
async function residentRaceTool(host: ReturnType<typeof createPluginHost>, bridge: PluginBridge): Promise<{ instance: PluginInstance; ref: PluginHandlerRef }> {
  const outcome = await host.createInstance({ mainJs: RACING_TOOL_SRC, grants: [...RACING_GRANTS], bridge, chat: noChat });
  if (!outcome.ok) {
    throw new Error(`activation failed: ${outcome.error}`);
  }
  const ref = outcome.instance.tools[0]?.handler;
  if (ref === undefined) {
    throw new Error("no handler ref");
  }
  return { instance: outcome.instance, ref };
}

/** Serially drain `count` queued invokes: the next queued invoke starts only after the prior settles, so wait for
 *  its gated getVariables to appear, then release it — advancing the per-instance tail one item at a time. */
async function drainGatedInvokes(fake: RacingBridge, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential drain BY DESIGN — the FIFO admits the next queued invoke only after the prior settles, so each gate must be awaited before releasing the next.
    await waitForGate(fake);
    fake.releaseNext({ tension: "ok" });
  }
}

/** Resolve once at least one gated getVariables is pending (a bounded poll — the queued invoke needs a few
 *  macrotask ticks after the prior settles to reach its awaited host call). */
async function waitForGate(fake: RacingBridge): Promise<void> {
  for (let spins = 0; spins < 200 && fake.gates.length === 0; spins++) {
    // biome-ignore lint/performance/noAwaitInLoops: a readiness poll is sequential by nature — each tick must complete before re-checking the gate.
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Deterministic seams (a fixed clock, a seeded LCG, a counter id) — shared by `makeHost` + the direct-Sandbox
 *  repro-guard test (which drives the pre-fix unserialized path over an exported `Sandbox`). */
function makeSeams(): HostSeams {
  let state = 1;
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

/** A production-shaped host over deterministic seams. */
function makeHost(): ReturnType<typeof createPluginHost> {
  return createPluginHost(makeSeams());
}

/** A fake op bridge with in-memory global-KV + a fixed chat var fold; counts variable / worldInfo / imagery
 *  writes for assertions (each is a host-gated bridge call the membrane only reaches after its canWrite gate). */
function fakeBridge(): {
  bridge: PluginBridge;
  kv: Map<string, string>;
  store: Map<string, string>;
  notices: { recipient: "host" | "all_members"; message: string }[];
  chips: { label: string; sendText: string }[][];
  writes: { count: number };
  lore: { count: number };
  pics: { count: number };
  turns: { count: number; lastDepth: number; args: readonly unknown[] };
} {
  const kv = new Map<string, string>([["greeting", "hello-from-kv"]]);
  // The plugin-PRIVATE store the bridge closes pluginId/installer over (the fake models it as a flat map — the
  // real cross-plugin isolation is proven in the composed-real domain test, not this runtime mirror).
  const store = new Map<string, string>();
  const notices: { recipient: "host" | "all_members"; message: string }[] = [];
  const chips: { label: string; sendText: string }[][] = [];
  const writes = { count: 0 };
  const lore = { count: 0 };
  const pics = { count: 0 };
  // requestTurn records the args the membrane forwarded — the fake bridge receives ONLY (chatId, depth, p); the
  // FUNDER is closed over domain-side, so its absence here IS the "infra stays authority-blind" proof.
  const turns: { count: number; lastDepth: number; args: readonly unknown[] } = { count: 0, lastDepth: -1, args: [] };
  const bridge: PluginBridge = {
    chat: {
      listMessages: () => Promise.resolve([{ id: "m1", role: "user", authorDisplayName: "U", characterId: null, seq: 1, content: "hi" }]),
      getVariables: () => Promise.resolve({ tension: "4" }),
      applyVariableOps: () => {
        writes.count += 1;
        return Promise.resolve();
      },
      requestTurn: (chatId, automationDepth, p) => {
        turns.count += 1;
        turns.lastDepth = automationDepth;
        turns.args = [chatId, automationDepth, p];
        return Promise.resolve();
      },
    },
    worldInfo: {
      upsertEntry: () => {
        lore.count += 1;
        return Promise.resolve();
      },
    },
    imagery: {
      generatePicture: () => {
        pics.count += 1;
        return Promise.resolve({ assetId: "asset_generated0000000000000" });
      },
    },
    variables: {
      get: (key) => Promise.resolve(kv.get(key) ?? null),
      set: (key, value) => {
        kv.set(key, value);
        return Promise.resolve();
      },
      delete: (key) => {
        kv.delete(key);
        return Promise.resolve();
      },
    },
    storage: {
      get: (key) => Promise.resolve(store.get(key) ?? null),
      set: (key, value) => {
        store.set(key, value);
        return Promise.resolve();
      },
      delete: (key) => {
        store.delete(key);
        return Promise.resolve();
      },
      list: (prefix) => Promise.resolve([...store.keys()].filter((k) => prefix === undefined || k.startsWith(prefix)).sort()),
    },
    notifications: {
      post: (_chatId, recipient, message) => {
        notices.push({ recipient, message });
        return Promise.resolve();
      },
    },
    surfaceQuickReply: (_chatId, choices) => {
      chips.push(choices.map((c) => ({ label: c.label, sendText: c.sendText })));
      return Promise.resolve();
    },
  };
  return { bridge, kv, store, notices, chips, writes, lore, pics, turns };
}

const noChat: InvocationChat | null = null;

describe("createPluginHost — activation + determinism floor", () => {
  test("createInstance runs main.js + captures its log ring; readLog snapshots it", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const outcome = await host.createInstance({ mainJs: "orb.host(1).log.info('booted'); 'ok';", grants: [], bridge, chat: noChat });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const log = host.readLog(outcome.instance);
    expect(log.some((l) => l.level === "info" && l.message === "booted" && l.at === FIXED_EPOCH)).toBe(true);
    expect(outcome.instance.tools).toEqual([]);
    host.dispose(outcome.instance);
  });

  test("a throwing main.js is a CONTAINED failure (ok:false, not a host crash)", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const outcome = await host.createInstance({ mainJs: "throw new Error('boom');", grants: [], bridge, chat: noChat });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.error).toContain("boom");
  });
});

describe("membrane — capability gate + global_vars", () => {
  test("a granted global_vars read reaches the bridge", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const main = "orb.host(1).variables.get('greeting').then((v) => orb.host(1).log.info('got:' + v));";
    const outcome = await host.createInstance({ mainJs: main, grants: ["global_vars"], bridge, chat: noChat });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(host.readLog(outcome.instance).some((l) => l.message === "got:hello-from-kv")).toBe(true);
    host.dispose(outcome.instance);
  });

  test("an UNGRANTED namespace call rejects (capability gate)", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    // No grants → variables.get rejects; the guest catches + logs the refusal.
    const main = "orb.host(1).variables.get('greeting').catch((e) => orb.host(1).log.error('denied:' + e.message));";
    const outcome = await host.createInstance({ mainJs: main, grants: [], bridge, chat: noChat });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(host.readLog(outcome.instance).some((l) => l.level === "error" && l.message.includes("global_vars"))).toBe(true);
    host.dispose(outcome.instance);
  });

  test("grants are guest-readable (feature-detection surface)", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const main = "orb.host(1).log.info('g:' + JSON.stringify(orb.host(1).grants));";
    const outcome = await host.createInstance({ mainJs: main, grants: ["global_vars", "chat.read"], bridge, chat: noChat });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(host.readLog(outcome.instance).some((l) => l.message.includes("global_vars") && l.message.includes("chat.read"))).toBe(true);
    host.dispose(outcome.instance);
  });
});

describe("membrane — chat authority + opaque handles", () => {
  const grants = ["chat.read", "chat.variables.write"] as const;

  test("a granted chat.read resolves the admitted handle + reaches the bridge", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const main = "const h = orb.host(1); h.chat.getVariables(h.chat.current()).then((v) => h.log.info('tension:' + v.tension));";
    const outcome = await host.createInstance({ mainJs: main, grants: [...grants], bridge, chat: { chatId: CHAT, canWrite: true, automationDepth: 0 } });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(host.readLog(outcome.instance).some((l) => l.message === "tension:4")).toBe(true);
    host.dispose(outcome.instance);
  });

  test("the chat handle token is minted independently of the guest id counter (INFO-3 CSPRNG)", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    // The guest advances the id seam (id-0, id-1, …) BEFORE reading its chat handle. The handle is a SECURITY
    // token and MUST NOT be drawn from that same guest-callable counter — a distinct CSPRNG mints it, so a
    // seeded/deterministic `mintId` can never make the token predictable. A UUID-shaped token that is not a
    // counter id proves the source is independent.
    const main = "const h = orb.host(1); h.ids.mint(); h.ids.mint(); h.ids.mint(); h.log.info('tok:' + h.chat.current());";
    const outcome = await host.createInstance({ mainJs: main, grants: [...grants], bridge, chat: { chatId: CHAT, canWrite: true, automationDepth: 0 } });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const line = host.readLog(outcome.instance).find((l) => l.message.startsWith("tok:"));
    const token = line?.message.slice("tok:".length);
    expect(token).toBeDefined();
    // Not drawn from the guest id counter (`id-0`…`id-3`) — independent source.
    expect(token).not.toMatch(COUNTER_ID_RE);
    // node:crypto randomUUID shape (v4) — a dedicated CSPRNG, not the seams.
    expect(token).toMatch(UUID_V4_RE);
    host.dispose(outcome.instance);
  });

  test("a FORGED chat handle fails resolution (no read)", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const main = "orb.host(1).chat.getVariables('forged-handle').catch((e) => orb.host(1).log.error('h:' + e.message));";
    const outcome = await host.createInstance({ mainJs: main, grants: [...grants], bridge, chat: { chatId: CHAT, canWrite: true, automationDepth: 0 } });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(host.readLog(outcome.instance).some((l) => l.message.includes("invalid chat handle"))).toBe(true);
    host.dispose(outcome.instance);
  });

  test("a NON-HOST caller's variable write is refused (host authority ceiling)", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = fakeBridge();
    const main =
      "const h = orb.host(1); h.chat.applyVariableOps(h.chat.current(), [{op:'set',key:'x',value:'1'}]).catch((e) => h.log.error('w:' + e.message));";
    const outcome = await host.createInstance({
      mainJs: main,
      grants: [...grants],
      bridge: fake.bridge,
      chat: { chatId: CHAT, canWrite: false, automationDepth: 0 },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(host.readLog(outcome.instance).some((l) => l.message.includes("host authority"))).toBe(true);
    expect(fake.writes.count).toBe(0);
    host.dispose(outcome.instance);
  });

  test("a HOST caller's variable write reaches the bridge", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = fakeBridge();
    const main = "const h = orb.host(1); h.chat.applyVariableOps(h.chat.current(), [{op:'set',key:'x',value:'1'}]).then(() => h.log.info('wrote'));";
    const outcome = await host.createInstance({
      mainJs: main,
      grants: [...grants],
      bridge: fake.bridge,
      chat: { chatId: CHAT, canWrite: true, automationDepth: 0 },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(fake.writes.count).toBe(1);
    host.dispose(outcome.instance);
  });
});

describe("membrane — every gated namespace is present (the P4b-tail is now LIVE)", () => {
  test("every gated namespace present + the P4b-tail methods (storage/notify/quickReply)", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    // With EVERY capability granted the realm exposes the FULL set: storage.kv / notify / chat.quick_reply are no
    // longer absent — their ops are composed (the bridge closes pluginId/installer over them). A guest
    // feature-detects on the namespace/method presence + `h.grants`.
    const allGrants = [
      "chat.read",
      "chat.variables.write",
      "chat.quick_reply",
      "global_vars",
      "tools.register",
      "worldinfo.write",
      "imagery.generate",
      "notify",
      "storage.kv",
      "events.subscribe",
      "chat.transform",
      "net.fetch",
    ] as const;
    const main =
      "const h = orb.host(1); const has = (k) => k in h; orb.host(1).log.info(JSON.stringify({ chat: has('chat'), variables: has('variables'), tools: has('tools'), grants: Array.isArray(h.grants), worldInfo: has('worldInfo'), imagery: has('imagery'), storage: has('storage'), notifications: has('notifications'), events: has('events'), transforms: has('transforms'), net: has('net'), requestTurn: typeof h.chat.requestTurn === 'function', surfaceQuickReply: typeof h.chat.surfaceQuickReply === 'function', storageGet: typeof h.storage.get === 'function', notifyPost: typeof h.notifications.post === 'function' }));";
    const outcome = await host.createInstance({ mainJs: main, grants: [...allGrants], bridge, chat: { chatId: CHAT, canWrite: true, automationDepth: 0 } });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const line = host.readLog(outcome.instance).find((l) => l.message.startsWith("{"));
    expect(line).toBeDefined();
    expect(JSON.parse(line?.message ?? "{}")).toEqual({
      chat: true,
      variables: true,
      tools: true,
      grants: true,
      worldInfo: true,
      imagery: true,
      storage: true, // storage.kv — now installed (plugin-private KV)
      notifications: true, // notify — now installed (participant-only durable notice)
      events: true,
      transforms: true,
      net: true,
      requestTurn: true,
      surfaceQuickReply: true, // chat.quick_reply — now installed
      storageGet: true,
      notifyPost: true,
    });
    host.dispose(outcome.instance);
  });
});

describe("membrane — chat.requestTurn (turn.trigger): capability + host-authority + depth-stamp + authority-blind funder", () => {
  test("a HOST caller's granted requestTurn reaches the bridge with childDepth = invocation depth + 1", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = fakeBridge();
    const main =
      "const h = orb.host(1); h.chat.requestTurn(h.chat.current(), { speakerCharacterId: 'char_x', guided: 'be brief' }).then(() => h.log.info('requested'));";
    // Invocation context depth = 2 → the requested child turn must stamp 3 (= the hard cap); the bridge fake
    // receives ONLY (chatId, depth, hints) — no funder arg (the installer is closed over domain-side).
    const outcome = await host.createInstance({
      mainJs: main,
      grants: ["chat.read", "turn.trigger"],
      bridge: fake.bridge,
      chat: { chatId: CHAT, canWrite: true, automationDepth: 2 },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(fake.turns.count).toBe(1);
    expect(fake.turns.lastDepth).toBe(3); // 2 + 1 — the cascade-depth loop belt
    expect(fake.turns.args[0]).toBe(CHAT);
    expect(fake.turns.args[2]).toEqual({ speakerCharacterId: "char_x", guided: "be brief" });
    host.dispose(outcome.instance);
  });

  test("requestTurn WITHOUT the turn.trigger grant rejects (capability gate) — bridge never called", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = fakeBridge();
    const main = "const h = orb.host(1); h.chat.requestTurn(h.chat.current()).catch((e) => h.log.error('t:' + e.message));";
    const outcome = await host.createInstance({
      mainJs: main,
      grants: ["chat.read"],
      bridge: fake.bridge,
      chat: { chatId: CHAT, canWrite: true, automationDepth: 0 },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(host.readLog(outcome.instance).some((l) => l.message.includes("turn.trigger"))).toBe(true);
    expect(fake.turns.count).toBe(0);
    host.dispose(outcome.instance);
  });

  test("a NON-HOST caller's requestTurn is refused by the host-authority ceiling (bridge never called)", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = fakeBridge();
    const main = "const h = orb.host(1); h.chat.requestTurn(h.chat.current()).catch((e) => h.log.error('t:' + e.message));";
    // canWrite:false ⇒ the acting principal is not host of the chat — a turn is host-gated SPEND, so it's refused
    // at the ceiling before the funder/budget is ever touched (a non-host plugin cannot spawn a turn).
    const outcome = await host.createInstance({
      mainJs: main,
      grants: ["chat.read", "turn.trigger"],
      bridge: fake.bridge,
      chat: { chatId: CHAT, canWrite: false, automationDepth: 0 },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(host.readLog(outcome.instance).some((l) => l.message.includes("host authority"))).toBe(true);
    expect(fake.turns.count).toBe(0);
    host.dispose(outcome.instance);
  });
});

describe("membrane — storage.kv (storage.kv): the plugin-private KV round-trips; the gate bites", () => {
  test("granted storage.set→get→list reaches the bridge (key/prefix only crosses)", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = fakeBridge();
    const main = `
      const h = orb.host(1);
      (async () => {
        await h.storage.set("k1", "v1");
        await h.storage.set("k2", "v2");
        const got = await h.storage.get("k1");
        const keys = await h.storage.list("k");
        h.log.info("kv:" + got + ":" + keys.join(","));
      })();`;
    const outcome = await host.createInstance({ mainJs: main, grants: ["storage.kv"], bridge: fake.bridge, chat: noChat });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(host.readLog(outcome.instance).some((l) => l.message === "kv:v1:k1,k2")).toBe(true);
    expect(fake.store.get("k1")).toBe("v1");
    host.dispose(outcome.instance);
  });

  test("storage.set WITHOUT the storage.kv grant rejects (capability gate) — bridge never written", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = fakeBridge();
    const main = 'const h = orb.host(1); h.storage.set("k", "v").catch((e) => h.log.error("s:" + e.message));';
    const outcome = await host.createInstance({ mainJs: main, grants: [], bridge: fake.bridge, chat: noChat });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(host.readLog(outcome.instance).some((l) => l.message.includes("storage.kv"))).toBe(true);
    expect(fake.store.size).toBe(0);
    host.dispose(outcome.instance);
  });
});

describe("membrane — notifications.post (notify): posts to the bridge; the gate bites", () => {
  test("granted notifications.post reaches the bridge with (recipient, message)", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = fakeBridge();
    const main = 'const h = orb.host(1); h.notifications.post(h.chat.current(), "all_members", "stirring").then(() => h.log.info("posted"));';
    const outcome = await host.createInstance({
      mainJs: main,
      grants: ["chat.read", "notify"],
      bridge: fake.bridge,
      chat: { chatId: CHAT, canWrite: false, automationDepth: 0 },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(fake.notices).toEqual([{ recipient: "all_members", message: "stirring" }]);
    host.dispose(outcome.instance);
  });

  test("notifications.post WITHOUT the notify grant rejects (capability gate) — bridge never called", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = fakeBridge();
    const main = 'const h = orb.host(1); h.notifications.post(h.chat.current(), "host", "x").catch((e) => h.log.error("n:" + e.message));';
    const outcome = await host.createInstance({
      mainJs: main,
      grants: ["chat.read"],
      bridge: fake.bridge,
      chat: { chatId: CHAT, canWrite: true, automationDepth: 0 },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(host.readLog(outcome.instance).some((l) => l.message.includes("notify"))).toBe(true);
    expect(fake.notices).toHaveLength(0);
    host.dispose(outcome.instance);
  });
});

describe("membrane — chat.surfaceQuickReply (chat.quick_reply): host-authority gated; the gate bites", () => {
  test("a HOST caller's granted surfaceQuickReply reaches the bridge with the choices", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = fakeBridge();
    const main =
      'const h = orb.host(1); h.chat.surfaceQuickReply(h.chat.current(), [{ label: "Flee", sendText: "I run" }]).then(() => h.log.info("surfaced"));';
    const outcome = await host.createInstance({
      mainJs: main,
      grants: ["chat.read", "chat.quick_reply"],
      bridge: fake.bridge,
      chat: { chatId: CHAT, canWrite: true, automationDepth: 0 },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(fake.chips).toEqual([[{ label: "Flee", sendText: "I run" }]]);
    host.dispose(outcome.instance);
  });

  test("surfaceQuickReply WITHOUT the grant rejects (capability gate) — bridge never called", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = fakeBridge();
    const main = 'const h = orb.host(1); h.chat.surfaceQuickReply(h.chat.current(), []).catch((e) => h.log.error("q:" + e.message));';
    const outcome = await host.createInstance({
      mainJs: main,
      grants: ["chat.read"],
      bridge: fake.bridge,
      chat: { chatId: CHAT, canWrite: true, automationDepth: 0 },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(host.readLog(outcome.instance).some((l) => l.message.includes("chat.quick_reply"))).toBe(true);
    expect(fake.chips).toHaveLength(0);
    host.dispose(outcome.instance);
  });

  test("a NON-HOST caller's surfaceQuickReply is refused by the host-authority ceiling (bridge never called)", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = fakeBridge();
    const main = 'const h = orb.host(1); h.chat.surfaceQuickReply(h.chat.current(), []).catch((e) => h.log.error("q:" + e.message));';
    const outcome = await host.createInstance({
      mainJs: main,
      grants: ["chat.read", "chat.quick_reply"],
      bridge: fake.bridge,
      chat: { chatId: CHAT, canWrite: false, automationDepth: 0 },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(host.readLog(outcome.instance).some((l) => l.message.includes("host authority"))).toBe(true);
    expect(fake.chips).toHaveLength(0);
    host.dispose(outcome.instance);
  });
});

describe("membrane — events.on collects into the instance (domain wires the fan-out delivery/unregister)", () => {
  test("a granted events.on lands a PluginEventSubscription on instance.events", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const main = `
      const h = orb.host(1);
      h.events.on("messageCommitted", async (fact) => { h.log.info("fact:" + fact.type); });
      'ok';`;
    const outcome = await host.createInstance({ mainJs: main, grants: ["events.subscribe"], bridge, chat: noChat });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.instance.events).toHaveLength(1);
    expect(outcome.instance.events[0]?.type).toBe("messageCommitted");
    expect(typeof outcome.instance.events[0]?.handler).toBe("string"); // opaque host-minted ref
    host.dispose(outcome.instance);
  });

  test("events.on WITHOUT events.subscribe throws (uniform gate) — nothing collected", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const main =
      "try { orb.host(1).events.on('messageCommitted', async () => {}); orb.host(1).log.info('subscribed'); } catch (e) { orb.host(1).log.error('ev:' + e.message); }";
    const outcome = await host.createInstance({ mainJs: main, grants: [], bridge, chat: noChat });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(host.readLog(outcome.instance).some((l) => l.message.includes("events.subscribe"))).toBe(true);
    expect(outcome.instance.events).toEqual([]);
    host.dispose(outcome.instance);
  });

  test("events.on with an off-taxonomy type throws (plugins get no private event vocabulary)", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const main =
      "try { orb.host(1).events.on('made_up', async () => {}); orb.host(1).log.info('subscribed'); } catch (e) { orb.host(1).log.error('ev:' + e.message); }";
    const outcome = await host.createInstance({ mainJs: main, grants: ["events.subscribe"], bridge, chat: noChat });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(host.readLog(outcome.instance).some((l) => l.message.includes("Tier-1 trigger type"))).toBe(true);
    expect(outcome.instance.events).toEqual([]);
    host.dispose(outcome.instance);
  });
});

describe("membrane — the guest-inbound args cap (a huge delivered payload fails contained, DoS backstop)", () => {
  test("invoking a resident handler with an oversized argsJson is refused before the guest runs", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const main = `
      const h = orb.host(1);
      h.tools.register({ name: "echo", description: "d", parameters: { type: "object", properties: {} }, handler: async () => "ran" });
      'ok';`;
    const outcome = await host.createInstance({ mainJs: main, grants: ["tools.register"], bridge, chat: noChat });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const ref = outcome.instance.tools[0]?.handler;
    if (ref === undefined) {
      throw new Error("no handler ref");
    }
    // A > 1 MiB args payload (a stand-in for a huge TF-1 fact with no content cap) is rejected at the inbound
    // seam — the handler never runs, contained as a thrown invoke failure (never a host crash / guest bloat).
    const huge = JSON.stringify({ blob: "x".repeat(1_100_000) });
    await expect(host.invoke(outcome.instance, ref, huge, noChat)).rejects.toThrow(INBOUND_CAP_RE);
    host.dispose(outcome.instance);
  });
});

describe("membrane — transforms.register collects into the instance (domain wires the band/apply/unregister)", () => {
  test("a granted transforms.register lands a PluginTransformRegistration on instance.transforms", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const main = `
      const h = orb.host(1);
      h.transforms.register({ name: "shout", point: "user_input", apply: async (draft) => draft.toUpperCase() });
      'ok';`;
    const outcome = await host.createInstance({ mainJs: main, grants: ["chat.transform"], bridge, chat: noChat });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.instance.transforms).toHaveLength(1);
    expect(outcome.instance.transforms[0]?.name).toBe("shout");
    expect(outcome.instance.transforms[0]?.point).toBe("user_input");
    // The handler is an opaque host-minted ref (the guest apply handle kept resident) — never guest-forged.
    expect(typeof outcome.instance.transforms[0]?.handler).toBe("string");
    // The guest supplies NO order — the collected record carries none; the 1000+ band is the domain's to assign.
    expect(Object.hasOwn(outcome.instance.transforms[0] ?? {}, "order")).toBe(false);
    host.dispose(outcome.instance);
  });

  test("transforms.register WITHOUT the chat.transform grant throws (uniform gate) — nothing collected", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const main =
      "try { orb.host(1).transforms.register({ name: 'x', point: 'user_input', apply: async (d) => d }); orb.host(1).log.info('registered'); } catch (e) { orb.host(1).log.error('reg:' + e.message); }";
    const outcome = await host.createInstance({ mainJs: main, grants: [], bridge, chat: noChat });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(host.readLog(outcome.instance).some((l) => l.message.includes("chat.transform"))).toBe(true);
    expect(outcome.instance.transforms).toEqual([]);
    host.dispose(outcome.instance);
  });

  test("transforms.register with an unknown point throws (only user_input | assembled_dynamic)", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const main =
      "try { orb.host(1).transforms.register({ name: 'x', point: 'somewhere_else', apply: async (d) => d }); orb.host(1).log.info('registered'); } catch (e) { orb.host(1).log.error('pt:' + e.message); }";
    const outcome = await host.createInstance({ mainJs: main, grants: ["chat.transform"], bridge, chat: noChat });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(host.readLog(outcome.instance).some((l) => l.message.includes("user_input"))).toBe(true);
    expect(outcome.instance.transforms).toEqual([]);
    host.dispose(outcome.instance);
  });
});

describe("membrane — net.fetch is capability-gated + walled to the manifest netHosts (SSRF)", () => {
  test("net.fetch WITHOUT the grant rejects (capability gate) — no fetch attempted", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const main = "orb.host(1).net.fetch('https://api.example.com/x').catch((e) => orb.host(1).log.error('n:' + e.message));";
    // net.fetch grant withheld → the capability throw fires before any host list is consulted.
    const outcome = await host.createInstance({ mainJs: main, grants: [], bridge, chat: noChat, netHosts: ["api.example.com"] });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(host.readLog(outcome.instance).some((l) => l.message.includes("net.fetch"))).toBe(true);
    host.dispose(outcome.instance);
  });

  test("a granted net.fetch to a host NOT in netHosts is blocked at the allowlist (before any network)", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    // The URL is guest-controlled; the wall is the manifest list. evil.example is not declared → host-not-allowed,
    // thrown by safeFetch's validateUrl BEFORE DNS/connect (hermetic — no network reached).
    const main =
      "orb.host(1).net.fetch('https://evil.example/steal').then(() => orb.host(1).log.info('REACHED')).catch((e) => orb.host(1).log.error('blocked:' + e.message));";
    const outcome = await host.createInstance({ mainJs: main, grants: ["net.fetch"], bridge, chat: noChat, netHosts: ["api.example.com"] });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const log = host.readLog(outcome.instance);
    expect(log.some((l) => l.message === "REACHED")).toBe(false);
    expect(log.some((l) => l.message.includes("blocked:") && l.message.includes("allowlist"))).toBe(true);
    host.dispose(outcome.instance);
  });
});

describe("runSnippet — transient one-shot (P5)", () => {
  test("a member snippet reads global_vars + chat vars; logs echo back; no residency", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    // Member profile: chat.read + global_vars, NO chat.variables.write (non-host).
    const code =
      "const h = orb.host(1); Promise.all([h.variables.get('greeting'), h.chat.getVariables(h.chat.current())]).then(([g, v]) => h.log.info('snip:' + g + ':' + v.tension));";
    const out = await host.runSnippet({ code, grants: ["chat.read", "global_vars"], bridge, chat: { chatId: CHAT, canWrite: false, automationDepth: 0 } });
    expect(out.error).toBeUndefined();
    expect(out.logLines).toContain("[info] snip:hello-from-kv:4");
  });

  test("a non-host snippet's variable write fails cleanly (SnippetResult.error is absent — the guest caught it)", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = fakeBridge();
    const code =
      "const h = orb.host(1); h.chat.applyVariableOps(h.chat.current(), [{op:'set',key:'x',value:'1'}]).catch((e) => h.log.error('w:' + e.message));";
    // Member profile omits chat.variables.write entirely → the gate refuses.
    const out = await host.runSnippet({
      code,
      grants: ["chat.read", "global_vars"],
      bridge: fake.bridge,
      chat: { chatId: CHAT, canWrite: false, automationDepth: 0 },
    });
    expect(out.logLines.some((l) => l.includes("chat.variables.write"))).toBe(true);
    expect(fake.writes.count).toBe(0);
  });

  test("a snippet's tools.register throws (no registration namespace reachable in the profile)", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const code =
      "try { orb.host(1).tools.register({name:'x',description:'y',parameters:{},handler:async()=>'z'}); orb.host(1).log.info('registered'); } catch (e) { orb.host(1).log.error('reg:' + e.message); }";
    const out = await host.runSnippet({ code, grants: ["chat.read", "global_vars"], bridge, chat: { chatId: CHAT, canWrite: false, automationDepth: 0 } });
    expect(out.logLines.some((l) => l.includes("tools.register"))).toBe(true);
    expect(out.logLines).not.toContain("[info] registered");
  });
});

describe("membrane — resident-handler tool runtime", () => {
  test("a tool registered at activation round-trips through invoke", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const main = `
      const h = orb.host(1);
      h.tools.register({
        name: "echo",
        description: "echo the input",
        parameters: { type: "object", properties: { msg: { type: "string" } } },
        handler: async (args) => "echoed:" + args.msg,
      });
      'ok';`;
    const outcome = await host.createInstance({ mainJs: main, grants: ["tools.register"], bridge, chat: noChat });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.instance.tools).toHaveLength(1);
    expect(outcome.instance.tools[0]?.name).toBe("echo");
    const ref = outcome.instance.tools[0]?.handler;
    if (ref === undefined) {
      throw new Error("no handler ref");
    }
    const result = await host.invoke(outcome.instance, ref, JSON.stringify({ msg: "hi" }), noChat);
    expect(result).toBe("echoed:hi");
    host.dispose(outcome.instance);
  });

  test("a resident tool handler reaches its threaded chat scope (reads chat vars via the admitted handle)", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    // The tool captures the chat via host.chat.current() at CALL time — proving invoke's chat arg sets the scope.
    const main = `
      const h = orb.host(1);
      h.tools.register({
        name: "read_tension",
        description: "report the chat tension var",
        parameters: { type: "object", properties: {} },
        handler: async () => { const v = await h.chat.getVariables(h.chat.current()); return "tension:" + v.tension; },
      });
      'ok';`;
    const outcome = await host.createInstance({ mainJs: main, grants: ["tools.register", "chat.read"], bridge, chat: noChat });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const ref = outcome.instance.tools[0]?.handler;
    if (ref === undefined) {
      throw new Error("no handler ref");
    }
    // Invoked WITHOUT a chat scope → current() throws (no scope); invoked WITH → reaches the fake bridge var fold.
    await expect(host.invoke(outcome.instance, ref, "{}", noChat)).rejects.toThrow();
    const scoped = await host.invoke(outcome.instance, ref, "{}", { chatId: CHAT, canWrite: false, automationDepth: 0 });
    expect(scoped).toBe("tension:4");
    host.dispose(outcome.instance);
  });
});

describe("membrane — worldInfo + imagery (host-gated writers)", () => {
  test("a HOST caller's worldInfo.upsertEntry + imagery.generatePicture reach the bridge", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = fakeBridge();
    const grants = ["worldinfo.write", "imagery.generate"] as const;
    const main = `
      const h = orb.host(1);
      Promise.all([
        h.worldInfo.upsertEntry(h.chat.current(), { bookId: "wb_1", entryKey: "k", keys: ["a"], contentTemplate: "c", position: "after" }),
        h.imagery.generatePicture(h.chat.current(), { mode: "scenario", prompt: "a sunset" }),
      ]).then(([, pic]) => h.log.info("pic:" + pic.assetId)).catch((e) => h.log.error("err:" + e.message));`;
    // worldInfo/imagery gate on chat.read for current() too — grant it so the guest can resolve the handle.
    const outcome = await host.createInstance({
      mainJs: main,
      grants: [...grants, "chat.read"],
      bridge: fake.bridge,
      chat: { chatId: CHAT, canWrite: true, automationDepth: 0 },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(fake.lore.count).toBe(1);
    expect(fake.pics.count).toBe(1);
    expect(host.readLog(outcome.instance).some((l) => l.message === "pic:asset_generated0000000000000")).toBe(true);
    host.dispose(outcome.instance);
  });

  test("a NON-HOST caller's worldInfo/imagery writes are refused (host authority ceiling)", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = fakeBridge();
    const main = `
      const h = orb.host(1);
      h.worldInfo.upsertEntry(h.chat.current(), { bookId: "wb_1", entryKey: "k", keys: [], contentTemplate: "c", position: "after" })
        .catch((e) => h.log.error("w:" + e.message));`;
    const outcome = await host.createInstance({
      mainJs: main,
      grants: ["worldinfo.write", "chat.read"],
      bridge: fake.bridge,
      chat: { chatId: CHAT, canWrite: false, automationDepth: 0 },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(host.readLog(outcome.instance).some((l) => l.message.includes("host authority"))).toBe(true);
    expect(fake.lore.count).toBe(0);
    host.dispose(outcome.instance);
  });

  test("tools.register WITHOUT the grant rejects (a snippet-profile probe — no snippet-special path)", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const main =
      "try { orb.host(1).tools.register({ name: 'x', description: 'y', parameters: {}, handler: async () => 'z' }); orb.host(1).log.info('registered'); } catch (e) { orb.host(1).log.error('reg:' + e.message); }";
    const outcome = await host.createInstance({ mainJs: main, grants: [], bridge, chat: noChat });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(host.readLog(outcome.instance).some((l) => l.message.includes("tools.register"))).toBe(true);
    expect(outcome.instance.tools).toEqual([]);
    host.dispose(outcome.instance);
  });
});

// A guest-REACHABLE host crash (the P4b/P5 continuation lane's real membrane-async lesson): a fire-and-forget
// host call still PENDING when the invocation ends leaves an unsettled guest Promise in the heap; `ctx.dispose()`
// then ABORTS the shared WASM module (`list_empty(&rt->gc_obj_list)` in JS_FreeRuntime) — bricking every plugin
// process-wide. The abort lands AT dispose, BEFORE any late settle, so the settle-time `ctx.alive` guard never
// runs: the fix is a dispose-time DRAIN of in-flight deferreds. These tests fire-and-forget a bridge call that
// never settles within the invocation and prove teardown stays clean (before the fix they abort here).
describe("membrane — teardown drains in-flight host calls (guest-reachable host-crash guard)", () => {
  /** A bridge whose `chat.getVariables` blocks on an external gate — the caller releases it AFTER teardown. */
  function gatedBridge(): { bridge: PluginBridge; release: (v: Record<string, string>) => void; gate: Promise<Record<string, string>> } {
    const base = fakeBridge().bridge;
    let release!: (v: Record<string, string>) => void;
    const gate = new Promise<Record<string, string>>((resolve) => {
      release = resolve;
    });
    const bridge: PluginBridge = { ...base, chat: { ...base.chat, getVariables: () => gate } };
    return { bridge, release, gate };
  }

  /** Assert no unhandled rejection escapes while the late settle is dropped by the alive guard. */
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

  test("runSnippet disposing while a fire-and-forget host call is PENDING does not abort the host", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge, release, gate } = gatedBridge();
    // The snippet fires a host call and NEVER awaits it — still pending when runSnippet's finally disposes. The
    // trailing `'started'` keeps the fire-and-forget promise OFF the top-level result (else runToSettlement would
    // await it to the deadline instead of leaving it pending at dispose).
    const code = "const h = orb.host(1); h.chat.getVariables(h.chat.current()); 'started';";
    const result = await host.runSnippet({ code, grants: ["chat.read"], bridge, chat: { chatId: CHAT, canWrite: true, automationDepth: 0 } });
    // Before the fix, the line above REJECTS with the WASM abort thrown from dispose. After it, clean.
    expect(result.error).toBeUndefined();
    await withNoUnhandledRejection(async () => {
      release({ tension: "9" });
      await gate;
    });
  });

  test("disposing a resident instance while a handler's fire-and-forget host call is PENDING does not abort", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge, release, gate } = gatedBridge();
    // The tool handler fires a host call fire-and-forget, then returns — the inner call is still pending at
    // dispose (deactivate). The handler string return IS the tool result (03 §5).
    const main =
      "orb.host(1).tools.register({ name: 'leak', description: 'd', parameters: { type: 'object', properties: {} }, handler: async () => { const h = orb.host(1); h.chat.getVariables(h.chat.current()); return 'ok'; } });";
    const outcome = await host.createInstance({ mainJs: main, grants: ["tools.register", "chat.read"], bridge, chat: noChat });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const ref = outcome.instance.tools[0]?.handler;
    if (ref === undefined) {
      throw new Error("no handler ref");
    }
    const returned = await host.invoke(outcome.instance, ref, "{}", { chatId: CHAT, canWrite: true, automationDepth: 0 });
    expect(returned).toBe("ok");
    await withNoUnhandledRejection(async () => {
      // Teardown while the handler's inner getVariables is still pending — the drain must keep it clean.
      host.dispose(outcome.instance);
      release({ tension: "1" });
      await gate;
    });
  });
});

// PER-INSTANCE invoke SERIALIZATION (the untrusted-guest concurrency belt). A resident sandbox is a SINGLE shared
// QuickJSContext: `invoke` mutates the shared invocation-chat scope (setInvocationChat) then AWAITS into the
// guest. Two concurrent invokes on the SAME resident used to interleave — A sets chatA + awaits into a mid-flight
// guest, B sets chatB, and when A resumes its `chat.current()`/`requestTurn` reads chatB's chatId + automationDepth.
// A clobbered `automationDepth` breaks the cascade-depth loop belt (requestTurn stamps depth+1). These tests are
// REAL-ASYNC (sync fakes settle before the next call and HIDE the race — the membrane-async lesson): invoke A's
// handler awaits a HUNG host bridge call so control returns to the event loop between A's scope-set and A's read;
// only then does B run. The serialization must make A read ITS OWN scope, not B's.
describe("port.invoke — per-instance FIFO serialization (concurrency belt on the untrusted boundary)", () => {
  test("two concurrent invokes on the SAME resident do NOT clobber each other's chat scope / automationDepth", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = racingBridge();
    const { instance, ref } = await residentRaceTool(host, fake.bridge);

    // A at depth 5, B at depth 10 — fired concurrently at the SAME resident. With serialization, A runs fully
    // first (its getVariables gates), so only A's getVariables is pending until we release it.
    const aDone = host.invoke(instance, ref, "{}", { chatId: CHAT, canWrite: true, automationDepth: 5 });
    const bDone = host.invoke(instance, ref, "{}", { chatId: CHAT, canWrite: true, automationDepth: 10 });

    await settleTicks(); // A's handler enters its awaited getVariables
    // SERIALIZED: only ONE getVariables is in flight (A's) — B has not started (it is queued behind A's tail).
    expect(fake.gates).toHaveLength(1);

    // Release A's getVariables → A resumes, requestTurns (stamps 5+1=6), returns. THEN B starts, its getVariables
    // gates. Release B's → B requestTurns (stamps 10+1=11).
    fake.releaseNext({ tension: "1" });
    await aDone;
    await settleTicks();
    expect(fake.gates).toHaveLength(1); // now B's is the pending one
    fake.releaseNext({ tension: "2" });

    expect(await aDone).toBe("done");
    expect(await bDone).toBe("done");
    // The witness: each invocation forwarded ITS OWN depth+1, in FIFO order. Under the race, A would resume after
    // B mutated the scope and forward 11 (B's depth+1) instead of 6 — the clobber the belt exists to stop.
    expect(fake.forwardedDepths).toEqual([6, 11]);
  });

  // GUARD: the SAME repro with serialization BYPASSED (the pre-fix behavior — setInvocationChat then await, no
  // tail) DOES clobber. This proves the test above actually exercises the race (a green test that would pass
  // without the fix proves nothing — the ct-stub-lie lesson). The port keeps its resident Sandbox private and
  // offers no bypass hook, so we drive a Sandbox DIRECTLY (it is exported) exactly as the pre-fix port.invoke did
  // — the same real QuickJS runtime + membrane, just without the FIFO. Same guest, same bridge, same race window.
  test("REPRO GUARD: the UNSERIALIZED pre-fix path over one sandbox clobbers automationDepth (proves the race is real)", { timeout: LONG }, async () => {
    const fake = racingBridge();
    const sandbox = await Sandbox.create(makeSeams(), {
      membrane: { grants: new Set<PluginCapability>(RACING_GRANTS), bridge: fake.bridge, netHosts: [] },
    });
    const activated = await sandbox.evalGuest(RACING_TOOL_SRC);
    expect(activated.ok).toBe(true);
    const ref = sandbox.collectedTools[0]?.handler;
    if (ref === undefined) {
      throw new Error("no handler ref");
    }
    // The pre-fix pair, unserialized: set the shared scope, then await into the guest — NO tail between them.
    const rawInvoke = (chat: InvocationChat): Promise<unknown> => {
      sandbox.setInvocationChat(chat);
      return sandbox.invokeHandler(ref, "{}");
    };
    const aDone = rawInvoke({ chatId: CHAT, canWrite: true, automationDepth: 5 });
    const bDone = rawInvoke({ chatId: CHAT, canWrite: true, automationDepth: 10 });
    await settleTicks();
    // UNSERIALIZED: BOTH handlers entered getVariables — B mutated the shared scope to depth 10 while A was
    // mid-flight (two gates pending). Release both; A resumes and reads B's depth (10) → forwards 11, NOT 6.
    expect(fake.gates).toHaveLength(2);
    fake.releaseNext({ tension: "x" });
    fake.releaseNext({ tension: "x" });
    await aDone;
    await bDone;
    // The corruption: NEITHER invocation forwarded its own depth+1 in order — the shared scope was the last write
    // (10) when both resumed, so both stamped 11. This is exactly what the FIFO closes.
    expect(fake.forwardedDepths).not.toEqual([6, 11]);
    expect(fake.forwardedDepths.every((d) => d === 11)).toBe(true);
    sandbox.dispose();
  });

  test("different resident instances still run CONCURRENTLY (per-instance, not global, serialization)", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = racingBridge();
    const a = await residentRaceTool(host, fake.bridge);
    const b = await residentRaceTool(host, fake.bridge);
    // One invoke on EACH instance, concurrently. Per-instance serialization must NOT serialize across instances —
    // both handlers should reach their getVariables (two gates pending), proving the fan-out's cross-subscriber
    // Promise.all stays parallel.
    const aDone = host.invoke(a.instance, a.ref, "{}", { chatId: CHAT, canWrite: true, automationDepth: 0 });
    const bDone = host.invoke(b.instance, b.ref, "{}", { chatId: CHAT, canWrite: true, automationDepth: 0 });
    await settleTicks();
    expect(fake.gates).toHaveLength(2); // BOTH in flight → not cross-instance serialized
    fake.releaseNext({ tension: "1" });
    fake.releaseNext({ tension: "2" });
    expect(await aDone).toBe("done");
    expect(await bDone).toBe("done");
    host.dispose(a.instance);
    host.dispose(b.instance);
  });

  test("bounded FIFO: the 17th concurrent invoke is a CONTAINED typed refusal (the queue survives, no abort)", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = racingBridge();
    const { instance, ref } = await residentRaceTool(host, fake.bridge);
    // Fire EVENT_QUEUE_DEPTH (16) concurrent invokes — the first runs + gates on getVariables; the other 15 queue
    // behind the tail. All 16 are pending (queued or running) → the 17th must OVERFLOW.
    const invoke = (): Promise<string> => host.invoke(instance, ref, "{}", { chatId: CHAT, canWrite: true, automationDepth: 0 });
    const inflight: Promise<string>[] = Array.from({ length: 16 }, () => invoke());
    // The 17th, while 16 are pending, is refused — errors-as-data (a rejected invoke), NOT a process abort.
    await expect(invoke()).rejects.toThrow(QUEUE_FULL_RE);

    // The queue SURVIVES the overflow: drain the 16 (release each gated getVariables in FIFO as the tail advances).
    await drainGatedInvokes(fake, 16);
    const results = await Promise.all(inflight);
    expect(results).toEqual(new Array(16).fill("done"));

    // After the flood drains, the queue is EMPTY again — a fresh invoke is admitted (the overflow did not wedge
    // the tail). Release its single gated getVariables and confirm it completes.
    const after = invoke();
    await drainGatedInvokes(fake, 1);
    expect(await after).toBe("done");
    host.dispose(instance);
  });

  test("a deadlined/rejected invoke advances the tail (the chain is not wedged by a failure)", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    // A tool that THROWS — its invoke rejects. The next queued invoke must still run (the tail advances on the
    // reject arm), proving a failing invoke cannot wedge the per-instance chain.
    const main = `
      const h = orb.host(1);
      h.tools.register({ name: "boom", description: "throws", parameters: { type: "object", properties: {} }, handler: async () => { throw new Error("handler boom"); } });
      h.tools.register({ name: "ok", description: "fine", parameters: { type: "object", properties: {} }, handler: async () => "fine" });
      'ok';`;
    const outcome = await host.createInstance({ mainJs: main, grants: ["tools.register"], bridge, chat: noChat });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const boomRef = outcome.instance.tools.find((t) => t.name === "boom")?.handler;
    const okRef = outcome.instance.tools.find((t) => t.name === "ok")?.handler;
    if (boomRef === undefined || okRef === undefined) {
      throw new Error("no handler refs");
    }
    // Fire the throwing invoke and a good one concurrently (the good one queues behind the throwing tail).
    const boomDone = host.invoke(outcome.instance, boomRef, "{}", noChat);
    const okDone = host.invoke(outcome.instance, okRef, "{}", noChat);
    await expect(boomDone).rejects.toThrow(HANDLER_BOOM_RE);
    // The tail advanced past the rejection — the queued good invoke ran and returned.
    expect(await okDone).toBe("fine");
    host.dispose(outcome.instance);
  });
});
