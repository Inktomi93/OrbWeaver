// activation: activate — the resident-instance lifecycle driven through setEnabled (03 §2). The collected
// registrations are handed to the registrar ops; a registrar refusal (a tool-name collision — activation-fatal,
// 03 §5) discards the WHOLE activation atomically (partial registrations unregistered, instance disposed, row
// errored). Deactivate unregisters every handle (no ghost tools/transforms/subs).
//
// PLUGIN-SPEND composed-real (FIX-1 end-to-end): the intra-invocation TOCTOU belt is proven at the UNIT level by
// the copy-based bite in substrate/spend-gate.int.test.ts. THIS file adds the COMPOSED-REAL proof that the belt
// is actually WIRED: a real plugin activated through `activate.ts` (the REAL per-instance `spendTail` + bridge +
// spend gate), a real QuickJS-ng guest firing a concurrent `Promise.all` burst of `chat.requestTurn` from ONE
// tool handler, against a real db budget row. If activate.ts's wiring ever drifts from the copy, THIS reddens.

import type { InvocationChat, PluginCapability } from "@orb/contracts/plugin";
import { castId } from "@orb/kit/ids";
import type { PluginHandlerRef, PluginHostOps, PluginInvokeHandler, PluginRegistrationHandle } from "@orb/server/domain/plugin";
import { PluginCrashedError } from "@orb/server/domain/plugin";
import { createPluginHost } from "@orb/server/infra/plugin-host";
import { selectBudget, upsertBudget } from "../../../../../packages/server/src/domain/plugin/persistence/budgets.ts";
import { getById } from "../../../../../packages/server/src/domain/plugin/persistence/plugins.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeBundle, makeInertOps, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

const HANDLER = castId<PluginHandlerRef>("handler_1");
const HANDLER2 = castId<PluginHandlerRef>("handler_2");

/** A recording registrar over the inert base: counts register/unregister so activation atomicity is observable. */
function recordingOps(overrides: { readonly failToolAt?: number } = {}): {
  readonly ops: PluginHostOps;
  readonly registered: string[];
  readonly unregistered: string[];
} {
  const registered: string[] = [];
  const unregistered: string[] = [];
  const base = makeInertOps();
  const handleFor = (name: string): PluginRegistrationHandle => ({
    unregister: (): void => {
      unregistered.push(name);
    },
  });
  const ops: PluginHostOps = {
    ...base,
    registrar: {
      registerTool: (reg): PluginRegistrationHandle => {
        registered.push(reg.name);
        if (overrides.failToolAt !== undefined && registered.length === overrides.failToolAt) {
          throw new Error(`tool name collision: ${reg.name}`);
        }
        return handleFor(reg.name);
      },
      registerTransform: (reg): PluginRegistrationHandle => {
        registered.push(reg.name);
        return handleFor(reg.name);
      },
      subscribeEvent: base.registrar.subscribeEvent,
    },
  };
  return { ops, registered, unregistered };
}

test("collected registrations are handed to the registrar; disable unregisters every handle", async () => {
  const db = await freshDb();
  const rec = recordingOps();
  const h = makePluginHarness(db, { ops: rec.ops });
  const owner = await seedUser(db, { handle: "owner" });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "mood", capabilities: ["tools.register", "chat.transform"] }),
    grant: ["tools.register", "chat.transform"],
  });
  // The runtime collected two tools + one transform from main.js.
  h.port.script({
    ok: true,
    instance: {
      tools: [
        { name: "t1", description: "", parameters: {}, handler: HANDLER },
        { name: "t2", description: "", parameters: {}, handler: HANDLER2 },
      ],
      transforms: [{ name: "x1", point: "user_input", handler: HANDLER }],
      events: [],
    },
  });

  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });
  expect(rec.registered).toEqual(["t1", "t2", "x1"]);

  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: false });
  expect([...rec.unregistered].sort((a, b) => a.localeCompare(b))).toEqual(["t1", "t2", "x1"]);
});

test("the manifest netHosts allowlist is forwarded to createInstance (net.fetch SSRF wall wiring)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "fetcher", capabilities: ["net.fetch"], netHosts: ["api.example.com", "cdn.example.com"] }),
    grant: ["net.fetch"],
  });

  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });

  // The re-validated manifest's allowlist crossed the seam verbatim (the infra host-fn pins safeFetch to it).
  expect(h.port.created.at(-1)?.netHosts).toEqual(["api.example.com", "cdn.example.com"]);
});

test("a bundle with no netHosts forwards no allowlist (fail-closed [] infra-side)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "plain" }), grant: [] });

  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });

  expect(h.port.created.at(-1)?.netHosts).toBeUndefined();
});

test("a registrar refusal discards the whole activation atomically (rollback + errored + disposed)", async () => {
  const db = await freshDb();
  const rec = recordingOps({ failToolAt: 2 }); // the SECOND tool collides
  const h = makePluginHarness(db, { ops: rec.ops });
  const owner = await seedUser(db, { handle: "owner" });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "mood", capabilities: ["tools.register"] }),
    grant: ["tools.register"],
  });
  h.port.script({
    ok: true,
    instance: {
      tools: [
        { name: "t1", description: "", parameters: {}, handler: HANDLER },
        { name: "t2", description: "", parameters: {}, handler: HANDLER2 },
      ],
      transforms: [],
      events: [],
    },
  });

  await expect(h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true })).rejects.toBeInstanceOf(PluginCrashedError);

  // The first tool's registration was rolled back; the instance was disposed; the row is errored.
  expect(rec.unregistered).toEqual(["t1"]);
  expect(h.port.disposed.length).toBe(1);
  const row = await getById(h.ctx.db, owner, installed.id);
  expect(row?.status).toBe("errored");
});

