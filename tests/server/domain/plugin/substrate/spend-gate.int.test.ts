// substrate: spend-gate — the per-plugin spend layer (PLUGIN-SPEND). Both ceilings gate against the ROW (plugins
// have no fire log — the action COUNT lives on `actions_spent_today`); accumulate bumps BOTH accumulators (+1
// action always — the $0-local-turn belt) and rolls them on the UTC-day boundary. A budget-exhausted verdict
// carries the breached ceiling. The row is keyed pluginId; a plugin row must exist (the FK) before a budget row.

import type { Db } from "@orb/db";
import type { PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PluginSpendGate } from "../../../../../packages/server/src/domain/plugin/contract/ops.ts";
import { selectBudget, upsertBudget } from "../../../../../packages/server/src/domain/plugin/persistence/budgets.ts";
import { buildPluginBridge, PluginBudgetExhaustedError } from "../../../../../packages/server/src/domain/plugin/substrate/bridge.ts";
import { accumulateSpend, checkSpend } from "../../../../../packages/server/src/domain/plugin/substrate/spend-gate.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeBundle, makeInertOps, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

/** Install a real plugin row so the `plugin_budgets` FK resolves, returning its id. */
async function seedPlugin(db: Awaited<ReturnType<typeof freshDb>>): Promise<PluginId> {
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "spend" }), grant: [] });
  return installed.id;
}

// A fixed UTC day + the next day, in ms (the rollover boundary).
const DAY_1_MS = Date.UTC(2026, 6, 20, 12, 0, 0); // 2026-07-20
const DAY_2_MS = Date.UTC(2026, 6, 21, 8, 0, 0); // 2026-07-21

test("an absent row is the defaulted budget over a zero accumulator ⇒ ok", async () => {
  const db = await freshDb();
  const pluginId = await seedPlugin(db);
  expect(await checkSpend(db, { pluginId, nowMs: DAY_1_MS })).toEqual({ ok: true });
});

test("accumulate bumps BOTH accumulators (+1 action, +usd) and stamps the UTC day", async () => {
  const db = await freshDb();
  const pluginId = await seedPlugin(db);

  await accumulateSpend(db, pluginId, DAY_1_MS, 0.25);
  await accumulateSpend(db, pluginId, DAY_1_MS, 0.25);

  const row = await selectBudget(db, pluginId);
  expect(row?.actionsSpentToday).toBe(2);
  expect(row?.usdSpentToday).toBeCloseTo(0.5);
  expect(row?.spendDay).toBe("2026-07-20");
});

test("the ACTION-COUNT ceiling refuses once the day's count is hit (the local-hardware belt)", async () => {
  const db = await freshDb();
  const pluginId = await seedPlugin(db);
  await upsertBudget(db, pluginId, { maxActionsPerDay: 2, maxUsdPerDay: null }, DAY_1_MS);

  // Two $0 accumulations (a local turn meters no $) — the count belt is the ONLY belt that bounds them.
  await accumulateSpend(db, pluginId, DAY_1_MS, 0);
  expect(await checkSpend(db, { pluginId, nowMs: DAY_1_MS })).toEqual({ ok: true });
  await accumulateSpend(db, pluginId, DAY_1_MS, 0);
  expect(await checkSpend(db, { pluginId, nowMs: DAY_1_MS })).toEqual({ ok: false, detail: "actions_daily" });
});

test("the USD ceiling refuses once the day's $ is hit (the hosted belt), null = uncapped", async () => {
  const db = await freshDb();
  const pluginId = await seedPlugin(db);
  await upsertBudget(db, pluginId, { maxActionsPerDay: null, maxUsdPerDay: 1 }, DAY_1_MS);

  await accumulateSpend(db, pluginId, DAY_1_MS, 1);
  expect(await checkSpend(db, { pluginId, nowMs: DAY_1_MS })).toEqual({ ok: false, detail: "usd_daily" });

  // Clearing the dollar ceiling (null) lifts the USD belt — the action count is now the only belt (also null here).
  await upsertBudget(db, pluginId, { maxUsdPerDay: null }, DAY_1_MS);
  expect(await checkSpend(db, { pluginId, nowMs: DAY_1_MS })).toEqual({ ok: true });
});

test("the accumulators RESET on the UTC-day rollover (a stale day reads as 0 for today)", async () => {
  const db = await freshDb();
  const pluginId = await seedPlugin(db);
  await upsertBudget(db, pluginId, { maxActionsPerDay: 1, maxUsdPerDay: 1 }, DAY_1_MS);

  // Exhaust day 1.
  await accumulateSpend(db, pluginId, DAY_1_MS, 1);
  expect(await checkSpend(db, { pluginId, nowMs: DAY_1_MS })).toEqual({ ok: false, detail: "actions_daily" });

  // Day 2 — the check sees the stale day and reads the accumulators as 0 ⇒ ok again.
  expect(await checkSpend(db, { pluginId, nowMs: DAY_2_MS })).toEqual({ ok: true });

  // The next accumulate ROLLS the row (both accumulators reset, then this op's +1/+$ apply).
  await accumulateSpend(db, pluginId, DAY_2_MS, 0.1);
  const row = await selectBudget(db, pluginId);
  expect(row?.spendDay).toBe("2026-07-21");
  expect(row?.actionsSpentToday).toBe(1);
  expect(row?.usdSpentToday).toBeCloseTo(0.1);
});

