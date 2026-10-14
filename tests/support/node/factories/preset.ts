// Preset rows use the owner's real default config and mirror its version; view and sentinel policy stay in production.
import type { Db } from "@orb/db";
import { presets } from "@orb/db";
import type { IdSource, UserId } from "@orb/kit/ids";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import { makePromptConfig } from "../../iso/preset-config.ts";
import { seedUser } from "./user.ts";

export type PresetRow = typeof presets.$inferSelect;

const ids = createIdSource(createSeededIds().next);

/** Builds an owned row; its owner relation is persisted only by {@link seedPreset}. */
export function makePreset(overrides: Partial<PresetRow> = {}, source: IdSource = ids): PresetRow {
  const config = overrides.config ?? makePromptConfig();
  return {
    id: source.typeId(ID_PREFIX.preset),
    ownerId: source.unprefixed<UserId>(),
    name: "Test Preset",
    kind: "generation",
    config,
    schemaVersion: config.schemaVersion,
    forkedFrom: null,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
    ...overrides,
  };
}

/** Reuses an explicit owner (including null); omission seeds the existing canonical user FK root. */
export async function seedPreset(db: Db, overrides: Partial<PresetRow> = {}, source?: IdSource): Promise<PresetRow> {
  const ownerId = overrides.ownerId === undefined ? (await seedUser(db, {}, source)).id : overrides.ownerId;
  const row = makePreset({ ...overrides, ownerId }, source);
  await db.insert(presets).values(row);
  return row;
}
