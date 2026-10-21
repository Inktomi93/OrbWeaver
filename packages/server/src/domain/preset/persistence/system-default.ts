// The boot seeder alone owns this write; ids/content are shipped, and injected time is metadata only.
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { presets } from "@orb/db";
import { and, eq, isNull } from "drizzle-orm";
import { SYSTEM_DEFAULT_PRESET_ID } from "../constants.ts";

/** Overwrite the system-default row's config + version (the boot reseed; keyed on the sentinel + null
 *  owner so it can never hit an owned row). */
export async function reseedSystemDefault(db: Db, updatedAt: number): Promise<void> {
  await db
    .update(presets)
    .set({ config: DEFAULT_PROMPT_CONFIG, schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion, updatedAt })
    .where(and(eq(presets.id, SYSTEM_DEFAULT_PRESET_ID), isNull(presets.ownerId)));
}
