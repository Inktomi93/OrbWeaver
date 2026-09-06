// infra/plugin-host/port + membrane — the PluginHostPort impl over the Sandbox (P4b-CORE). Proves the membrane
// end-to-end against the REAL QuickJS runtime with a fake `PluginBridge`: the determinism-floor run + log
// capture; the capability gate (an ungranted namespace call rejects); the opaque-handle resolution (a forged
// chat handle fails, no read); the host-authority write ceiling (a non-host `chat.variables.write` refused); and
// the RESIDENT-HANDLER runtime (a guest tool registered at activation round-trips through `invoke`). The
// composed-real router test covers the domain wiring; this is the runtime mirror + the security-gate pins.

import process from "node:process";
import type { NotificationRecipient } from "@orb/contracts/notifications";
import type { InvocationChat, PluginBridge, PluginCapability, PluginHandlerRef, PluginInstance, PluginSuggestedAct } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import { logger } from "@orb/server/foundation/observability";
import type { HostSeams } from "@orb/server/infra/plugin-host";
import {
  createPluginHost,
  EVENT_QUEUE_DEPTH,
  HOST_FN_ARGS_MAX_BYTES,
  HOST_FN_DEADLINE_MS,
  PLUGIN_LOG_RING_CHARS,
  PLUGIN_LOG_RING_LINES,
  PLUGIN_MEMORY_LIMIT_BYTES,
  PLUGIN_RESIDENT_RUNTIME_MAX,
  PLUGIN_SNIPPET_RUNTIME_MAX,
  Sandbox,
} from "@orb/server/infra/plugin-host";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const FIXED_EPOCH = 1_700_000_000_000;
const CHAT = "chat_test0000000000000000000" as ChatId;
const LONG = 30_000;
const COUNTER_ID_RE = /^id-\d+$/u;
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const INBOUND_CAP_RE = /inbound cap/u;
const QUEUE_FULL_RE = /queue full/u;
const HANDLER_BOOM_RE = /handler boom/u;
const INVOCATION_ENDED_RE = /invocation ended/u;
/** The membrane's guest→host argument cap refusal (distinct from `INBOUND_CAP_RE`, the handler-args cap). */
const ARGS_CAP_RE = /arguments exceed/u;
/** The resident-handler args channel's JSON-only refusal (a non-JSON payload never reaches the guest). */
const ARGS_JSON_RE = /args must be a JSON document/u;
const RESIDENT_CAPACITY_RE = /resident runtime capacity/u;
const HOST_FN_EXCEEDED_RE = /exceeded/u;
const HOST_OPERATION_ABORTED_RE = /abort/u;
const UNKNOWN_OR_DISPOSED_RE = /unknown\/disposed/u;
const SNIPPET_CAPACITY_RE = /maximum of \d+ snippets/u;
/** A race sentinel: distinguishes "settled already" from "still held" without a timer. */
const PENDING = Symbol("pending");

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
    await waitForGate(fake);
    fake.releaseNext({ tension: "ok" });
  }
}

/** Resolve once at least one gated getVariables is pending (a bounded poll — the queued invoke needs a few
 *  macrotask ticks after the prior settles to reach its awaited host call). */