// ── PLUGIN-SPEND composed-real: the FIX-1 spend serializer proven END-TO-END through the REAL activate.ts ──────
// Booting QuickJS-ng WASM + running main.js + a burst-invoke is well past the 5 s default.
const WASM_SPEND_TIMEOUT_MS = 30_000;

/** Deterministic infra seams for the real `createPluginHost` port (a frozen clock — the guest's only time). */
function realSeeds(): { readonly nowEpochMs: () => number; readonly nextRandom: () => number; readonly mintId: () => string } {
  let n = 0;
  return {
    nowEpochMs: (): number => FROZEN_AT_MS,
    nextRandom: (): number => 0.5,
    mintId: (): string => {
      n += 1;
      return `id_${n}`;
    },
  };
}

/** A `PluginHostOps` whose `chat.requestTurn` YIELDS real microtasks (so the guest's concurrent burst genuinely
 *  interleaves — a sync fake would hide the intra-invocation race) + meters $0 (a local turn: the action-count
 *  belt is the belt under test). The registrar CAPTURES the `activate.ts`-built `invoke` closure + the collected
 *  tool handler so the test can fire the resident tool through the REAL port (→ REAL bridge → REAL spendTail). */
function burstOps(): {
  readonly ops: PluginHostOps;
  readonly captured: { invoke?: PluginInvokeHandler; handler?: PluginHandlerRef };
} {
  const captured: { invoke?: PluginInvokeHandler; handler?: PluginHandlerRef } = {};
  const base = makeInertOps();
  const ops: PluginHostOps = {
    ...base,
    chat: {
      ...base.chat,
      requestTurn: async (): Promise<{ costUsd: number | null }> => {
        await Promise.resolve();
        await Promise.resolve();
        return { costUsd: null };
      },
    },
    registrar: {
      ...base.registrar,
      registerTool: (reg, invoke): PluginRegistrationHandle => {
        captured.invoke = invoke;
        captured.handler = reg.handler;
        return { unregister: (): void => undefined };
      },
    },
  };
  return { ops, captured };
}

// A guest tool that, when invoked, fires N CONCURRENT `chat.requestTurn` from ONE handler body (the real
// intra-invocation concurrency path — a Promise.all burst, bounded by the 32-in-flight cap), catches each
// budget refusal (contained, never a crash), and returns the count that SUCCEEDED.
const BURST_N = 12;
const BURST_MAIN = `
  const h = orb.host(1);
  h.tools.register({
    name: "burst",
    description: "fire a concurrent requestTurn burst",
    parameters: { type: "object", properties: {} },
    handler: async () => {
      const token = h.chat.current();
      const outcomes = await Promise.all(
        Array.from({ length: ${BURST_N} }, () =>
          h.chat.requestTurn(token, {}).then(() => "ok", () => "refused")
        )
      );
      return JSON.stringify(outcomes.filter((o) => o === "ok").length);
    },
  });
  'ok';`;

const BURST_GRANTS: readonly PluginCapability[] = ["tools.register", "chat.read", "turn.trigger"];

test("composed-real: a concurrent requestTurn burst from one guest handler is spend-serialized (exactly M run, zero overshoot)", {
  timeout: WASM_SPEND_TIMEOUT_MS,
}, async () => {
  const db = await freshDb();
  const { ops, captured } = burstOps();
  // The REAL sandbox port over QuickJS-ng WASM (not the fake) — so `activate.ts` builds the REAL per-instance
  // spendTail + bridge + spend gate, and the guest actually runs.
  const h = makePluginHarness(db, { port: createPluginHost(realSeeds()), ops });
  const owner = await seedUser(db, { handle: "owner" });

  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "burster", capabilities: BURST_GRANTS }, BURST_MAIN),
    grant: BURST_GRANTS,
  });
  // Enable ⇒ REAL activate.ts: builds the spend gate + the per-instance `spendTail`, runs main.js in WASM,
  // registers the tool (our registrar captures activate's `invoke` closure + the handler ref).
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });

  // Cap the action ceiling at M < N (M=3, N=12). The row is born here; the burst debits against it.
  const cap = 3;
  await upsertBudget(db, installed.id, { maxActionsPerDay: cap, maxUsdPerDay: null }, FROZEN_AT_MS);

  const invoke: PluginInvokeHandler | undefined = captured.invoke;
  const handler = captured.handler;
  if (invoke === undefined || handler === undefined) {
    throw new Error("the tool's invoke closure / handler was not captured by the registrar");
  }
  // Invoke the resident tool with a HOST-authority chat scope (turn.trigger is host-gated). One tool call →
  // the guest fires the N-way concurrent burst → each requestTurn crosses the REAL membrane → the REAL bridge
  // `spendGated` → the REAL per-instance `spendTail`. `invoke` resolves to a JSON string (the guest tool's
  // return) — an explicit `Promise<string>` local so the await's thenable type is unambiguous.
  const chatScope: InvocationChat = { chatId: castId<InvocationChat["chatId"]>("chat_burst00000000000000000"), canWrite: true, automationDepth: 0 };
  const runInvoke: Promise<string> = invoke(handler, "{}", chatScope);
  const resultJson = await runInvoke;
  const succeeded = JSON.parse(resultJson) as number;

  // Exactly M succeeded; the rest were contained refusals (never a crash). And the persisted count is EXACTLY M
  // — zero overshoot (the serializer made op #k+1's check read the row AFTER op #k's accumulate persisted).
  expect(succeeded).toBe(cap);
  const budgetRow = await selectBudget(db, installed.id);
  expect(budgetRow?.actionsSpentToday).toBe(cap);

  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: false });
});
