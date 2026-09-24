// seed: ensureSystemDefaultPreset + ensurePackagedPresets — the boot seeders. Pins: first boot inserts the
// single null-owner default row; the reseed is schemaVersion-GATED (a bump overwrites; an equal/newer stored
// version is left alone); the seeders are idempotent across boots; the packaged template is seeded ownerless
// at its reserved id.

import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { ensurePackagedPresets, ensureSystemDefaultPreset, SYSTEM_DEFAULT_PRESET_ID } from "@orb/server/domain/preset";
import { describe } from "vitest";
import { PACKAGED_PRESETS } from "../../../../packages/server/src/domain/preset/contract/packaged.ts";
import { readablePreset, selectPackagedPreset, selectSystemDefault } from "../../../../packages/server/src/domain/preset/persistence/queries.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { FROZEN_AT, seedPreset, seedUser } from "./_support.ts";

const OLDER_VERSION = DEFAULT_PROMPT_CONFIG.schemaVersion - 1;
const RPG_GM = PACKAGED_PRESETS["rpg-gm"];

describe("ensureSystemDefaultPreset", () => {
  test("first boot inserts the single null-owner system default row", async () => {
    const db = await freshDb();
    await ensureSystemDefaultPreset(db, () => FROZEN_AT);
    const row = await selectSystemDefault(db);
    expect(row?.id).toBe(SYSTEM_DEFAULT_PRESET_ID);
    expect(row?.ownerId).toBeNull();
    expect(row?.schemaVersion).toBe(DEFAULT_PROMPT_CONFIG.schemaVersion);
  });

  test("is idempotent — a second boot does not duplicate or overwrite the equal-version row", async () => {
    const db = await freshDb();
    await ensureSystemDefaultPreset(db, () => FROZEN_AT);
    await ensureSystemDefaultPreset(db, () => FROZEN_AT + 999);
    const row = await selectSystemDefault(db);
    // updatedAt unchanged → the second call took the no-op branch (version equal, not below).
    expect(row?.updatedAt).toBe(FROZEN_AT);
  });

  test("a stored version BELOW the default forces a reseed (overwrites config + version)", async () => {
    const db = await freshDb();
    await seedPreset(db, {
      id: SYSTEM_DEFAULT_PRESET_ID,
      ownerId: null,
      name: "Stale",
      schemaVersion: OLDER_VERSION,
    });
    await ensureSystemDefaultPreset(db, () => FROZEN_AT + 7);
    const row = await selectSystemDefault(db);
    expect(row?.schemaVersion).toBe(DEFAULT_PROMPT_CONFIG.schemaVersion);
    expect(row?.updatedAt).toBe(FROZEN_AT + 7);
  });
});

describe("ensurePackagedPresets", () => {
  test("first boot inserts the packaged RPG GM template ownerless at its reserved id", async () => {
    const db = await freshDb();
    await ensurePackagedPresets(db, () => FROZEN_AT);
    const row = await selectPackagedPreset(db, RPG_GM.id);
    expect(row?.id).toBe(RPG_GM.id);
    expect(row?.ownerId).toBeNull();
    expect(row?.name).toBe("RPG Game Master");
    expect(row?.schemaVersion).toBe(RPG_GM.config.schemaVersion);
  });

  test("is idempotent — a second boot does not duplicate or overwrite the equal-version row", async () => {
    const db = await freshDb();
    await ensurePackagedPresets(db, () => FROZEN_AT);
    await ensurePackagedPresets(db, () => FROZEN_AT + 999);
    const row = await selectPackagedPreset(db, RPG_GM.id);
    // updatedAt unchanged → the second call took the no-op branch (version equal, not below).
    expect(row?.updatedAt).toBe(FROZEN_AT);
  });

  test("a stored version BELOW the registry config forces a reseed", async () => {
    const db = await freshDb();
    await seedPreset(db, {
      id: RPG_GM.id,
      ownerId: null,
      name: "Stale GM",
      schemaVersion: OLDER_VERSION,
    });
    await ensurePackagedPresets(db, () => FROZEN_AT + 7);
    const row = await selectPackagedPreset(db, RPG_GM.id);
    expect(row?.name).toBe("RPG Game Master");
    expect(row?.schemaVersion).toBe(RPG_GM.config.schemaVersion);
    expect(row?.updatedAt).toBe(FROZEN_AT + 7);
  });
});