async function waitForGate(fake: RacingBridge): Promise<void> {
  for (let spins = 0; spins < 200 && fake.gates.length === 0; spins++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Poll to settled instead of a fixed tick: bounded so a genuine defect (fewer than `count` ever arrive)
 *  still times out into a failing assertion rather than hanging. */
async function waitForReleases(releases: readonly unknown[], count: number): Promise<void> {
  for (let spins = 0; spins < 200 && releases.length < count; spins++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** The over-cap arm of the resident-admission test, split out to keep the caller's cyclomatic complexity
 *  under the gate ceiling: one MORE activation over an already-full pool settles immediately (refused,
 *  never queued) rather than joining the held set. */
async function assertOverflowRefused(
  host: ReturnType<typeof createPluginHost>,
  input: Parameters<ReturnType<typeof createPluginHost>["createInstance"]>[0],
): Promise<void> {
  let overflowSettled = false;
  const overflowPromise = host.createInstance(input).then((outcome) => {
    overflowSettled = true;
    return outcome;
  });
  await settleTicks();

  expect(overflowSettled).toBe(true);
  const overflow = await overflowPromise;
  expect(overflow.ok).toBe(false);
  if (overflow.ok) {
    throw new Error("test: over-cap activation unexpectedly succeeded");
  }
  expect(overflow.error).toMatch(RESIDENT_CAPACITY_RE);
  expect(overflow.log).toEqual([]);
}

/** Release every held gate (idempotent) then drain the `held` activations into the admitted instances —
 *  split out alongside `assertOverflowRefused` for the same complexity-budget reason. */
async function releaseAndDrain(
  releases: readonly (() => void)[],
  held: readonly Promise<Awaited<ReturnType<ReturnType<typeof createPluginHost>["createInstance"]>>>[],
): Promise<PluginInstance[]> {
  for (const release of releases) {
    release();
  }
  const admitted = await Promise.all(held);
  return admitted.flatMap((outcome) => (outcome.ok ? [outcome.instance] : []));
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

describe("port.createInstance — process-wide resident admission", () => {
  test("held activations consume admission, exhaustion refuses softly, and dispose releases for retry", { timeout: LONG }, async () => {
    const hostA = makeHost();
    const hostB = makeHost();
    const base = fakeBridge().bridge;
    const releases: (() => void)[] = [];
    const heldBridge: PluginBridge = {
      ...base,
      chat: {
        ...base.chat,
        getVariables: () =>
          new Promise<Record<string, string>>((resolve) => {
            releases.push(() => resolve({ held: "released" }));
          }),
      },
    };
    const mainJs = `(async () => {
      const h = orb.host(1);
      await h.chat.getVariables(h.chat.current());
      return "activated";
    })()`;
    const input = {
      mainJs,
      grants: ["chat.read"] as const,
      bridge: heldBridge,
      chat: { chatId: CHAT, canWrite: true, automationDepth: 0 },
      budgets: { cpuDeadlineMs: 1000, memoryLimitBytes: PLUGIN_MEMORY_LIMIT_BYTES, settleGraceMs: 20_000 },
    };

    const held = Array.from({ length: PLUGIN_RESIDENT_RUNTIME_MAX }, (_, index) => (index % 2 === 0 ? hostA : hostB).createInstance(input));
    // Admitted instances land here (in `finally`, UNCONDITIONALLY) so they always get disposed — even
    // when an assertion throws before this point. Disposal is the only thing that frees a resident slot;
    // releasing the bridge gate alone unblocks the guest but leaves its admission held, so a throw
    // between "gate released" and "instance disposed" used to strand up to 16 leases for the rest of the
    // file. Assertions that DEPEND on `instances` therefore run AFTER the try/finally, not inside it.
    let instances: PluginInstance[] = [];

    try {
      // Poll to settled instead of a fixed tick: under load the 16 WASM sandbox creations do not all
      // reach the bridge inside one macrotask spin, and a fixed wait here stranded the admitted leases
      // outside any `finally`, cascading a single flaky assertion into every later test in this file.
      await waitForReleases(releases, PLUGIN_RESIDENT_RUNTIME_MAX);
      expect(releases).toHaveLength(PLUGIN_RESIDENT_RUNTIME_MAX);

      await assertOverflowRefused(hostB, input);
    } finally {
      // Release every gate (idempotent — resolving an already-settled promise is a no-op) so `held`
      // always drains, then dispose every admitted instance so admission is freed either way — this is
      // the ONE place that runs no matter which assertion above threw.
      instances = await releaseAndDrain(releases, held);
      for (const [index, instance] of instances.entries()) {
        (index % 2 === 0 ? hostA : hostB).dispose(instance);
      }
    }
    expect(instances).toHaveLength(PLUGIN_RESIDENT_RUNTIME_MAX);

    const retry = await hostA.createInstance({ ...input, mainJs: "'ok'" });
    expect(retry.ok).toBe(true);
    if (retry.ok) {
      hostA.dispose(retry.instance);
    }
  });

  test("a failed activation retains admission until its non-cancellable host work actually settles", { timeout: LONG }, async () => {
    const host = makeHost();
    const base = fakeBridge().bridge;
    const anchors: PluginInstance[] = [];
    for (let index = 0; index < PLUGIN_RESIDENT_RUNTIME_MAX - 1; index += 1) {
      const anchor = await host.createInstance({ mainJs: "'ok'", grants: [], bridge: base, chat: noChat });
      expect(anchor.ok).toBe(true);
      if (anchor.ok) {
        anchors.push(anchor.instance);
      }
    }

    let releaseTransaction!: () => void;
    let transactionStarted = false;
    const transaction = new Promise<void>((resolve) => {
      releaseTransaction = resolve;
    });
    const transactionalBridge: PluginBridge = {
      ...base,
      storage: {
        ...base.storage,
        set: () => {
          transactionStarted = true;
          return transaction;
        },
      },
    };
    let failureSettled = false;
    const failing = host
      .createInstance({
        mainJs: "const h = orb.host(1); h.storage.set('key', 'value'); throw new Error('activation boom');",
        grants: ["storage.kv"],
        bridge: transactionalBridge,
        chat: noChat,
      })
      .then((outcome) => {
        failureSettled = true;
        return outcome;
      });

    await settleTicks();
    const settledBeforeRelease = failureSettled;
    const earlyRetry = await host.createInstance({ mainJs: "'retry'", grants: [], bridge: base, chat: noChat });
    if (earlyRetry.ok) {
      host.dispose(earlyRetry.instance);
    }

    releaseTransaction();
    await transaction;
    const failed = await failing;
    const postSettleRetry = await host.createInstance({ mainJs: "'retry'", grants: [], bridge: base, chat: noChat });
    if (postSettleRetry.ok) {
      host.dispose(postSettleRetry.instance);
    }
    for (const instance of anchors) {
      host.dispose(instance);
    }

    expect(transactionStarted).toBe(true);
    expect({ settledBeforeRelease, earlyRetryAdmitted: earlyRetry.ok, postSettleRetryAdmitted: postSettleRetry.ok }).toEqual({
      settledBeforeRelease: false,
      earlyRetryAdmitted: false,
      postSettleRetryAdmitted: true,
    });
    expect(failed).toMatchObject({ ok: false, error: "activation boom" });
  });
});

/** A fake op bridge with in-memory global-KV + a fixed chat var fold; counts variable / worldInfo / imagery
 *  writes for assertions (each is a host-gated bridge call the membrane only reaches after its canWrite gate). */
function fakeBridge(): {
  bridge: PluginBridge;
  kv: Map<string, string>;
  store: Map<string, string>;
  notices: { recipient: NotificationRecipient; message: string }[];
  chips: { label: string; sendText: string }[][];
  writes: { count: number };
  lore: { count: number; chatIds: ChatId[] };
  pics: { count: number };
  turns: { count: number; lastDepth: number; args: readonly unknown[] };
  quiets: { prompts: string[] };
  egress: { count: number };
  suggested: { acts: PluginSuggestedAct[] };
} {
  const kv = new Map<string, string>([["greeting", "hello-from-kv"]]);
  // The plugin-PRIVATE store the bridge closes pluginId/installer over (the fake models it as a flat map — the
  // real cross-plugin isolation is proven in the composed-real domain test, not this runtime mirror).
  const store = new Map<string, string>();
  const notices: { recipient: NotificationRecipient; message: string }[] = [];
  const chips: { label: string; sendText: string }[][] = [];
  const writes = { count: 0 };
  const lore: { count: number; chatIds: ChatId[] } = { count: 0, chatIds: [] };
  const pics = { count: 0 };
  // requestTurn records the args the membrane forwarded — the fake bridge receives ONLY (chatId, depth, p); the
  // FUNDER is closed over domain-side, so its absence here IS the "infra stays authority-blind" proof.
  const turns: { count: number; lastDepth: number; args: readonly unknown[] } = { count: 0, lastDepth: -1, args: [] };
  const quiets: { prompts: string[] } = { prompts: [] };
  const egress = { count: 0 };
  const suggested: { acts: PluginSuggestedAct[] } = { acts: [] };
  const bridge: PluginBridge = {
    chat: {
      listMessages: () => Promise.resolve([{ id: "m1", role: "user", authorDisplayName: "U", characterId: null, seq: 1, content: "hi" }]),
      getVariables: () => Promise.resolve({ tension: "4" }),
      applyVariableOps: () => {
        writes.count += 1;
        return Promise.resolve({ outcome: "applied" });
      },
      requestTurn: (chatId, automationDepth, p) => {
        turns.count += 1;
        turns.lastDepth = automationDepth;
        turns.args = [chatId, automationDepth, p];
        return Promise.resolve();
      },
      listCharacters: () => Promise.resolve([]),
    },
    worldInfo: {
      upsertEntry: (chatId) => {
        lore.count += 1;
        lore.chatIds.push(chatId);
        return Promise.resolve();
      },
      listBooks: () => Promise.resolve([]),
      listEntries: () => Promise.resolve([]),
    },
    assets: { read: () => Promise.resolve(null), storeFetched: () => Promise.resolve({ assetId: "asset_test000000000000000000" }) },
    search: { documents: () => Promise.resolve([]) },
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
      // The ATOMIC arm (#1442), modelled honestly over the same Map so a guest driving it through the real
      // membrane sees real compare-and-set semantics rather than an always-true stub.
      compareAndSet: (key, expected, next): Promise<{ applied: boolean; current: string | null }> => {
        const current = store.get(key) ?? null;
        if (current !== expected) {
          return Promise.resolve({ applied: false, current });
        }
        store.set(key, next);
        return Promise.resolve({ applied: true, current: next });
      },
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
    // The quiet generation records its prompt for the same reason `requestTurn` records its args: the fake
    // receives ONLY the prompt string, so the ABSENCE of a funder/connection/chat here IS the proof that a
    // guest cannot name whose credential it spends — the installer is closed over domain-side.
    llm: {
      quiet: (prompt) => {
        quiets.prompts.push(prompt);
        return Promise.resolve({ text: "quiet-answer" });
      },
    },
    admitEgress: (): void => {
      egress.count += 1;
    },
    admitAssetEgress: (): void => undefined,
    // POSTURE 2 — records what the membrane stashed instead of performing, so a test can tell "asked" from
    // "refused" from "did it". Those three are different outcomes and only the first is correct here.
    suggest: (_chatId, act): Promise<void> => {
      suggested.acts.push(act);
      return Promise.resolve();
    },
    ui: { setState: () => Promise.resolve(), toast: () => Promise.resolve(), openDialog: () => Promise.resolve() },
    databank: { ingest: () => Promise.resolve({ documentId: "doc_test" }) },
    character: {
      ingest: () => Promise.resolve({ characterId: "char_test", created: true }),
      ingestAsset: () => Promise.resolve({ characterId: "char_test", created: true }),
      setCardData: () => Promise.resolve(),
      getCardData: () => Promise.resolve(null),
    },
    pubsub: { emit: () => Promise.resolve() },
  };
  return { bridge, kv, store, notices, chips, writes, lore, pics, turns, quiets, egress, suggested };
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
      "llm.quiet",
    ] as const;
    const main =
      "const h = orb.host(1); const has = (k) => k in h; orb.host(1).log.info(JSON.stringify({ chat: has('chat'), variables: has('variables'), tools: has('tools'), grants: Array.isArray(h.grants), worldInfo: has('worldInfo'), imagery: has('imagery'), storage: has('storage'), notifications: has('notifications'), events: has('events'), transforms: has('transforms'), net: has('net'), llm: has('llm'), requestTurn: typeof h.chat.requestTurn === 'function', surfaceQuickReply: typeof h.chat.surfaceQuickReply === 'function', storageGet: typeof h.storage.get === 'function', notifyPost: typeof h.notifications.post === 'function' }));";
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
      llm: true, // llm.quiet — the SPEND-class quiet generation namespace
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

  test("a NON-HOST caller's requestTurn becomes an ASK, end-to-end through the real runtime (posture 2)", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = fakeBridge();
    const main = "const h = orb.host(1); h.chat.requestTurn(h.chat.current()).catch((e) => h.log.error('t:' + e.name));";
    // canWrite:false ⇒ the acting principal is not host of the chat. This USED to be a flat refusal, which is
    // posture 3 wearing posture 2's clothes; the #14 three-posture law says the act becomes an ASK the host
    // confirms. BOTH halves are asserted, because either alone would be a lie: no turn was taken, AND an ask
    // was stored. The guest is told by TYPE — `PluginSuggestedError`, not the capability refusal (which would
    // claim the grant is missing) and not a resolve (which would claim the turn ran).
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
    expect(host.readLog(outcome.instance).some((l) => l.message === "t:PluginSuggestedError")).toBe(true);
    expect(fake.turns.count).toBe(0);
    expect(fake.suggested.acts.map((a) => a.kind)).toEqual(["requestTurn"]);
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

  // C6 — the guest VOCABULARY fence. A REGRESSION GUARD, not a defect proof: the membrane already collapsed
  // any unrecognised selector to `host`, and this pins that the actor-excluding member joins that class
  // rather than the all-members one when the third recipient landed on the axis. It is the runtime half of a
  // wall that is primarily TYPED (`PLUGIN_NOTIFICATION_RECIPIENTS` — a guest's selector cannot name it), and
  // the reason it exists at all: a guest `notify` carries no triggering fact, so the member has no actor to
  // exclude and would silently mean "everyone" — the widest set, reached by naming the narrowest-sounding
  // word. Collapsing to `host` fails toward the SMALLEST recipient set instead.
  test("a guest naming the actor-excluding recipient falls back to `host`, never to all_members", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = fakeBridge();
    const main = 'const h = orb.host(1); h.notifications.post(h.chat.current(), "all_members_except_actor", "psst").then(() => h.log.info("posted"));';
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
    expect(fake.notices).toEqual([{ recipient: "host", message: "psst" }]);
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

// #1474 item 1: a snippet mints the SAME 32 MiB QuickJSContext an activation does, but `runSnippet` took no
// process admission at all — the only bound was `SNIPPET_CONCURRENCY_PER_USER`, a PER-USER cap, so N distinct
// members collectively blew straight past the process ceiling `createInstance` is careful to hold.
//
// The number is deliberately NOT imported here: what is load-bearing is that a bound EXISTS, is process-wide,
// is released, and does NOT share the residents' pool. The value + its rationale live in `budgets.ts`, and a
// test re-spelling it would only couple the two.
describe("runSnippet — process-wide snippet admission", () => {
  /** Hold a snippet in flight: it awaits a `getVariables` the test resolves later. */
  const heldSnippetCode = "const h = orb.host(1); h.chat.getVariables(h.chat.current()).then(() => h.log.info('released'));";
  /** Attempts, comfortably above any sane process snippet ceiling — the loop finds the bound, never asserts it. */
  const attemptCount = 12;

  function heldSnippetBridge(releases: (() => void)[]): PluginBridge {
    const base = fakeBridge().bridge;
    return {
      ...base,
      chat: {
        ...base.chat,
        getVariables: () =>
          new Promise<Record<string, string>>((resolve) => {
            releases.push(() => resolve({ held: "released" }));
          }),
      },
    };
  }

  test("concurrent snippets are bounded process-wide, refused with a typed capacity error, and the lease is released", { timeout: LONG }, async () => {
    // TWO host facades on purpose: the admission is a PROCESS ceiling, not a per-facade one.
    const hostA = makeHost();
    const hostB = makeHost();
    const releases: (() => void)[] = [];
    const bridge = heldSnippetBridge(releases);
    const run = (index: number): Promise<unknown> =>
      (index % 2 === 0 ? hostA : hostB)
        .runSnippet({ code: heldSnippetCode, grants: ["chat.read"], bridge, chat: { chatId: CHAT, canWrite: false, automationDepth: 0 } })
        .then(
          () => "ran",
          (err: unknown) => err,
        );

    const attempts = Array.from({ length: attemptCount }, (_, index) => run(index));
    try {
      await settleTicks();
      const refusals: unknown[] = [];
      // Refusals settle immediately (nothing is minted); the admitted ones are still held on the bridge gate.
      for (const attempt of attempts) {
        const settledEarly = await Promise.race([attempt, Promise.resolve(PENDING)]);
        if (settledEarly !== PENDING) {
          refusals.push(settledEarly);
        }
      }
      expect(refusals.length).toBeGreaterThan(0);
      for (const refusal of refusals) {
        expect(refusal).toBeInstanceOf(Error);
        expect((refusal as Error).message).toMatch(SNIPPET_CAPACITY_RE);
      }
      // The admitted set is what actually held contexts — strictly fewer than the attempts: the bound.
      expect(refusals.length).toBeLessThan(attemptCount);
    } finally {
      // Release in a `finally`: a failed assertion above must not strand the admitted leases and turn one
      // red into a cascade of capacity refusals across every later test in this file.
      for (const release of releases) {
        release();
      }
      await Promise.all(attempts);
    }

    // THE LEASE IS RELEASED after the run (the `using` teardown, not before it) — a fresh snippet is admitted
    // once the held ones are done. Without a release, this is the arm that turns a bound into a one-way latch.
    const after = await hostA.runSnippet({
      code: "orb.host(1).log.info('after');",
      grants: [],
      bridge,
      chat: { chatId: CHAT, canWrite: false, automationDepth: 0 },
    });
    expect(after.error).toBeUndefined();
    expect(after.logLines).toContain("[info] after");
  });

  // The OTHER direction of the same claim. Green today (the two pools are independent closures in
  // `port.ts` — one `createAdmission` per ceiling), so this is a FENCE too, not a defect proof: it is what
  // fails the day someone "simplifies" the two counters into one. Stated BOTH ways on purpose — "separate
  // pools" is a symmetric claim, and a one-directional test lets the merge land as long as the merged pool
  // happens to be big enough for the one arm that is tested.
  test("FENCE: a snippet storm cannot refuse an ACTIVATION (the separation holds in both directions)", { timeout: LONG }, async () => {
    const host = makeHost();
    const releases: (() => void)[] = [];
    const heldBridge = heldSnippetBridge(releases);
    const { bridge } = fakeBridge();
    const held: Promise<unknown>[] = [];
    let activated: PluginInstance | undefined;
    try {
      // Fill the snippet pool to its ceiling and leave every one of them in flight on the bridge gate.
      for (let index = 0; index < PLUGIN_SNIPPET_RUNTIME_MAX; index += 1) {
        held.push(
          host
            .runSnippet({ code: heldSnippetCode, grants: ["chat.read"], bridge: heldBridge, chat: { chatId: CHAT, canWrite: false, automationDepth: 0 } })
            .then(
              () => "ran",
              (err: unknown) => err,
            ),
        );
      }
      await settleTicks();
      // A NINTH snippet would be refused here — an activation must not be.
      const outcome = await host.createInstance({ mainJs: "'ok'", grants: [], bridge, chat: noChat });
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        activated = outcome.instance;
      }
    } finally {
      if (activated !== undefined) {
        host.dispose(activated);
      }
      for (const release of releases) {
        release();
      }
      await Promise.all(held);
    }
  });

  // GREEN BEFORE THE FIX, and labelled as such: this is a REGRESSION FENCE on the pool-separation decision,
  // not a defect proof. It passed when `runSnippet` took no admission at all (vacuously), and it must keep
  // passing now that it takes one — which is exactly what would break if the two pools were ever merged.
  test("FENCE: a full RESIDENT pool cannot starve snippets (the two pools are separate by design)", { timeout: LONG }, async () => {
    // A resident lease is held for the plugin's whole enabled lifetime; a snippet's is one call. Sharing one
    // counter would let PLUGIN_RESIDENT_RUNTIME_MAX installed plugins kill the console permanently.
    const host = makeHost();
    const { bridge } = fakeBridge();
    const residents: PluginInstance[] = [];
    try {
      for (let index = 0; index < PLUGIN_RESIDENT_RUNTIME_MAX; index += 1) {
        const outcome = await host.createInstance({ mainJs: "'ok'", grants: [], bridge, chat: noChat });
        expect(outcome.ok).toBe(true);
        if (outcome.ok) {
          residents.push(outcome.instance);
        }
      }
      // The resident pool is now exhausted — an activation would be refused here.
      const out = await host.runSnippet({
        code: "orb.host(1).log.info('snippet ran');",
        grants: [],
        bridge,
        chat: { chatId: CHAT, canWrite: false, automationDepth: 0 },
      });
      expect(out.error).toBeUndefined();
      expect(out.logLines).toContain("[info] snippet ran");
    } finally {
      for (const instance of residents) {
        host.dispose(instance);
      }
    }
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
    // The ADMITTED chatId crosses WITH the entry (the domain's attachment gate + entry cap need it, and the
    // guest-supplied bookId must never travel alone — a plugin invoked in chat X could otherwise write a book
    // attached only to chat Y). It is the resolved handle's chat, never a guest-supplied one.
    expect(fake.lore.chatIds).toEqual([CHAT]);
    expect(host.readLog(outcome.instance).some((l) => l.message === "pic:asset_generated0000000000000")).toBe(true);
    host.dispose(outcome.instance);
  });

  test("a NON-HOST caller's worldInfo write becomes an ASK carrying the entry verbatim (posture 2)", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = fakeBridge();
    const main = `
      const h = orb.host(1);
      h.worldInfo.upsertEntry(h.chat.current(), { bookId: "wb_1", entryKey: "k", keys: [], contentTemplate: "c", position: "after" })
        .catch((e) => h.log.error("w:" + e.name));`;
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
    expect(host.readLog(outcome.instance).some((l) => l.message === "w:PluginSuggestedError")).toBe(true);
    // No lore was written, and the ask carries the guest's entry — every domain gate it would have met
    // directly runs again when a host confirms, through the PLUGIN's own executor.
    expect(fake.lore.count).toBe(0);
    expect(fake.suggested.acts.map((a) => a.kind)).toEqual(["worldInfoUpsert"]);
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

describe("membrane — host-operation liveness cancellation", () => {
  function cancellableQuietBridge(delayMs: number): {
    readonly bridge: PluginBridge;
    readonly witness: { started: number; aborted: number; sideEffects: number };
  } {
    const base = fakeBridge().bridge;
    const witness = { started: 0, aborted: 0, sideEffects: 0 };
    return {
      bridge: {
        ...base,
        llm: {
          quiet: (_prompt, _opts, liveness) =>
            new Promise<{ readonly text: string }>((resolve, reject) => {
              witness.started += 1;
              const timer = setTimeout(() => {
                witness.sideEffects += 1;
                resolve({ text: "late" });
              }, delayMs);
              timer.unref();
              liveness.onAbort(() => {
                clearTimeout(timer);
                witness.aborted += 1;
                reject(new Error("plugin host operation aborted"));
              });
            }),
        },
      },
      witness,
    };
  }

  async function residentQuietTool(
    host: ReturnType<typeof createPluginHost>,
    bridge: PluginBridge,
    fireAndForget: boolean,
  ): Promise<{
    readonly instance: PluginInstance;
    readonly ref: PluginHandlerRef;
  }> {
    const call = fireAndForget ? "h.llm.quiet('work'); return 'started';" : "await h.llm.quiet('work'); return 'done';";
    const outcome = await host.createInstance({
      mainJs: `const h = orb.host(1); h.tools.register({ name: "quiet", description: "d", parameters: {}, handler: async () => { ${call} } });`,
      grants: ["tools.register", "llm.quiet"],
      bridge,
      chat: noChat,
      budgets: { cpuDeadlineMs: 100, memoryLimitBytes: PLUGIN_MEMORY_LIMIT_BYTES, settleGraceMs: HOST_FN_DEADLINE_MS + 1000 },
    });
    if (!outcome.ok) {
      throw new Error(`activation failed: ${outcome.error}`);
    }
    const ref = outcome.instance.tools[0]?.handler;
    if (ref === undefined) {
      throw new Error("test: quiet handler missing");
    }
    return { instance: outcome.instance, ref };
  }

  test("a host-function timeout aborts cooperative work and prevents its late side effect", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge, witness } = cancellableQuietBridge(HOST_FN_DEADLINE_MS + 100);
    const { instance, ref } = await residentQuietTool(host, bridge, false);
    try {
      await expect(host.invoke(instance, ref, "{}", noChat)).rejects.toThrow(HOST_FN_EXCEEDED_RE);
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(witness).toEqual({ started: 1, aborted: 1, sideEffects: 0 });
    } finally {
      host.dispose(instance);
    }
  });

  test("disposing a resident aborts cooperative fire-and-forget work and prevents its late side effect", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge, witness } = cancellableQuietBridge(100);
    const { instance, ref } = await residentQuietTool(host, bridge, true);
    expect(await host.invoke(instance, ref, "{}", noChat)).toBe("started");
    expect(witness.started).toBe(1);
    host.dispose(instance);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(witness).toEqual({ started: 1, aborted: 1, sideEffects: 0 });
  });

  test("disposing during an awaited host operation cancels it, joins the invoke tail, and leaves no late side effect", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge, witness } = cancellableQuietBridge(1000);
    const { instance, ref } = await residentQuietTool(host, bridge, false);
    const invoked = host.invoke(instance, ref, "{}", noChat);
    await settleTicks();
    expect(witness.started).toBe(1);

    host.dispose(instance);
    await expect(invoked).rejects.toThrow(HOST_OPERATION_ABORTED_RE);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(witness).toEqual({ started: 1, aborted: 1, sideEffects: 0 });
    await expect(host.invoke(instance, ref, "{}", noChat)).rejects.toThrow(UNKNOWN_OR_DISPOSED_RE);
  });
});

// #782 — dispose's DETACHED cleanup join must SURFACE a settle failure, not swallow it. When the resident still
// has in-flight host work at dispose, teardown is deferred onto `superviseDetached(() => resident.tail
// .then(settle)...)`, and port.ts's header claims "the detached join is supervised so cleanup failure is
// observable." A `settleHostOperations()` REJECTION must therefore reach superviseDetached's failure sink (its
// terminal `.catch` logs ONE structured line: `getLog().error({ err, spanName }, "detached operation failed")`).
// The pre-fix `.then(finish, finish)` passed the void-returning `finish` as BOTH the fulfil AND the reject
// handler, so a settle rejection ran `finish` as the reject handler, returned void, and RESOLVED the supervised
// promise — the failure was swallowed and the sink never fired (the header's claim was false as written).
// `settleHostOperations` is non-rejecting in the real Sandbox BY DESIGN (its barriers project rejection through
// the guest promise and never reject the join), so injecting the rejection AT that seam is the ONLY reachable
// door to this join's rejection path — the assertion is on the DISPOSE JOIN's error propagation, not on settle.
// `finish` must still run EXACTLY ONCE on both arms: the sandbox is disposed once (a double `ctx.dispose()`
// aborts the shared WASM module), and `dispose()` completing means its `finally` releaseAdmission ran too.
describe("port.dispose — the detached cleanup join surfaces a settle failure (#782)", () => {
  const detachedFailureMsg = "detached operation failed";

  /** A bridge whose `chat.getVariables` NEVER settles: a fire-and-forget guest call leaves one host op in flight
   *  at dispose, so `cancelHostOperations` only signals it (controllers stay registered — `pendingHostOperations`
   *  stays > 0) and dispose takes the DEFERRED `superviseDetached` teardown path rather than the synchronous one. */
  function pendingGetVarsBridge(): PluginBridge {
    const base = fakeBridge().bridge;
    const neverSettles = new Promise<Record<string, string>>(() => undefined);
    return { ...base, chat: { ...base.chat, getVariables: () => neverSettles } };
  }

  /** Activate a resident whose one tool fires a never-settling host call fire-and-forget then returns — after the
   *  invoke returns, that host op is still in flight, forcing dispose down the detached teardown join. */
  async function residentWithPendingHostOp(host: ReturnType<typeof createPluginHost>, bridge: PluginBridge): Promise<PluginInstance> {
    const main =
      "orb.host(1).tools.register({ name: 'leak', description: 'd', parameters: { type: 'object', properties: {} }, handler: async () => { const h = orb.host(1); h.chat.getVariables(h.chat.current()); return 'ok'; } });";
    const outcome = await host.createInstance({ mainJs: main, grants: ["tools.register", "chat.read"], bridge, chat: noChat });
    if (!outcome.ok) {
      throw new Error(`activation failed: ${outcome.error}`);
    }
    const ref = outcome.instance.tools[0]?.handler;
    if (ref === undefined) {
      throw new Error("test: leak handler missing");
    }
    expect(await host.invoke(outcome.instance, ref, "{}", { chatId: CHAT, canWrite: true, automationDepth: 0 })).toBe("ok");
    return outcome.instance;
  }

  /** Spin the macrotask queue so the detached chain (tail → settle reject → finish → propagate → withRequestSpan
   *  seal → superviseDetached's `.catch`) flushes fully before we assert on the fire-and-forget supervisor. */
  function flushDetached(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 100));
  }

  test("a settleHostOperations REJECTION on the deferred teardown path is OBSERVED (superviseDetached logs it), and finish runs once", {
    timeout: LONG,
  }, async () => {
    const host = makeHost();
    const instance = await residentWithPendingHostOp(host, pendingGetVarsBridge());

    // The real barrier never rejects, so this seam is the only reachable door to the join's rejection path. A
    // UNIQUE message attributes the observed failure to THIS dispose's supervised operation.
    const settleBoom = "settle-boom-782";
    const settleSpy = vi.spyOn(Sandbox.prototype, "settleHostOperations").mockRejectedValue(new Error(settleBoom));
    const disposeSpy = vi.spyOn(Sandbox.prototype, "dispose");
    const errorSpy = vi.spyOn(logger, "error");

    // Pending host op → dispose defers teardown onto superviseDetached(() => resident.tail.then(settle)...).
    host.dispose(instance);
    await flushDetached();

    // THE BUG (red): pre-fix `.then(finish, finish)` swallowed the rejection — the supervised promise resolved and
    // this operator-visible sink NEVER fired. The fix (`.finally(finish)`) propagates the rejection so
    // superviseDetached's `.catch` logs exactly one structured line carrying the settle error.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ spanName: "plugin.host.dispose", err: expect.objectContaining({ message: settleBoom }) }),
      detachedFailureMsg,
    );
    // finish still ran EXACTLY ONCE on the reject arm — the sandbox is disposed once (a double dispose aborts the
    // shared WASM), and dispose() completing means its `finally` releaseAdmission ran too (cleanup still happened).
    expect(disposeSpy).toHaveBeenCalledTimes(1);

    settleSpy.mockRestore();
    disposeSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test("a settleHostOperations that RESOLVES on the deferred path completes cleanly — finish runs once, no failure logged", { timeout: LONG }, async () => {
    const host = makeHost();
    const instance = await residentWithPendingHostOp(host, pendingGetVarsBridge());

    // The fulfil arm: settle resolves, so the supervised operation succeeds and no detached failure is logged.
    const settleSpy = vi.spyOn(Sandbox.prototype, "settleHostOperations").mockResolvedValue(undefined);
    const disposeSpy = vi.spyOn(Sandbox.prototype, "dispose");
    const errorSpy = vi.spyOn(logger, "error");

    host.dispose(instance);
    await flushDetached();

    // On fulfil the supervised promise still resolves (no error sink), and finish ran exactly once — the fix
    // must not regress the happy path into a spurious failure or a double teardown.
    expect(errorSpy).not.toHaveBeenCalledWith(expect.anything(), detachedFailureMsg);
    expect(disposeSpy).toHaveBeenCalledTimes(1);

    settleSpy.mockRestore();
    disposeSpy.mockRestore();
    errorSpy.mockRestore();
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

  test("ui.register UPSERTS by surface id — a re-registration REPLACES the row, never appends a duplicate", async () => {
    // The hub-v1.3 revision path: the atlas registers its default posture synchronously at activation, then
    // re-registers the SAME id once its kv-persisted SFW setting lands. Without the upsert the stale first
    // row would project twice through listSurfaces and win every `find` — a lying surface. Driven over the
    // REAL Sandbox collect path (the fake-collect membrane tests cannot see this; it lives in ResidentState).
    const fake = fakeBridge();
    const sandbox = await Sandbox.create(makeSeams(), {
      membrane: { grants: new Set<PluginCapability>(["ui.surface"]), bridge: fake.bridge, netHosts: [] },
    });
    const activated = await sandbox.evalGuest(`
      const host = orb.host(1);
      host.ui.register({ id: "panel", anchor: "settings", title: "First", tier: "static", spec: { kind: "text", value: "a" }, onAction: () => {} });
      host.ui.register({ id: "panel", anchor: "settings", title: "Second", tier: "static", spec: { kind: "toggle", name: "sfw", label: "SFW only", value: true }, onAction: () => {} });
      host.ui.register({ id: "other", anchor: "settings", title: "Other", tier: "static", spec: { kind: "text", value: "b" } });
      "ok"`);
    expect(activated.ok).toBe(true);
    // ONE row per id, the LATEST registration's meta — and a distinct id still appends.
    expect(sandbox.collectedSurfaces.map((s) => [s.id, s.title])).toEqual([
      ["panel", "Second"],
      ["other", "Other"],
    ]);
    expect(JSON.stringify(sandbox.collectedSurfaces[0]?.spec)).toContain('"name":"sfw"');
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

// The FIFO's "a hung guest deadlines and the queue advances" claim was FALSE until the settlement deadline
// landed: the interrupt preempts BYTECODE only, so a handler returning `new Promise(() => {})` never settled —
// `queueDepth` never decremented and, after EVENT_QUEUE_DEPTH such invokes, the instance refused EVERYTHING
// forever while its row still said `enabled`. These are the wedge pins.
describe("the invocation SETTLEMENT deadline through the port (the FIFO wedge + the snippet leak)", () => {
  /** A resident instance carrying a hanging handler + a healthy one, on a TIGHT settlement wall. */
  async function residentHangTool(
    host: ReturnType<typeof createPluginHost>,
  ): Promise<{ instance: PluginInstance; hang: PluginHandlerRef; ok: PluginHandlerRef }> {
    const { bridge } = fakeBridge();
    const main = `
      const h = orb.host(1);
      h.tools.register({ name: "hang", description: "never settles", parameters: { type: "object", properties: {} }, handler: () => new Promise(() => {}) });
      h.tools.register({ name: "ok", description: "fine", parameters: { type: "object", properties: {} }, handler: async () => "healthy" });
      'ok';`;
    const outcome = await host.createInstance({
      mainJs: main,
      grants: ["tools.register"],
      bridge,
      chat: noChat,
      budgets: { cpuDeadlineMs: 100, memoryLimitBytes: PLUGIN_MEMORY_LIMIT_BYTES, settleGraceMs: 150 },
    });
    if (!outcome.ok) {
      throw new Error(`activation failed: ${outcome.error}`);
    }
    const hang = outcome.instance.tools.find((t) => t.name === "hang")?.handler;
    const ok = outcome.instance.tools.find((t) => t.name === "ok")?.handler;
    if (hang === undefined || ok === undefined) {
      throw new Error("no handler refs");
    }
    return { instance: outcome.instance, hang, ok };
  }

  test("a hung handler's invoke REJECTS and the per-instance FIFO advances (it no longer wedges)", { timeout: LONG }, async () => {
    const host = makeHost();
    const { instance, hang, ok } = await residentHangTool(host);
    await expect(host.invoke(instance, hang, "{}", noChat)).rejects.toThrow(INVOCATION_ENDED_RE);
    // The instance is NOT collateral damage: its other tools still run (one hung handler must not kill a
    // plugin's whole surface — there is no lazy re-activation to recover it).
    expect(await host.invoke(instance, ok, "{}", noChat)).toBe("healthy");
    host.dispose(instance);
  });

  test("a FLOOD of hung invokes drains instead of pinning the instance forever (queueDepth is released)", { timeout: LONG }, async () => {
    const host = makeHost();
    const { instance, hang, ok } = await residentHangTool(host);
    // Fill the bounded FIFO with hangs. Pre-fix every one of these was permanently pending, so the instance
    // was dead — tools, transforms and event handlers all refused with `queue full` while the row said enabled.
    const flood = Array.from({ length: EVENT_QUEUE_DEPTH }, () => host.invoke(instance, hang, "{}", noChat).catch(() => "ended"));
    expect(await Promise.all(flood)).toEqual(new Array(EVENT_QUEUE_DEPTH).fill("ended"));
    // The queue is empty again — a healthy invoke is admitted and runs.
    expect(await host.invoke(instance, ok, "{}", noChat)).toBe("healthy");
    host.dispose(instance);
  });

  test("a hung SNIPPET returns instead of stranding its 32 MiB context (the member-reachable path)", { timeout: LONG }, async () => {
    // `plugin.runSnippet` is a plain authedProcedure on the loose `general` bucket (600 req/min per user), and
    // its sandbox is scope-owned (`using`) — a scope that never exits never disposes, so before the settlement
    // deadline ONE line of guest JS, repeated, was an unbounded per-call context leak inside the ONE shared
    // WASM module. The snippet wall is SNIPPET_WALL_MS + the grace (the grace is load-bearing — see the
    // legitimate-slow-host-call pin below), so this test runs for that long by design.
    const host = makeHost();
    const { bridge } = fakeBridge();
    const result = await host.runSnippet({
      code: "new Promise(() => {})",
      grants: ["chat.read"],
      bridge,
      chat: { chatId: CHAT, canWrite: false, automationDepth: 0 },
    });
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(INVOCATION_ENDED_RE);
  });

  test("the wall does NOT end a guest legitimately awaiting a host call slower than its CPU deadline", { timeout: LONG }, async () => {
    // WHY THE GRACE IS THE HOST-FN DEADLINE, pinned: the interrupt does NOT reliably fire on the short
    // continuation after an `await`, so `const r = await h.net.fetch(u); return r.body` SUCCEEDS well past
    // `cpuDeadlineMs` (measured: a 1.5 s host call under a 200 ms cpu deadline returns its value). A settlement
    // wall tighter than one host-fn deadline would therefore kill working plugins, not hung ones.
    const host = makeHost();
    const base = fakeBridge().bridge;
    const bridge: PluginBridge = {
      ...base,
      chat: { ...base.chat, getVariables: () => new Promise((resolve) => setTimeout(() => resolve({ tension: "9" }), 800)) },
    };
    const main = `
      const h = orb.host(1);
      h.tools.register({
        name: "slow",
        description: "awaits a slow host call",
        parameters: { type: "object", properties: {} },
        handler: async () => "got:" + (await h.chat.getVariables(h.chat.current())).tension,
      });
      'ok';`;
    const outcome = await host.createInstance({
      mainJs: main,
      grants: ["tools.register", "chat.read"],
      bridge,
      chat: noChat,
      budgets: { cpuDeadlineMs: 200, memoryLimitBytes: PLUGIN_MEMORY_LIMIT_BYTES, settleGraceMs: HOST_FN_DEADLINE_MS },
    });
    if (!outcome.ok) {
      throw new Error(`activation failed: ${outcome.error}`);
    }
    const ref = outcome.instance.tools[0]?.handler;
    if (ref === undefined) {
      throw new Error("no handler ref");
    }
    expect(await host.invoke(outcome.instance, ref, "{}", { chatId: CHAT, canWrite: false, automationDepth: 0 })).toBe("got:9");
    host.dispose(outcome.instance);
  });
});

describe("readLog is a RUNTIME record, not an activation snapshot (#627)", () => {
  test("lines a resident handler logs are RETAINED and readable after the invoke", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const main = `
      const h = orb.host(1);
      h.log.info("booted");
      h.tools.register({
        name: "speak", description: "log at runtime", parameters: { type: "object", properties: {} },
        handler: async (args) => { h.log.warn("ran:" + args.n); return "ok"; },
      });
      'ok';`;
    const outcome = await host.createInstance({ mainJs: main, grants: ["tools.register"], bridge, chat: noChat });
    if (!outcome.ok) {
      throw new Error(`activation failed: ${outcome.error}`);
    }
    const ref = outcome.instance.tools[0]?.handler;
    if (ref === undefined) {
      throw new Error("no handler ref");
    }
    await host.invoke(outcome.instance, ref, JSON.stringify({ n: 1 }), noChat);
    await host.invoke(outcome.instance, ref, JSON.stringify({ n: 2 }), noChat);
    const log = host.readLog(outcome.instance);
    // The activation banner survives AND both per-invocation lines are there, oldest-first.
    expect(log.map((l) => l.message)).toEqual(["booted", "ran:1", "ran:2"]);
    expect(log.every((l) => l.at === FIXED_EPOCH)).toBe(true);
    expect(log.find((l) => l.message === "ran:1")?.level).toBe("warn");
    host.dispose(outcome.instance);
  });

  test("the ring is BOUNDED on lines — a flood evicts the OLDEST, the newest always survives", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    // 200 lines per call (under the per-invocation LogRing's own 256) × 8 calls > the ring — so eviction must run.
    const main = `
      const h = orb.host(1);
      h.log.info("booted");
      h.tools.register({
        name: "spam", description: "200 lines per call", parameters: { type: "object", properties: {} },
        handler: async (args) => { for (let i = 0; i < 200; i++) { h.log.info("n:" + args.n + ":" + i); } return "ok"; },
      });
      'ok';`;
    const outcome = await host.createInstance({ mainJs: main, grants: ["tools.register"], bridge, chat: noChat });
    if (!outcome.ok) {
      throw new Error(`activation failed: ${outcome.error}`);
    }
    const ref = outcome.instance.tools[0]?.handler;
    if (ref === undefined) {
      throw new Error("no handler ref");
    }
    const calls = 8;
    for (let n = 0; n < calls; n++) {
      await host.invoke(outcome.instance, ref, JSON.stringify({ n }), noChat);
    }
    const log = host.readLog(outcome.instance);
    expect(log.length).toBeLessThanOrEqual(PLUGIN_LOG_RING_LINES);
    // The activation banner is the FIRST thing evicted; the newest line is always present.
    expect(log.some((l) => l.message === "booted")).toBe(false);
    expect(log.at(-1)?.message).toBe(`n:${calls - 1}:199`);
    host.dispose(outcome.instance);
  });

  test("the ring is BOUNDED on volume — fat lines cannot pin a plugin's worth of host memory", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    // 100 × 2000-char lines per call = 200k chars drained in ONE invocation, past the ring's char budget.
    const main = `
      const h = orb.host(1);
      h.tools.register({
        name: "fat", description: "fat lines", parameters: { type: "object", properties: {} },
        handler: async () => { const big = "x".repeat(2000); for (let i = 0; i < 100; i++) { h.log.info(big); } return "ok"; },
      });
      'ok';`;
    const outcome = await host.createInstance({ mainJs: main, grants: ["tools.register"], bridge, chat: noChat });
    if (!outcome.ok) {
      throw new Error(`activation failed: ${outcome.error}`);
    }
    const ref = outcome.instance.tools[0]?.handler;
    if (ref === undefined) {
      throw new Error("no handler ref");
    }
    await host.invoke(outcome.instance, ref, "{}", noChat);
    await host.invoke(outcome.instance, ref, "{}", noChat);
    const retained = host.readLog(outcome.instance).reduce((sum, l) => sum + l.message.length, 0);
    expect(retained).toBeLessThanOrEqual(PLUGIN_LOG_RING_CHARS);
    expect(retained).toBeGreaterThan(0);
    host.dispose(outcome.instance);
  });

  test("readLog hands back a SNAPSHOT — a later invoke does not mutate a prior read", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const main = `
      const h = orb.host(1);
      h.tools.register({
        name: "speak", description: "d", parameters: { type: "object", properties: {} },
        handler: async () => { h.log.info("later"); return "ok"; },
      });
      'ok';`;
    const outcome = await host.createInstance({ mainJs: main, grants: ["tools.register"], bridge, chat: noChat });
    if (!outcome.ok) {
      throw new Error(`activation failed: ${outcome.error}`);
    }
    const ref = outcome.instance.tools[0]?.handler;
    if (ref === undefined) {
      throw new Error("no handler ref");
    }
    const before = host.readLog(outcome.instance);
    await host.invoke(outcome.instance, ref, "{}", noChat);
    expect(before).toHaveLength(0);
    expect(host.readLog(outcome.instance).map((l) => l.message)).toEqual(["later"]);
    host.dispose(outcome.instance);
  });
});

/** The #806 witness: a resident tool whose handler FLOATS a continuation (returns at once) that logs only
 *  once a GATED `storage.get` settles — so the line is pushed into the per-invocation ring AFTER the
 *  invocation drained, in a post-settle job pump, exactly where a hub-search continuation logs its failure. */
const FLOAT_LOG_SRC = `
  const h = orb.host(1);
  h.tools.register({
    name: "go", description: "float then log", parameters: { type: "object", properties: {} },
    handler: (args) => {
      void h.storage.get("gate").then(() => { h.log.warn("float:" + args.tag); });
      h.log.info("scheduled:" + args.tag);
      return "scheduled";
    },
  });
  'ok';`;

/** A bridge whose every `storage.get` blocks on ITS OWN gate; `open()` releases the oldest unopened one — so
 *  the test decides exactly which invocation's float lands, and when (after that invocation drained). */
function gatedStorageBridge(): { bridge: PluginBridge; open: () => void } {
  const base = fakeBridge().bridge;
  const gates: (() => void)[] = [];
  const bridge: PluginBridge = {
    ...base,
    storage: {
      ...base.storage,
      get: () =>
        new Promise<string | null>((resolve) => {
          gates.push(() => resolve(null));
        }),
    },
  };
  return {
    bridge,
    open: (): void => {
      const release = gates.shift();
      if (release === undefined) {
        throw new Error("test: no gated storage.get to open");
      }
      release();
    },
  };
}

async function floatingResident(
  host: ReturnType<typeof createPluginHost>,
  bridge: PluginBridge,
  label?: string,
): Promise<{ instance: PluginInstance; ref: PluginHandlerRef }> {
  const outcome = await host.createInstance({
    mainJs: FLOAT_LOG_SRC,
    grants: ["tools.register", "storage.kv"],
    bridge,
    chat: noChat,
    ...(label === undefined ? {} : { label }),
  });
  if (!outcome.ok) {
    throw new Error(`activation failed: ${outcome.error}`);
  }
  const ref = outcome.instance.tools[0]?.handler;
  if (ref === undefined) {
    throw new Error("no handler ref");
  }
  return { instance: outcome.instance, ref };
}

describe("floated-continuation log lines SURVIVE and are attributed (#806) — and mirror into the central log", () => {
  test("a line a float logs AFTER its invocation drained survives a LATER invocation and reads in push order", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge, open } = gatedStorageBridge();
    const { instance, ref } = await floatingResident(host, bridge);
    expect(await host.invoke(instance, ref, JSON.stringify({ tag: 1 }), noChat)).toBe("scheduled");
    // The scheduling invocation drained ("scheduled:1"); the float is still parked on the gate.
    expect(host.readLog(instance).map((l) => l.message)).toEqual(["scheduled:1"]);
    open();
    await settleTicks();
    // The next invocation must NOT destroy the residue: pre-fix, `runToSettlement`'s opening reset ate it.
    // (Its own float stays gated, so the ring holds exactly the three lines in push order.)
    await host.invoke(instance, ref, JSON.stringify({ tag: 2 }), noChat);
    expect(host.readLog(instance).map((l) => l.message)).toEqual(["scheduled:1", "float:1", "scheduled:2"]);
    host.dispose(instance);
  });

  test("readLog ALONE surfaces the float's line — no later invocation needed (plugin.getLog tells the truth live)", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge, open } = gatedStorageBridge();
    const { instance, ref } = await floatingResident(host, bridge);
    await host.invoke(instance, ref, JSON.stringify({ tag: 1 }), noChat);
    open();
    await settleTicks();
    const log = host.readLog(instance);
    expect(log.map((l) => l.message)).toEqual(["scheduled:1", "float:1"]);
    expect(log.find((l) => l.message === "float:1")?.level).toBe("warn");
    // Picked up ONCE: a second read does not duplicate the residue.
    expect(host.readLog(instance).map((l) => l.message)).toEqual(["scheduled:1", "float:1"]);
    host.dispose(instance);
  });

  test("a labelled instance mirrors every accepted guest line into the ONE pino stream AT PUSH TIME, tagged `plugin`", { timeout: LONG }, async () => {
    const infoSpy = vi.spyOn(logger, "info");
    const warnSpy = vi.spyOn(logger, "warn");
    const host = makeHost();
    const { bridge, open } = gatedStorageBridge();
    const { instance, ref } = await floatingResident(host, bridge, "card-atlas");
    await host.invoke(instance, ref, JSON.stringify({ tag: 1 }), noChat);
    // The invocation's own line mirrored as it was pushed (before any drain read it back).
    expect(infoSpy).toHaveBeenCalledWith({ plugin: "card-atlas" }, "scheduled:1");
    expect(warnSpy).not.toHaveBeenCalledWith({ plugin: "card-atlas" }, "float:1");
    open();
    await settleTicks();
    // The FLOAT's line landed in the central stream with NO readLog and NO later invocation — the line the
    // live stage could never show is now in `/api/_debug/logs?q=card-atlas` the moment the guest writes it.
    expect(warnSpy).toHaveBeenCalledWith({ plugin: "card-atlas" }, "float:1");
    host.dispose(instance);
  });

  test("an UNLABELLED instance mirrors nothing (the snippet posture — a label is never invented)", { timeout: LONG }, async () => {
    const infoSpy = vi.spyOn(logger, "info");
    const host = makeHost();
    const { bridge } = gatedStorageBridge();
    const { instance, ref } = await floatingResident(host, bridge);
    await host.invoke(instance, ref, JSON.stringify({ tag: 1 }), noChat);
    expect(infoSpy).not.toHaveBeenCalledWith(expect.objectContaining({ plugin: expect.anything() }), expect.anything());
    host.dispose(instance);
  });
});

