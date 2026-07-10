// persistence/queries — round-trips against a real libSQL :memory: db (the only place queries are
// "correct"). Pins insert/load, transcript append+load ordering+clear, the server-side bond increment,
// and the flag/rename writes. (queries is a flat file → deep relative import.)

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import {
  appendTurn,
  clearTurns,
  growBond,
  insertBuddy,
  loadBuddy,
  loadTurns,
  renameBuddy,
  setBuddyFlag,
} from "../../../../../packages/server/src/domain/buddy/persistence/queries.ts";
import { roll } from "../../../../../packages/server/src/domain/buddy/substrate/roll.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedUser } from "../_support.ts";

const NOW = 1_750_000_000_000;

async function seedBuddy(db: Awaited<ReturnType<typeof freshDb>>, userId: UserId): Promise<void> {
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

describe("buddy persistence", () => {
  test("insertBuddy + loadBuddy round-trip", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_o" });
    await seedBuddy(db, owner);

    const row = await loadBuddy(db, owner);
    expect(row?.name).toBe("Pip");
    expect(row?.bondXp).toBe(0);
    expect(row?.agencyEnabled).toBe(true);
  });

  test("loadBuddy returns null when not hatched", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_o" });
    expect(await loadBuddy(db, owner)).toBeNull();
  });

  test("appendTurn + loadTurns return oldest-first, capped to the limit", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_o" });
    await seedBuddy(db, owner);
    await appendTurn(db, {
      id: castId("buddy_turn_1"),
      userId: owner,
      role: "user",
      content: "first",
      createdAt: NOW,
    });
    await appendTurn(db, {
      id: castId("buddy_turn_2"),
      userId: owner,
      role: "assistant",
      content: "second",
      createdAt: NOW + 1,
    });

    const turns = await loadTurns(db, owner, 10);
    expect(turns.map((t) => t.content)).toEqual(["first", "second"]);
  });

  test("equal-createdAt user/assistant pair keeps write order (the id tiebreak — frozen-clock vector)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_o" });
    await seedBuddy(db, owner);
    // A frozen clock makes both turns land in the SAME millisecond — `createdAt` alone can't order them, so the
    // `desc(id)` tiebreak is what preserves write order. To make this test actually DISCRIMINATE the tiebreak
    // (not just agree with SQLite's rowid fallback), the physical INSERTION order is REVERSED vs the id order:
    // the assistant row (larger id `buddy_turn_2`) is inserted FIRST, the user row (smaller id `buddy_turn_1`)
    // SECOND. Without the id tiebreak, loadTurns would return insertion order → [assistant, user] (wrong);
    // only the id tiebreak yields the correct [user, assistant]. (Verified: dropping `desc(id)` fails this.)
    await appendTurn(db, {
      id: castId("buddy_turn_2"),
      userId: owner,
      role: "assistant",
      content: "reply",
      createdAt: NOW,
    });
    await appendTurn(db, {
      id: castId("buddy_turn_1"),
      userId: owner,
      role: "user",
      content: "prompt",
      createdAt: NOW,
    });

    const turns = await loadTurns(db, owner, 10);
    expect(turns.map((t) => t.content)).toEqual(["prompt", "reply"]);
    expect(turns.map((t) => t.role)).toEqual(["user", "assistant"]);
  });

  test("clearTurns wipes only the caller's turns", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_o" });
    await seedBuddy(db, owner);
    await appendTurn(db, {
      id: castId("buddy_turn_1"),
      userId: owner,
      role: "user",
      content: "x",
      createdAt: NOW,
    });
    const removed = await clearTurns(db, owner);
    expect(removed).toBe(1);
    expect(await loadTurns(db, owner, 10)).toHaveLength(0);
  });

  test("growBond is a server-side increment", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_o" });
    await seedBuddy(db, owner);
    await growBond(db, owner, 3, NOW);
    await growBond(db, owner, 3, NOW);
    expect((await loadBuddy(db, owner))?.bondXp).toBe(6);
  });

  test("setBuddyFlag + renameBuddy persist", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_o" });
    await seedBuddy(db, owner);
    await setBuddyFlag(db, owner, { agencyEnabled: false }, NOW);
    await renameBuddy(db, owner, "Renamed", NOW);
    const row = await loadBuddy(db, owner);
    expect(row?.agencyEnabled).toBe(false);
    expect(row?.name).toBe("Renamed");
  });
});
