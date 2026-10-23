// Preset seeds run the routed owner verbs: the router's write schema normalizes config before the domain write.
import type { Db } from "@orb/db";
import { presets } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { ServerProducerRoot, ServerTestHarness } from "../server.ts";

type PresetCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>["preset"];
type CreatePreset = PresetCaller["create"];

type PresetRow = typeof presets.$inferSelect;

export interface SeededPreset {
  readonly view: Awaited<ReturnType<CreatePreset>>;
  readonly row: PresetRow;
}

/** Keep the routed creation's normalization and name de-collision, then capture only its returned identity. */
export async function seedPreset(root: ServerProducerRoot, userId: UserId, params: Parameters<CreatePreset>[0]): Promise<SeededPreset> {
  const db = root.db;
  const create = (await root.internalCallerFor(userId)).preset.create;
  const view = await create(params);
  return { view, row: await capturePresetRow(db, view.id) };
}

/** A copy-on-write update may return a different identity; capture that row, never the requested source. */
export async function seedUpdatedPreset(root: ServerProducerRoot, userId: UserId, params: Parameters<PresetCaller["update"]>[0]): Promise<SeededPreset> {
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