describe("membrane — the INBOUND host-call args cap (the mirror of the 1 MiB result cap) (#628 P3-J)", () => {
  test("a guest argument over the inbound cap is refused LOUDLY — the bridge op never runs", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = fakeBridge();
    // A guest string just past the declared cap, handed to storage.set. Only the 32 MiB guest heap bounded this
    // before, so the host materialized whatever the guest could allocate — per call, times the ≤32 in-flight
    // ceiling. Derived from the constant so a budget re-tune moves the pin with it, never past it.
    const main = `
      const h = orb.host(1);
      h.storage.set("k", "x".repeat(${HOST_FN_ARGS_MAX_BYTES + 1}))
        .then(() => h.log.info("STORED"))
        .catch((e) => h.log.error("refused:" + e.message));
      'ok';`;
    const outcome = await host.createInstance({ mainJs: main, grants: ["storage.kv"], bridge: fake.bridge, chat: noChat });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const log = host.readLog(outcome.instance);
    expect(log.some((l) => l.message === "STORED")).toBe(false);
    expect(log.some((l) => l.level === "error" && ARGS_CAP_RE.test(l.message))).toBe(true);
    // The refusal is BEFORE the op: nothing reached the plugin-private store.
    expect(fake.store.size).toBe(0);
    host.dispose(outcome.instance);
  });

  test("a normal-sized argument still crosses (the cap only fires on gross abuse)", { timeout: LONG }, async () => {
    const host = makeHost();
    const fake = fakeBridge();
    const main = `
      const h = orb.host(1);
      h.storage.set("k", "x".repeat(1024)).then(() => h.log.info("STORED")).catch((e) => h.log.error("refused:" + e.message));
      'ok';`;
    const outcome = await host.createInstance({ mainJs: main, grants: ["storage.kv"], bridge: fake.bridge, chat: noChat });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(host.readLog(outcome.instance).some((l) => l.message === "STORED")).toBe(true);
    expect(fake.store.get("k")).toHaveLength(1024);
    host.dispose(outcome.instance);
  });
});

