// The SPEND budget layer's UTC-day rollover (03 §3) — the branch that was untested: a stored `spend_day` from a
// PRIOR UTC day must RESET the accumulator to 0 (both the read-side `checkSpend` base and the write-side
// `accumulateSpend` base), so yesterday's dollars never count against today's ceiling. Real libSQL + the
// injected clock (two fixed epochs one UTC day apart).

import { describe } from "vitest";
import { accumulateSpend, checkSpend } from "../../../../../packages/server/src/domain/automation/engine/spend-gate.ts";
import { selectBudget, upsertBudget } from "../../../../../packages/server/src/domain/automation/persistence/budgets.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedHostChat, seedUser } from "../_support.ts";

// 2023-11-14T22:13:20Z and the SAME wall-clock the next UTC day — one `spend_day` rollover apart.
const DAY_1_MS = 1_700_000_000_000; // 2023-11-14
const DAY_2_MS = DAY_1_MS + 86_400_000; // 2023-11-15

describe("spend-gate UTC-day rollover (03 §3)", () => {
  test("accumulateSpend resets the accumulator to 0 when the stored spend_day predates today", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    await upsertBudget(db, chatId, { maxUsdPerDay: 1.0 }, DAY_1_MS);

    // Spend 0.40 on day 1 → usd_spent_today = 0.40, spend_day = 2023-11-14.
    await accumulateSpend(db, chatId, DAY_1_MS, 0.4);
    expect((await selectBudget(db, chatId))?.usdSpentToday).toBeCloseTo(0.4);

    // Spend 0.10 on day 2 → the stored day is stale, so the base rolls to 0 (NOT 0.40 + 0.10).
    await accumulateSpend(db, chatId, DAY_2_MS, 0.1);
    const rolled = await selectBudget(db, chatId);
    expect(rolled?.usdSpentToday).toBeCloseTo(0.1);
    expect(rolled?.spendDay).toBe("2023-11-15");
  });

  test("checkSpend ignores a prior day's usd_spent_today (yesterday's spend does not gate today)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    // Day 1 leaves the row AT the $ ceiling (1.00 of 1.00).
    await upsertBudget(db, chatId, { maxUsdPerDay: 1.0, maxSpendActionsPerDay: 100 }, DAY_1_MS);
    await accumulateSpend(db, chatId, DAY_1_MS, 1.0);

    // Same instant on day 1 → the $ base is 1.00 → a new reservation of 0.01 is refused (already at ceiling).
    expect(await checkSpend(db, { chatId, nowMs: DAY_1_MS, reservedActions: 0, reservedUsd: 0.01 })).toEqual({ ok: false, detail: "usd_daily" });

    // The NEXT UTC day the stale accumulator rolls to 0 → the same reservation now passes.
    expect(await checkSpend(db, { chatId, nowMs: DAY_2_MS, reservedActions: 0, reservedUsd: 0.01 })).toEqual({ ok: true });
  });
});