// ── FIX-1 intra-invocation TOCTOU: N concurrent spendy calls from ONE handler must not overshoot the ceiling ──
// A single guest handler can fire up to HOST_CALLS_IN_FLIGHT_MAX (32) CONCURRENT host-fn calls, so the WHOLE
// check→op→accumulate section must serialize per instance (the bridge's `spendGated` runs it under
// `spend.runExclusive`). These tests drive N CONCURRENT `bridge.chat.requestTurn` (one guest firing a
// Promise.all burst) against a real db + the real gate, with the action ceiling at M<N.

const INSTALLER = castId<UserId>("user_installer00000000000000");

/** Inert ops whose `requestTurn` YIELDS (a real microtask gap) so concurrent sections genuinely interleave — a
 *  sync fake would hide the race. Costs 0 (a $0 local turn: the action-count belt is the only belt). */
function yieldingOps(): ReturnType<typeof makeInertOps> {
  const base = makeInertOps();
  return {
    ...base,
    chat: {
      ...base.chat,
      requestTurn: async (): Promise<{ costUsd: number | null }> => {
        await Promise.resolve();
        await Promise.resolve();
        return { costUsd: null };
      },
    },
  };
}

/** The REAL per-instance spend gate (activate.ts's shape) — real checkSpend/accumulateSpend + the tail-promise
 *  serializer. `serialize:false` DROPS the serializer (runs the section directly) to REPRODUCE the overshoot. */
function realGate(db: Db, pluginId: PluginId, nowMs: number, serialize: boolean): PluginSpendGate {
  let tail: Promise<unknown> = Promise.resolve();
  const serializing = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
  const direct = <T>(fn: () => Promise<T>): Promise<T> => fn();
  return {
    check: () => checkSpend(db, { pluginId, nowMs }),
    accumulate: (costUsd) => accumulateSpend(db, pluginId, nowMs, costUsd),
    runExclusive: serialize ? serializing : direct,
  };
}

/** Fire N concurrent requestTurn through the bridge; return how many SUCCEEDED (a budget refusal rejects with
 *  PluginBudgetExhaustedError — counted as a refusal, never a crash). */
async function burst(gate: PluginSpendGate, n: number): Promise<{ readonly ok: number; readonly refused: number }> {
  // pluginId `null` — this burst exercises only requestTurn (spend); the 4th arg feeds the plugin-scoped
  // storage/notify/quickReply closures, which this test never calls (the spend gate carries its own pluginId).
  const bridge = buildPluginBridge(yieldingOps(), INSTALLER, gate, null);
  const chatId = castId<Parameters<typeof bridge.chat.requestTurn>[0]>("chat_burst00000000000000000");
  const results = await Promise.allSettled(Array.from({ length: n }, () => bridge.chat.requestTurn(chatId, 0, {})));
  let ok = 0;
  let refused = 0;
  for (const r of results) {
    if (r.status === "fulfilled") {
      ok += 1;
    } else if (r.reason instanceof PluginBudgetExhaustedError) {
      refused += 1;
    } else {
      throw r.reason;
    }
  }
  return { ok, refused };
}

test("BITE-PROOF: WITHOUT the per-instance serializer, concurrent checks OVERSHOOT the action ceiling", async () => {
  const db = await freshDb();
  const pluginId = await seedPlugin(db);
  const cap = 3;
  const fired = 12;
  await upsertBudget(db, pluginId, { maxActionsPerDay: cap, maxUsdPerDay: null }, DAY_1_MS);

  // No serializer: all `fired` checks read actionsBase=0 before any accumulate persists → they ALL pass, so far
  // more turns actually RUN than the ceiling permits (the security harm — the $0-local-turn belt is defeated).
  const result = await burst(realGate(db, pluginId, DAY_1_MS, false), fired);
  const row = await selectBudget(db, pluginId);

  // The overshoot: every burst call succeeded (all `fired` turns ran) despite a cap of `cap` — a >4x breach. The
  // concurrent accumulates ALSO clobber each other (each reads base 0, writes 1), so the persisted count even
  // UNDER-reports the real spend (1, not 12) — a second face of the same TOCTOU. The load-bearing assertion is
  // the number of turns that actually RAN.
  expect(result.ok).toBe(fired);
  expect(result.ok).toBeGreaterThan(cap);
  expect(row?.actionsSpentToday).toBeLessThan(result.ok);
});

test("FIXED: WITH the per-instance serializer, exactly M concurrent calls succeed, the rest refuse, zero overshoot", async () => {
  const db = await freshDb();
  const pluginId = await seedPlugin(db);
  const cap = 3;
  const fired = 12;
  await upsertBudget(db, pluginId, { maxActionsPerDay: cap, maxUsdPerDay: null }, DAY_1_MS);

  const result = await burst(realGate(db, pluginId, DAY_1_MS, true), fired);
  const row = await selectBudget(db, pluginId);

  // Exactly `cap` succeed (op #k+1's check reads the row AFTER op #k's accumulate persisted); the rest refuse.
  expect(result.ok).toBe(cap);
  expect(result.refused).toBe(fired - cap);
  expect(row?.actionsSpentToday).toBe(cap);
});
