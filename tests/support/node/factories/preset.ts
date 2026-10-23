// Preset rows use the owner's real default config and mirror its version; view and sentinel policy stay in production.
import type { Db } from "@orb/db";
import { presets } from "@orb/db";
import type { IdSource, UserId } from "@orb/kit/ids";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import { makePromptConfig } from "../../iso/preset-config.ts";
import type { ServerProducerRoot, ServerTestHarness } from "../server.ts";
import { seedUser } from "./user.ts";

type PresetCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>["preset"];
type CreatePreset = PresetCaller["create"];

export type PresetRow = typeof presets.$inferSelect;

const ids = createIdSource(createSeededIds().next);

/** Builds an owned row; its owner relation is persisted only by {@link seedPreset}. */
function makePreset(overrides: Partial<PresetRow> = {}, source: IdSource = ids): PresetRow {
  const config = overrides.config ?? makePromptConfig();
  return {
    id: source.typeId(ID_PREFIX.preset),
    ownerId: source.userId(),
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
export async function seedCreatedPreset(root: ServerProducerRoot, userId: UserId, params: Parameters<CreatePreset>[0]): Promise<SeededCreatedPreset> {
  const db = root.db;
  const create = (await root.internalCallerFor(userId)).preset.create;
  const view = await create(params);
  return { view, row: await capturePresetRow(db, view.id) };
}

/** A copy-on-write update may return a different identity; capture that row, never the requested source. */
export async function seedUpdatedPreset(root: ServerProducerRoot, userId: UserId, params: Parameters<PresetCaller["update"]>[0]): Promise<SeededCreatedPreset> {
  const db = root.db;
  const update = (await root.internalCallerFor(userId)).preset.update;
  const view = await update(params);
  return { view, row: await capturePresetRow(db, view.id) };
}

export interface SeededImportedPreset {
  readonly outcome: Awaited<ReturnType<PresetCaller["importFile"]>>;
  readonly row: PresetRow | undefined;
}

/** Refused imports have no row; successful reuse retains the native winner's exact identity. */
export async function seedImportedPreset(
  root: ServerProducerRoot,
  userId: UserId,
  params: Parameters<PresetCaller["importFile"]>[0],
): Promise<SeededImportedPreset> {
  const db = root.db;
  const importFile = (await root.internalCallerFor(userId)).preset.importFile;
  const outcome = await importFile(params);
  const row = outcome.presetId === undefined ? undefined : await capturePresetRow(db, outcome.presetId);
  if (outcome.ok && row === undefined) {
    throw new Error("production preset import returned no canonical row identity");
  }
  return { outcome, row };
}

async function capturePresetRow(db: Db, id: PresetRow["id"]): Promise<PresetRow> {
  const row = await db.select().from(presets).where(eq(presets.id, id)).get();
  if (row === undefined) {
    throw new Error("production preset operation left no canonical row");
  }
  return row;
}
