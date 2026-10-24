// Preset rows a production verb left, read behind the rows door for persistence-tier and corpus captures.

import type { Db } from "@orb/db";
import { presets } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../../server.ts";
import type { CreatePreset, PresetCaller, PresetRow, SeededImportedPreset } from "../preset.ts";

/** A copy-on-write update may return a different identity; capture that row, never the requested source. */
export async function seedUpdatedPresetRows(
  root: ServerProducerRoot,
  userId: UserId,
  params: Parameters<PresetCaller["update"]>[0],
): Promise<SeededPresetRows> {
  const db = root.db;
  const update = (await root.internalCallerFor(userId)).preset.update;
  const view = await update(params);
  return { view, row: await capturePresetRow(db, view.id) };
}

/** Refused imports have no row; successful reuse retains the native winner's exact identity. */
export async function seedImportedPresetRows(
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

export interface SeededPresetRows {
  readonly view: Awaited<ReturnType<CreatePreset>>;
  readonly row: PresetRow;
}

/** Keep the routed creation's normalization and name de-collision, then capture only its returned identity. */
export async function seedPresetRows(root: ServerProducerRoot, userId: UserId, params: Parameters<CreatePreset>[0]): Promise<SeededPresetRows> {
  const db = root.db;
  const create = (await root.internalCallerFor(userId)).preset.create;
  const view = await create(params);
  return { view, row: await capturePresetRow(db, view.id) };
}
