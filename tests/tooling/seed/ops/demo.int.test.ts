// The demo-seeder smoke test (relocated from tests/tooling/seed-demo.int.test.ts at the #393 P5 move —
// Core-Tooling-Law.md §4.7 mirror). Runs the REAL `runFullSeed` core (the shared body
// of `pnpm seed:demo`) against an in-memory freshDb with the deterministic offline vLLM client, then
// asserts the marquee shapes the owner verifies against every regen: both chats exist, both humans are
// seated, every seeded character's avatar resolves through the FK chain, and the databank document ingested
// into at least one embedded chunk. This pins the seeder to the LIVE verb surface — a domain contract drift
// that breaks the demo build fails here, in CI, at change time (not on the next manual regen).

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assets,
  characterRegexScripts,
  characters,
  chatParticipants,
  chatRegexScripts,
  chats,
  documentChunks,
  globalRegexScripts,
  presetRegexScripts,
  regexScripts,
  rosterPresetMembers,
  rosterPresets,
  users,
} from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, isNotNull } from "drizzle-orm";
import { resolveSeedVllmDisabled, runFullSeed } from "../../../../tooling/src/seed/ops/demo.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const FROZEN_NOW = 1_700_000_000_000;
const SEED_SECRET = "seed-demo-test-session-secret-0000000000";

test("seed:demo fails before mutation when a promised bundled asset is unavailable", async () => {
  const db = await freshDb();
  const deps = {
    db,
    now: () => FROZEN_NOW,
    sessionSecret: SEED_SECRET,
    casDir: mkdtempSync(join(tmpdir(), "seed-demo-cas-")),
    variantDir: mkdtempSync(join(tmpdir(), "seed-demo-var-")),
    force: true,
    log: () => undefined,
    validateRequiredAssets: () => Promise.reject(new Error("required bundled avatars missing: planted")),
  };
  await expect(runFullSeed(deps)).rejects.toThrow("required bundled avatars missing: planted");
  expect(await db.select().from(users)).toEqual([]);
});

test("seed:demo populates the marquee demo shapes against a fresh db", async () => {
  const db = await freshDb();
  const casDir = mkdtempSync(join(tmpdir(), "seed-demo-cas-"));
  const variantDir = mkdtempSync(join(tmpdir(), "seed-demo-var-"));

  const result = await runFullSeed({
    db,
    now: () => FROZEN_NOW,
    sessionSecret: SEED_SECRET,
    casDir,
    variantDir,
    force: true,
    log: () => undefined,
    // Pin the fake vLLM client's arm regardless of the test box's GPU — the assertions below are about
    // the write path, not about `detectGpu()` (that derivation gets its own case below).
    vllmDisabled: false,
  });
  expect(result.augmented).toBe(true);

  // Two humans exist (owner + the seeded companion).
  const humans = await db.select({ id: users.id }).from(users).where(eq(users.kind, "human"));
  expect(humans.length).toBeGreaterThanOrEqual(2);
  const companionId = await result.built.sessions.resolveHandle(castId<Handle>("companion"));
  expect(companionId).not.toBeNull();

  // A solo chat AND a group chat.
  const allChats = await db.select({ id: chats.id }).from(chats);
  expect(allChats.length).toBeGreaterThanOrEqual(2);

  // Both humans are seated somewhere (the group chat carries owner + companion as human participants).
  const humanSeats = await db.selectDistinct({ userId: chatParticipants.userId }).from(chatParticipants).where(eq(chatParticipants.kind, "human"));
  const seatedHumanIds = new Set(humanSeats.map((row) => row.userId));
  expect(seatedHumanIds.size).toBeGreaterThanOrEqual(2);
  expect(seatedHumanIds.has(result.ownerId)).toBe(true);
  expect(companionId !== null && seatedHumanIds.has(companionId)).toBe(true);

  // Character avatars resolve: every seeded character with an avatarAssetId points at a real assets row.
  const avatarChars = await db.select({ avatarAssetId: characters.avatarAssetId }).from(characters).where(isNotNull(characters.avatarAssetId));
  expect(avatarChars.length).toBeGreaterThanOrEqual(4);
  for (const row of avatarChars) {
    if (row.avatarAssetId === null) {
      continue;
    }
    const asset = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.id, row.avatarAssetId), eq(assets.kind, "avatar")))
      .limit(1);
    expect(asset.length, `avatar asset ${row.avatarAssetId} resolves`).toBe(1);
  }

  // The databank document ingested into at least one embedded chunk (the vector write path ran).
  const chunkCount = await db.$count(documentChunks);
  expect(chunkCount).toBeGreaterThan(0);

  // Regex scripts: 4 rows total, one attached at EACH of the four tiers (#1725 boards 04/05, #1742's
  // room Regex section) — a fresh demo db must show every tier populated, not just the global rack.
  expect(await db.$count(regexScripts)).toBeGreaterThanOrEqual(4);
  expect(await db.$count(globalRegexScripts)).toBeGreaterThanOrEqual(1);
  expect(await db.$count(characterRegexScripts)).toBeGreaterThanOrEqual(1);
  expect(await db.$count(presetRegexScripts)).toBeGreaterThanOrEqual(1);
  expect(await db.$count(chatRegexScripts)).toBeGreaterThanOrEqual(1);

  // The disabled script stays disabled through the create + attach — a seeder that dropped `enabled:
  // false` on the way to the row would silently turn a parked script live.
  const disabledRows = await db.select({ enabled: regexScripts.enabled }).from(regexScripts).where(eq(regexScripts.enabled, false));
  expect(disabledRows.length).toBeGreaterThanOrEqual(1);

  // Saved rosters: at least 2 rows, with at least one member each (through the roster-preset library
  // door, not a raw insert).
  expect(await db.$count(rosterPresets)).toBeGreaterThanOrEqual(2);
  expect(await db.$count(rosterPresetMembers)).toBeGreaterThanOrEqual(3);
});

test("resolveSeedVllmDisabled: matches the same force-off-OR-no-GPU derivation boot uses", () => {
  expect(resolveSeedVllmDisabled(false, () => true)).toBe(false);
  expect(resolveSeedVllmDisabled(false, () => false)).toBe(true);
  // A force-off env override wins even when a GPU is present.
  expect(resolveSeedVllmDisabled(true, () => true)).toBe(true);
});
