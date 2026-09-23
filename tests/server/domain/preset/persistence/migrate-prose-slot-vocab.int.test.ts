// domain/preset/persistence/migrate-prose-slot-vocab — the #1737 prose-slot id DATA migration statement, against
// a real libSQL db (the boot step that runs it is pinned at tests/server/entry/boot/migrate-prose-slot-vocab.int.test.ts).
// (the .int lane). The owner ruled arm (a) — rename the persisted slot id `chat.group.castMember` to
// `chat.group.characterHeading` WITH a migration and NO read-compat shim — so the whole safety of the rename
// rests on this step running before anything reads a preset.
//
// THE DEFECT IT EXISTS FOR IS SILENT, which is why every pin asserts through the READ SEAM
// (`parsePromptConfig` → `resolveProse`) rather than through the stored bytes: `proseOverridesSchema`'s
// preprocess STRIPS any key that is not a live `ProseSlotId` before the record schema sees it, so an
// un-migrated override does not throw — it VANISHES, the shipped default rides, and the host's authored
// narrator character heading is gone with nothing logged anywhere.
//
// Also pinned: the `baseVersion` stamp crosses (it is the ONLY staleness signal, PROSE-1 §4.4, and the
// 2026-08-30 slot ruling's whole warning was about stranding it), sibling overrides and the rest of the
// config survive, idempotence, and fail-open on a config blob that is not JSON at all.

import { DEFAULT_PROMPT_CONFIG, parsePromptConfig } from "@orb/contracts/preset";
import { resolveProse } from "@orb/contracts/prose";
import type { Db } from "@orb/db";
import { presets } from "@orb/db";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { migrateProseSlotVocab } from "@orb/server/domain/preset";
import { eq, sql } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const PRESET_ID = castId<PresetId>("preset_proseslotvocab1");
const AT = 1_700_000_000_000;

/** The slot as the host's stored blob spelled it BEFORE the rename. Written as raw column text on purpose —
 *  the typed `$type<PromptConfig>()` can no longer express the retired key, which is exactly the situation an
 *  installed db is in. */
async function seedRawConfig(db: Db, raw: string, id: PresetId = PRESET_ID): Promise<void> {
  await db.insert(presets).values({ id, ownerId: null, name: id, kind: "user", config: DEFAULT_PROMPT_CONFIG, createdAt: AT, updatedAt: AT });
  await db
    .update(presets)
    .set({ config: sql`${raw}` })
    .where(eq(presets.id, id));
}

async function storedConfig(db: Db, id: PresetId = PRESET_ID): Promise<string | null> {
  const rows = await db
    .select({ blob: sql<string | null>`cast(${presets.config} as text)` })
    .from(presets)
    .where(eq(presets.id, id));
  return rows.at(0)?.blob ?? null;
}

/** The read seam an actual preset load goes through. */
async function readProse(db: Db, id: PresetId = PRESET_ID): Promise<ReturnType<typeof parsePromptConfig>["prose"]> {
  const raw = await storedConfig(db, id);
  return parsePromptConfig(raw === null ? null : (JSON.parse(raw) as unknown)).prose;
}

const OLD_KEY_CONFIG = JSON.stringify({
  schemaVersion: 1,
  sections: [],
  prose: {
    "chat.group.castMember": { text: "[Voice — {{name}}]", baseVersion: 1 },
    "chat.group.scenarioHeading": { text: "[{{name}} — setting]", baseVersion: 1 },
  },
});

test("a pre-#1737 override SURVIVES the rename — without the migration the read seam has already lost it", async () => {
  const db = await freshDb();
  await seedRawConfig(db, OLD_KEY_CONFIG);

  // RED WITHOUT THE MIGRATION: the retired key is stripped by `proseOverridesSchema`'s preprocess, so the
  // host's authored heading is simply absent and `resolveProse` hands back the shipped default.
  const before = await readProse(db);
  expect(before["chat.group.characterHeading"]).toBeUndefined();
  expect(resolveProse("chat.group.characterHeading", before).source).toBe("default");

  expect(await migrateProseSlotVocab(db)).toBe(1);

  const after = await readProse(db);
  expect(after["chat.group.characterHeading"]).toStrictEqual({ text: "[Voice — {{name}}]", baseVersion: 1 });
  expect(resolveProse("chat.group.characterHeading", after)).toStrictEqual({ text: "[Voice — {{name}}]", source: "override", stale: true });
});

// The stamp is the whole point of the ruling this migration answers: the slot's header (2026-08-30) warned
// that a silent id edit "would strand every host's `baseVersion` stamp". A rewrite that re-minted the record
// instead of MOVING it would land `baseVersion: 2` here and silently mark a stale edit fresh.
test("the `baseVersion` stamp is CARRIED, not re-minted — a current-version edit stays non-stale", async () => {
  const db = await freshDb();
  await seedRawConfig(
    db,
    JSON.stringify({ schemaVersion: 1, sections: [], prose: { "chat.group.castMember": { text: "[Voice — {{name}}]", baseVersion: 2 } } }),
  );

  await migrateProseSlotVocab(db);

  expect(resolveProse("chat.group.characterHeading", await readProse(db)).stale).toBe(false);
});

test("every sibling key survives — the other prose override and the rest of the config are untouched", async () => {
  const db = await freshDb();
  await seedRawConfig(db, OLD_KEY_CONFIG);

  await migrateProseSlotVocab(db);

  const after = await readProse(db);
  expect(after["chat.group.scenarioHeading"]).toStrictEqual({ text: "[{{name}} — setting]", baseVersion: 1 });
  // And nothing is left behind under the retired spelling.
  expect(await storedConfig(db)).not.toContain("castMember");
});

test("IDEMPOTENT — the second boot rewrites nothing and leaves the blob byte-identical", async () => {
  const db = await freshDb();
  await seedRawConfig(db, OLD_KEY_CONFIG);

  expect(await migrateProseSlotVocab(db)).toBe(1);
  const afterFirst = await storedConfig(db);

  expect(await migrateProseSlotVocab(db)).toBe(0);
  expect(await storedConfig(db)).toBe(afterFirst);
});

test("a config ALREADY in the new spelling, and one with no prose at all, are both left alone", async () => {
  const db = await freshDb();
  const noProse = castId<PresetId>("preset_proseslotvocab2");
  await seedRawConfig(
    db,
    JSON.stringify({ schemaVersion: 1, sections: [], prose: { "chat.group.characterHeading": { text: "[Voice — {{name}}]", baseVersion: 2 } } }),
  );
  await seedRawConfig(db, JSON.stringify({ schemaVersion: 1, sections: [] }), noProse);
  const before = await storedConfig(db);
  const beforeNoProse = await storedConfig(db, noProse);

  expect(await migrateProseSlotVocab(db)).toBe(0);
  expect(await storedConfig(db)).toBe(before);
  expect(await storedConfig(db, noProse)).toBe(beforeNoProse);
});

// `json_type` RAISES on a non-JSON string, so the `json_valid` guard has to be NESTED inside its first
// argument rather than a sibling AND term (SQLite may reorder AND operands). Without that nesting one corrupt
// row aborts BOOT — the one thing this step must never do.
test("a config blob that is not JSON at all is left for the read seam — a corrupt row must not abort boot", async () => {
  const db = await freshDb();
  await seedRawConfig(db, "not json at all");

  expect(await migrateProseSlotVocab(db)).toBe(0);
  expect(await storedConfig(db)).toBe("not json at all");
});