// THE BLAST-RADIUS PIN of every future schemaVersion bump (minted with v6→v7, issue #80). A bump is how the
// shipped arrangement reaches an existing install — and the reason that is safe is that BOTH seeders key on
// `ownerId IS NULL` rows at reserved ids. If a reseed ever widened to owned rows, it would silently overwrite
// every user's hand-tuned preset on the next boot, with the version bump as the only trace.
describe("the seeders never touch a USER-OWNED preset", () => {
  test("an owned row stored at an OLDER version survives both boot seeders byte-identical", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "keeper");
    const mine = { ...DEFAULT_PROMPT_CONFIG, schemaVersion: OLDER_VERSION, sections: [] };
    const id = await seedPreset(db, { name: "Mine", ownerId: owner, config: mine, schemaVersion: OLDER_VERSION });

    await ensureSystemDefaultPreset(db, () => FROZEN_AT + 7);
    await ensurePackagedPresets(db, () => FROZEN_AT + 7);

    const row = await readablePreset(db, owner, id);
    expect(row?.schemaVersion).toBe(OLDER_VERSION);
    expect(row?.updatedAt).toBe(FROZEN_AT);
    // The stored config is untouched — including the empty section list a reseed would have replaced.
    expect(row?.config).toEqual(mine);
  });
});

// The v7→v8 bump's purpose (D251): an existing install's built-in preset reaches the below-history order on
// the next boot, while a user's fork of the old built-in keeps the order its author saved.
describe("the v8 reseed moves memory, databank and the guided instruction below Chat History", () => {
  const perTurnIds: readonly string[] = ["memory", "databank", "guided-instruction"];
  /** The v7 built-in arrangement: the three per-turn sections sat immediately above the pivot. */
  function v7Arrangement(): PromptConfig {
    const perTurn = DEFAULT_PROMPT_CONFIG.sections.filter((section) => perTurnIds.includes(section.id));
    const rest = DEFAULT_PROMPT_CONFIG.sections.filter((section) => !perTurnIds.includes(section.id));
    const pivot = rest.findIndex((section) => section.id === "chat-history");
    return { ...DEFAULT_PROMPT_CONFIG, schemaVersion: OLDER_VERSION, sections: [...rest.slice(0, pivot), ...perTurn, ...rest.slice(pivot)] };
  }
  const idsOf = (config: PromptConfig | undefined): string[] => (config?.sections ?? []).map((section) => section.id);

  test("a stored v7 system default is reseeded to the shipped order; an owned fork of it is not", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "forker");
    const old = v7Arrangement();
    await seedPreset(db, { id: SYSTEM_DEFAULT_PRESET_ID, ownerId: null, name: "Default", config: old });
    const fork = await seedPreset(db, { name: "Fork", ownerId: owner, config: old, forkedFrom: SYSTEM_DEFAULT_PRESET_ID });

    await ensureSystemDefaultPreset(db, () => FROZEN_AT + 7);

    const reseeded = await selectSystemDefault(db);
    expect(reseeded?.schemaVersion).toBe(DEFAULT_PROMPT_CONFIG.schemaVersion);
    const shipped = idsOf(reseeded?.config);
    expect(shipped).toEqual(idsOf(DEFAULT_PROMPT_CONFIG));
    expect(perTurnIds.every((id) => shipped.indexOf(id) > shipped.indexOf("chat-history"))).toBe(true);

    const kept = await readablePreset(db, owner, fork);
    expect(kept?.schemaVersion).toBe(OLDER_VERSION);
    expect(kept?.updatedAt).toBe(FROZEN_AT);
    expect(kept?.config).toEqual(old);
  });
});
