// domain/character/persistence/plugin-card-data — the OWNER-SCOPED per-card plugin-state read/merge on a
// character's residual `extensions` JSON column (D148 — the ST `writeExtensionField` parity arm; the reserved
// `data.extensions.plugin_<slug>` namespace). The character domain owns the `characters` table + its
// `extensions` column, so it owns this read/merge; the PLUGIN domain owns the capability, the host-stamped slug,
// and the leak-free `PluginNotFoundError` mapping (wired at `entry/compose`). These are bare `(db, …)` functions
// re-exported from the domain front door and injected at compose — the `chat::loadPresentRole` cross-domain
// precedent (a persistence primitive a sibling domain reaches through the composition root, never a direct
// import).
//
// THREE SECURITY PROPERTIES LIVE HERE, and each is structural, not a runtime check to remember:
//   1. OWNER-SCOPE. Both the merge and the read carry `WHERE owner_id = :ownerId`. A `characterId` the caller's
//      installer does not own matches NO row: the write affects 0 rows (→ the caller raises the leak-free
//      NOT_FOUND) and the read returns 0 rows (same). A foreign and an absent character are indistinguishable —
//      no existence oracle. This is the ONLY scope; there is no principal, because a residual-extensions merge
//      is the owner's own reach, gated by the column's own `owner_id` (the `storage.kv` posture, D148 clause b).
//   2. SLUG NAMESPACE ISOLATION. The key is DERIVED here as `pluginCardStateKey(slug)` (= `plugin_<slug>`) from
//      the `slug` the caller stamped host-side (never guest input) — so a plugin can target only its OWN key,
//      and this function CANNOT be asked to touch any other key. The merge is an atomic single-statement
//      `json_set` of that ONE path, so a sibling `plugin_<otherslug>` value is left byte-identical even under
//      concurrent writes (a read-modify-write in JS would lose a concurrent sibling's key — the reason this is
//      SQL-side, D148 clause b's "cannot read or overwrite another plugin's field").
//   3. METADATA, NOT CONTENT. The merge touches ONLY `extensions`; it does NOT recompute `contentHash`, does NOT
//      stamp `updatedAt`, and this file holds no bus/emit op at all — so a card-state write can NEVER re-index
//      the character or invalidate a canon view (D148 clause d, the opposite of `create`/`update`). Inertness of
//      the stored value (a nested `depth_prompt` staying inert data, never a promoted column) is the serde tier's
//      wall (`primitives/serde/card`), unchanged by this write — the value lands in the residual bag verbatim.

import { PLUGIN_CARD_DATA_FIND_MAX, pluginCardStateKey } from "@orb/contracts/plugin";
import { characters } from "@orb/db";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { CharacterId } from "@orb/kit/ids";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { PluginCardDataLookup, PluginCardDataTarget } from "../contract/params.ts";
import type { PluginCardDataHit, PluginCardDataRead, PluginCardDataWrite } from "../contract/results.ts";

const cardStateSchema = z.record(z.string(), z.unknown());

/** The SQLite JSON path for a plugin's reserved card-state key. Quoted (`$."…"`) because a slug may contain `-`,
 *  which a bare path label would terminate on — the quoted form is exact for the full `plugin_<slug>` key. */
function cardStatePath(slug: string): string {
  return `$."${pluginCardStateKey(slug)}"`;
}

/** Read one plugin's per-card state (`data.extensions.plugin_<slug>`) from an INSTALLER-OWNED character. See the
 *  file header for the owner-scope + slug-isolation walls.
 *
 *  `json_type` GATES the read on the value being a JSON OBJECT, and that gate is load-bearing, not decoration:
 *  `json_extract`'s return type is POLYMORPHIC — an object/array comes back as parseable JSON TEXT, but a stored
 *  scalar STRING comes back as its RAW unquoted text (invalid JSON) and a number as a JS number. A plugin's own
 *  `setCardData` always stores an object, so the only way a non-object lands under this key is a hostile IMPORTED
 *  card; reporting that as `null` (rather than parsing raw text into a crash, or handing back a scalar the
 *  `Record | null` contract forbids) is the safe, contract-honest answer. `t === "object"` guarantees `value` is
 *  the object's JSON text, so the `JSON.parse` cannot throw.
 *
 *  The `CASE` guards both functions for the reason {@link findPluginCardData} states: an uploaded card can nest past
 *  SQLite's JSON limit, where they raise. Such a column holds no state a plugin could have written, so it reads as
 *  no state. */
