// observer/react — the reactor against a real libSQL :memory: db. Pins the load-bearing invariants
// (proposed/buddy-observer-reaction-engine.md §"Reactor semantics"): ONE signal → one quip + mood shift +
// stat/bond growth; the cooldown throttle + the bypass; the dedup; the canned fallback; the OPTIMISTIC-CAS
// concurrent-write retry (the pinned invariant); and NEVER-THROWS (fire-and-forget).

import type { CompanionStats } from "@orb/contracts/buddy";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { Db } from "@orb/db";
import type { BuddyQuipId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { BuddySignal } from "../../../../../packages/server/src/domain/buddy/contract/signals.ts";
import type {
  BuddyBusEvent,
  BuddyObserverEnv,
} from "../../../../../packages/server/src/domain/buddy/index.ts";
import { react } from "../../../../../packages/server/src/domain/buddy/observer/react.ts";
import {
  casReact,
  insertBuddy,
  loadBuddy,
  loadRecentQuips,
  setBuddyFlag,
} from "../../../../../packages/server/src/domain/buddy/persistence/queries.ts";
import { roll } from "../../../../../packages/server/src/domain/buddy/substrate/roll.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedUser } from "../_support.ts";

const NOW = 1_750_000_000_000;

type ReactorDeps = Pick<BuddyObserverEnv, "db" | "now" | "newQuipId" | "summarize" | "emit">;

function makeReactor(db: Db): {
  readonly deps: ReactorDeps;
  readonly events: BuddyBusEvent[];
  readonly setSummarizeThrows: (v: boolean) => void;
  readonly setNow: (v: number) => void;
} {
  const events: BuddyBusEvent[] = [];
  let quipCounter = 0;
  let summarizeThrows = false;
  let nowMs = NOW;
  const summarize = (): Promise<SummarizeResult> =>
    summarizeThrows
      ? Promise.reject(new Error("engine down"))
      : Promise.resolve({
          items: [{ text: "beep boop", usage: { tokensIn: null, tokensOut: null, costUsd: null } }],
          model: "vllm-local",
        });
  return {
    deps: {
      db,
      now: (): number => nowMs,
      newQuipId: (): BuddyQuipId => {
        quipCounter += 1;
        return castId<BuddyQuipId>(`buddy_quip_${quipCounter}`);
      },
      summarize,
      emit: (event: BuddyBusEvent): void => {
        events.push(event);
      },
    },
    events,
    setSummarizeThrows: (v: boolean): void => {
      summarizeThrows = v;
    },
    setNow: (v: number): void => {
      nowMs = v;
    },
  };
}

async function seedBuddy(db: Db, userId: UserId): Promise<void> {
  const { bones } = roll(userId);
  await insertBuddy(db, {
    userId,
    name: "Pip",
    personality: "small and curious",
    rarity: bones.rarity,
    species: bones.species,
    eye: bones.eye,
    hat: bones.hat,
    shiny: bones.shiny,
    stats: bones.stats,
    createdAt: NOW,
  });
}

function signal(userId: UserId, overrides: Partial<BuddySignal> = {}): BuddySignal {
  return {
    kind: "chat:turn-completed",
    userId,
    dedupKey: "chat:c1:turn-completed:1",
    description: "a reply landed",
    ...overrides,
  };
}

describe("buddy observer reactor", () => {
  test("one signal → one quip + mood shift + bond growth", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_o" });
    await seedBuddy(db, owner);
    const { deps, events } = makeReactor(db);

    await react(deps, signal(owner));

    const quips = await loadRecentQuips(db, owner, 10);
    expect(quips).toHaveLength(1);
    expect(quips[0]?.text).toBe("beep boop");
    expect(quips[0]?.fromCanned).toBe(false);

    const row = await loadBuddy(db, owner);
    expect(row?.mood).toBe("content"); // chat:turn-completed → content
    expect(row?.bondXp).toBe(1);
    expect(row?.lastSignalKey).toBe("chat:c1:turn-completed:1");
    // A WARMTH nudge (chat:turn-completed → WARMTH) landed.
    expect(row?.stats.WARMTH).toBeGreaterThan(roll(owner).bones.stats.WARMTH);
    // The quip bus event fanned.
    expect(events.some((e) => e.type === "quip")).toBe(true);
  });

  test("dedup: the same dedupKey twice → exactly one reaction", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_o" });
    await seedBuddy(db, owner);
    const { deps } = makeReactor(db);

    await react(deps, signal(owner));
    await react(deps, signal(owner)); // identical dedupKey → skipped

    expect(await loadRecentQuips(db, owner, 10)).toHaveLength(1);
  });

  test("cooldown throttles a routine signal; a bypass signal ignores it", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_o" });
    await seedBuddy(db, owner);
    const { deps } = makeReactor(db);

    await react(deps, signal(owner, { dedupKey: "a" }));
    // A DIFFERENT routine signal moments later → throttled (within the cooldown).
    await react(deps, signal(owner, { kind: "chat:turn-aborted", dedupKey: "b" }));
    expect(await loadRecentQuips(db, owner, 10)).toHaveLength(1);
    // A BYPASS signal (workload:failed) ignores the cooldown → reacts.
    await react(deps, signal(owner, { kind: "workload:failed", dedupKey: "c" }));
    expect(await loadRecentQuips(db, owner, 10)).toHaveLength(2);
  });

  test("canned fallback when summarize throws (breaker open)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_o" });
    await seedBuddy(db, owner);
    const { deps, setSummarizeThrows } = makeReactor(db);
    setSummarizeThrows(true);

    await react(deps, signal(owner));

    const quips = await loadRecentQuips(db, owner, 10);
    expect(quips).toHaveLength(1);
    expect(quips[0]?.fromCanned).toBe(true);
    expect(quips[0]?.text.length).toBeGreaterThan(0);
  });

  test("never throws: a missing buddy is a silent no-op", async () => {
    const db = await freshDb();
    const ghost = castId<UserId>("user_ghost");
    const { deps } = makeReactor(db);
    // No buddy row for this user → resolves, no throw, no quip.
    await expect(react(deps, signal(ghost))).resolves.toBeUndefined();
    expect(await loadRecentQuips(db, ghost, 10)).toHaveLength(0);
  });

  test("reactions off → no reaction", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_o" });
    await seedBuddy(db, owner);
    await setBuddyFlag(db, owner, { reactionsEnabled: false }, NOW);
    const { deps } = makeReactor(db);

    await react(deps, signal(owner));
    expect(await loadRecentQuips(db, owner, 10)).toHaveLength(0);
  });

  // THE PINNED INVARIANT — the optimistic-CAS concurrent-write retry.
  test("CAS gate: a stale expectedUpdatedAt loses; the reload wins", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_o" });
    await seedBuddy(db, owner);
    const row = await loadBuddy(db, owner);
    const staleUpdatedAt = row?.updatedAt ?? NOW;
    const stats = row?.stats as CompanionStats;

    // First write at the loaded updatedAt → wins.
    const first = await casReact(db, {
      userId: owner,
      expectedUpdatedAt: staleUpdatedAt,
      mood: "excited",
      stats,
      bondDelta: 1,
      lastSignalKey: "s1",
      now: NOW + 10,
    });
    expect(first).toBe(true);
    // A racing write still holding the STALE updatedAt → 0 rows (must reload + retry).
    const stale = await casReact(db, {
      userId: owner,
      expectedUpdatedAt: staleUpdatedAt,
      mood: "queasy",
      stats,
      bondDelta: 1,
      lastSignalKey: "s2",
      now: NOW + 20,
    });
    expect(stale).toBe(false);
    // Reload → the fresh updatedAt → the retry lands.
    const reloaded = await loadBuddy(db, owner);
    const retry = await casReact(db, {
      userId: owner,
      expectedUpdatedAt: reloaded?.updatedAt ?? NOW,
      mood: "queasy",
      stats,
      bondDelta: 1,
      lastSignalKey: "s2",
      now: NOW + 30,
    });
    expect(retry).toBe(true);
    // Both bond grants survived (sql increment, never read-modify-write).
    expect((await loadBuddy(db, owner))?.bondXp).toBe(2);
  });

  test("concurrent bypass reactions both land (the CAS retry under a real race)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_o" });
    await seedBuddy(db, owner);
    const { deps } = makeReactor(db);

    // Two DISTINCT bypass signals racing the same row (distinct dedupKeys → neither dedups the other; both
    // bypass the cooldown). Whichever loses the CAS reloads + retries — both quips must land, bond += 2.
    await Promise.all([
      react(deps, signal(owner, { kind: "workload:failed", dedupKey: "f1" })),
      react(deps, signal(owner, { kind: "trace:error-spike", dedupKey: "f2" })),
    ]);

    expect(await loadRecentQuips(db, owner, 10)).toHaveLength(2);
    expect((await loadBuddy(db, owner))?.bondXp).toBe(2);
  });
});