describe("the resident-handler args channel is JSON DATA, never guest SOURCE (#628 P3-L)", () => {
  /** A resident tool that reports what it received + whether a side effect ever ran in its realm. */
  const witnessSrc = `
    const h = orb.host(1);
    globalThis.__sideEffect = 0;
    h.tools.register({
      name: "witness", description: "report the args it was handed", parameters: { type: "object", properties: {} },
      handler: async (args) => JSON.stringify({
        args: args ?? null,
        sideEffect: globalThis.__sideEffect,
        ownProto: args !== null && typeof args === "object" ? Object.hasOwn(args, "__proto__") : false,
        tainted: (args ?? {}).tainted ?? null,
      }),
    });
    'ok';`;

  async function witness(host: ReturnType<typeof createPluginHost>, bridge: PluginBridge): Promise<{ instance: PluginInstance; ref: PluginHandlerRef }> {
    const outcome = await host.createInstance({ mainJs: witnessSrc, grants: ["tools.register"], bridge, chat: noChat });
    if (!outcome.ok) {
      throw new Error(`activation failed: ${outcome.error}`);
    }
    const ref = outcome.instance.tools[0]?.handler;
    if (ref === undefined) {
      throw new Error("no handler ref");
    }
    return { instance: outcome.instance, ref };
  }

  test("a NON-JSON argsJson is refused — it never EXECUTES in the guest realm", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const { instance, ref } = await witness(host, bridge);
    // What a future non-JSON caller becomes today: the payload is interpolated as `(${json})` and EVALUATED, so
    // a comma expression runs its side effect inside the guest realm with that plugin's grants.
    await expect(host.invoke(instance, ref, "(globalThis.__sideEffect = 1, { evil: true })", noChat)).rejects.toThrow(ARGS_JSON_RE);
    const after = JSON.parse(await host.invoke(instance, ref, JSON.stringify({ ok: true }), noChat)) as { sideEffect: number };
    expect(after.sideEffect).toBe(0);
    host.dispose(instance);
  });

  test("a MALFORMED argsJson fails loudly instead of silently becoming `undefined` args", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const { instance, ref } = await witness(host, bridge);
    await expect(host.invoke(instance, ref, "{not json", noChat)).rejects.toThrow(ARGS_JSON_RE);
    host.dispose(instance);
  });

  test("a `__proto__` key lands as an OWN property (JSON.parse semantics), never a prototype swap", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const { instance, ref } = await witness(host, bridge);
    const seen = JSON.parse(await host.invoke(instance, ref, `{"__proto__":{"tainted":true},"a":1}`, noChat)) as {
      ownProto: boolean;
      tainted: unknown;
    };
    expect(seen.ownProto).toBe(true);
    expect(seen.tainted).toBeNull();
    host.dispose(instance);
  });

  test("a guest that REPLACES JSON.parse cannot interpose on the host's inbound marshalling", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const main = `
      const h = orb.host(1);
      JSON.parse = () => ({ hijacked: true });
      h.tools.register({
        name: "w", description: "d", parameters: { type: "object", properties: {} },
        handler: async (args) => JSON.stringify(args ?? null),
      });
      'ok';`;
    const outcome = await host.createInstance({ mainJs: main, grants: ["tools.register"], bridge, chat: noChat });
    if (!outcome.ok) {
      throw new Error(`activation failed: ${outcome.error}`);
    }
    const ref = outcome.instance.tools[0]?.handler;
    if (ref === undefined) {
      throw new Error("no handler ref");
    }
    expect(await host.invoke(outcome.instance, ref, JSON.stringify({ real: 1 }), noChat)).toBe(`{"real":1}`);
    host.dispose(outcome.instance);
  });

  test("well-formed JSON still round-trips unchanged (incl. U+2028 inside a string)", { timeout: LONG }, async () => {
    const host = makeHost();
    const { bridge } = fakeBridge();
    const { instance, ref } = await witness(host, bridge);
    const payload = { s: "a\u2028b", n: 4, deep: { list: [1, 2, 3] } };
    const seen = JSON.parse(await host.invoke(instance, ref, JSON.stringify(payload), noChat)) as { args: unknown };
    expect(seen.args).toEqual(payload);
    host.dispose(instance);
  });
});
