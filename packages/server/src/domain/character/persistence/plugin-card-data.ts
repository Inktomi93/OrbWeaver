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
//      wall (`kit/serde/card`), unchanged by this write — the value lands in the residual bag verbatim.

import { pluginCardStateKey } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { characters } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, eq, sql } from "drizzle-orm";

/** WHOSE per-card state, on WHICH owned character — the three coordinates every read/merge carries. `characterId`
 *  is guest-supplied (owner-scope-gated, never trusted); `ownerId` is the installer the bridge closed over;
 *  `slug` is the emitter's own manifest slug, stamped host-side (never guest input) and the ONLY thing that
 *  decides which `plugin_<slug>` key is touched. Bundled so the merge stays within the 4-param house cap and the
 *  read/merge cannot drift apart on their scope. */
export interface PluginCardDataTarget {
  readonly characterId: CharacterId;
  readonly ownerId: UserId;
  readonly slug: string;
}

/** The SQLite JSON path for a plugin's reserved card-state key. Quoted (`$."…"`) because a slug may contain `-`,
 *  which a bare path label would terminate on — the quoted form is exact for the full `plugin_<slug>` key. */
function cardStatePath(slug: string): string {
  return `$."${pluginCardStateKey(slug)}"`;
}

/** The read verdict: `found:false` ⇒ no such OWNED character (foreign or absent — leak-free, the caller maps it
 *  to the plugin domain's NOT_FOUND); `found:true` ⇒ the installer owns it, `data` is the stored blob or `null`
 *  when this plugin has written none on that character. */
export type PluginCardDataRead = { readonly found: false } | { readonly found: true; readonly data: Record<string, unknown> | null };

/** Read one plugin's per-card state (`data.extensions.plugin_<slug>`) from an INSTALLER-OWNED character. See the
 *  file header for the owner-scope + slug-isolation walls.
 *
 *  `json_type` GATES the read on the value being a JSON OBJECT, and that gate is load-bearing, not decoration:
 *  `json_extract`'s return type is POLYMORPHIC — an object/array comes back as parseable JSON TEXT, but a stored
 *  scalar STRING comes back as its RAW unquoted text (invalid JSON) and a number as a JS number. A plugin's own
 *  `setCardData` always stores an object, so the only way a non-object lands under this key is a hostile IMPORTED
 *  card; reporting that as `null` (rather than parsing raw text into a crash, or handing back a scalar the
 *  `Record | null` contract forbids) is the safe, contract-honest answer. `t === "object"` guarantees `value` is
 *  the object's JSON text, so the `JSON.parse` cannot throw. */
export async function readPluginCardData(db: Db, target: PluginCardDataTarget): Promise<PluginCardDataRead> {
  const path = cardStatePath(target.slug);
  const rows = await db
    .select({
      type: sql<string | null>`json_type(${characters.extensions}, ${path})`,
      value: sql<string | null>`json_extract(${characters.extensions}, ${path})`,
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
  return { found: true, data: JSON.parse(row.value) as Record<string, unknown> };
}

/** Merge one plugin's per-card state under its reserved `plugin_<slug>` key on an INSTALLER-OWNED character's
 *  residual `extensions`, touching EXACTLY that one JSON path (an atomic single-statement `json_set` — sibling
 *  plugin keys stay byte-identical, even under concurrency). Returns `true` when a row was written (owned/found),
 *  `false` when no such owned character exists (the caller raises the leak-free NOT_FOUND). Does NOT bump
 *  `contentHash`/`updatedAt` and emits nothing — this is metadata, not card content (D148 clause d). */
export async function writePluginCardData(db: Db, target: PluginCardDataTarget, data: Record<string, unknown>): Promise<boolean> {
  const updated = await db
    .update(characters)
    .set({ extensions: sql`json_set(coalesce(${characters.extensions}, '{}'), ${cardStatePath(target.slug)}, json(${JSON.stringify(data)}))` })
    .where(and(eq(characters.id, target.characterId), eq(characters.ownerId, target.ownerId)))
    .returning({ id: characters.id });
  return updated.length > 0;
}