export async function readPluginCardData(handle: DatabaseHandle, target: PluginCardDataTarget): Promise<PluginCardDataRead> {
  const db = databaseForOwner(handle);
  const path = cardStatePath(target.slug);
  const rows = await db
    .select({
      type: sql<string | null>`case when json_valid(${characters.extensions}) then json_type(${characters.extensions}, ${path}) end`,
      value: sql<string | null>`case when json_valid(${characters.extensions}) then json_extract(${characters.extensions}, ${path}) end`,
    })
    .from(characters)
    .where(and(eq(characters.id, target.characterId), eq(characters.ownerId, target.ownerId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    return { found: false };
  }
  // `type === null` ⇒ the key is absent (or the whole column is NULL); any non-`"object"` type ⇒ a hostile
  // import wrote a scalar/array under our key — both report `null` (found, but no valid state for this plugin).
  if (row.type !== "object" || row.value === null) {
    return { found: true, data: null };
  }
  return { found: true, data: cardStateSchema.parse(JSON.parse(row.value)) };
}

/** The owner's distinct object stamps for this plugin holding any of `values` as a string, at any depth, each with
 *  one character that carries it. Owner and slug scope match {@link readPluginCardData}. `json_tree` keeps the match
 *  blind to the stamp's shape, and the `json_type` gate gives a hostile imported scalar or array the same answer as
 *  no stamp. Grouping before the limit bounds the answer by distinct stamps, because a duplicate keeps its stamp and
 *  copies of one card must not push another card out.
 *
 *  The `CASE` is the guard, not a style choice: an uploaded card can nest past SQLite's JSON limit, the JSON functions
 *  raise on that column, and one such row would fail this owner-wide read. `CASE` guarantees evaluation order and a
 *  `WHERE` conjunction does not. */
export async function findPluginCardData(handle: DatabaseHandle, { ownerId, slug, values }: PluginCardDataLookup): Promise<PluginCardDataHit[]> {
  if (values.length === 0) {
    return [];
  }
  const db = databaseForOwner(handle);
  const path = cardStatePath(slug);
  const stored = inArray(sql`atom`, [...values]);
  const stamp = sql<string>`json_extract(${characters.extensions}, ${path})`;
  const holder = sql<CharacterId>`min(${characters.id})`;
  const rows = await db
    .select({ id: holder, value: stamp })
    .from(characters)
    .where(
      and(
        eq(characters.ownerId, ownerId),
        sql`case when json_valid(${characters.extensions})
          then json_type(${characters.extensions}, ${path}) = 'object'
            and exists (select 1 from json_tree(${characters.extensions}, ${path}) where type = 'text' and ${stored})
          else 0 end`,
      ),
    )
    .groupBy(stamp)
    .orderBy(asc(holder))
    .limit(PLUGIN_CARD_DATA_FIND_MAX);
  return rows.map((row) => ({ characterId: row.id, data: cardStateSchema.parse(JSON.parse(row.value)) }));
}

/** Merge one plugin's per-card state under its reserved `plugin_<slug>` key on an INSTALLER-OWNED character's
 *  residual `extensions`, touching EXACTLY that one JSON path (an atomic single-statement `json_set` — sibling
 *  plugin keys stay byte-identical, even under concurrency). Answers `written` when a row was written, `absent`
 *  when no such owned character exists (the caller raises the leak-free NOT_FOUND) and `unwritable` when the
 *  character's extensions nest past SQLite's JSON limit, where `json_set` raises: the `json_valid` arm of the WHERE
 *  keeps such a row out of the SET, and nothing is written. Does NOT bump `contentHash`/`updatedAt` and emits
 *  nothing — this is metadata, not card content (D148 clause d). */
export async function writePluginCardData(handle: DatabaseHandle, target: PluginCardDataTarget, data: Record<string, unknown>): Promise<PluginCardDataWrite> {
  const db = databaseForOwner(handle);
  const owned = and(eq(characters.id, target.characterId), eq(characters.ownerId, target.ownerId));
  const updated = await db
    .update(characters)
    .set({ extensions: sql`json_set(coalesce(${characters.extensions}, '{}'), ${cardStatePath(target.slug)}, json(${JSON.stringify(data)}))` })
    .where(and(owned, sql`(${characters.extensions} is null or json_valid(${characters.extensions}))`))
    .returning({ id: characters.id });
  if (updated.length > 0) {
    return "written";
  }
  const [present] = await db.select({ id: characters.id }).from(characters).where(owned).limit(1);
  return present === undefined ? "absent" : "unwritable";
}
