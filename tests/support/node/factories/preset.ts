// Preset rows use the owner's real default config and mirror its version; view and sentinel policy stay in production.
import type { Db } from "@orb/db";
import { presets } from "@orb/db";
import type { IdSource, UserId } from "@orb/kit/ids";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import { makePromptConfig } from "../../iso/preset-config.ts";
import type { ServerTestHarness } from "../server.ts";
import { seedUser } from "./user.ts";

type CreatePreset = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>["preset"]["create"];

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

export interface SeededCreatedPreset {
  readonly view: Awaited<ReturnType<CreatePreset>>;
  readonly row: PresetRow;
}

/** Keep the routed creation's normalization and name de-collision, then capture only its returned identity. */
export async function seedCreatedPreset(db: Db, create: CreatePreset, params: Parameters<CreatePreset>[0]): Promise<SeededCreatedPreset> {
  const view = await create(params);
  const row = await db.select().from(presets).where(eq(presets.id, view.id)).get();
  if (row === undefined) {
    throw new Error("production preset creation left no canonical row");
  }
  return { view, row };
}
