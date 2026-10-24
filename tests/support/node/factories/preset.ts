// Preset seeds run the production verbs and return their outcomes; rows-tier twins in `rows/preset.ts` read the rows.

import type { presets } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { ServerProducerRoot, ServerTestHarness } from "../server.ts";

export type PresetCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>["preset"];
export type CreatePreset = PresetCaller["create"];

export type PresetRow = typeof presets.$inferSelect;

export interface SeededPreset {
  readonly view: Awaited<ReturnType<CreatePreset>>;
}

/** Keep the routed creation's normalization and name de-collision; its returned view is the seed's result. */
export async function seedPreset(root: ServerProducerRoot, userId: UserId, params: Parameters<CreatePreset>[0]): Promise<SeededPreset> {
  return { view: await (await root.internalCallerFor(userId)).preset.create(params) };
}

export interface SeededImportedPreset {
  readonly outcome: Awaited<ReturnType<PresetCaller["importFile"]>>;
  readonly row: PresetRow | undefined;
}
