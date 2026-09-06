// domain/character/persistence/backfill-plugin-provenance — the #1708 one-time DATA repair for cards
// plugin-ingested BEFORE #1702 minted `importedFrom`. Those rows carry `importedFrom: null` and still read
// "Made here" (`characterProvenanceOf` collapses a null `importedFrom` to `authored`).
//
// THE CANDIDATE SET IS ALREADY TIGHT WITHOUT THE RESERVED KEY. `importHash` is stamped by `importFileHash`
// for every row that went through the import funnel (file upload OR plugin ingest) and stays NULL for an
// authored row (`schema/character.ts`: "Null when authored"); post-#1702 every import ALSO stamps
// `importedFrom` (a filename, or the plugin marker). So `importedFrom IS NULL AND importHash IS NOT NULL`
// already means "this row was imported, but provenance was never stamped" — which, after #1702 shipped, is
// reachable ONLY by a pre-#1702 plugin ingest. That pair is the CANDIDATE predicate; the reserved key below
// answers a NARROWER question (which plugin), never "was this row plugin-ingested at all".
//
// RECOVERING WHICH PLUGIN, when possible: a plugin that later called `character.card_state`'s `setCardData`
// on this same character (Card Atlas stamps `{source,ref,importedAtMs}` there right after ingest) leaves its
// own reserved `plugin_<slug>` key under `characters.extensions` (D148, `pluginCardStateKey`). A candidate
// carrying no such key, or naming a slug this owner has since uninstalled, has no recoverable plugin identity
// and is left authored (counted, never guessed) — the row body's own "when present".
//
// THE CONTENT HASH IS THE ROW'S OWN `importHash`, never re-derived from re-serialized card bytes: it is
// EXACTLY the value `importFileHash(bytes)` produced when this card was first imported (the same input
// #1702's live mint hashes), so reading the stored column IS "re-hashing the stored card bytes" — recomputing
// it from a reconstructed file would risk a byte-for-byte mismatch against the original upload and could never
// be VERIFIED as the same value the live path would have minted.
//
// IDEMPOTENT BY PREDICATE, no marker column: every per-row UPDATE re-asserts `importedFrom IS NULL` (this
// file's own read predicate) so a second boot, or a concurrent write that already stamped the row, matches
// zero rows rather than re-minting on top of a settled value.

import { pluginImportedFrom } from "@orb/contracts/character";
import { PLUGIN_TOOL_NAME_PREFIX } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { characters, plugins } from "@orb/db";
import type { CharacterId, PluginId, UserId } from "@orb/kit/ids";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { BackfillPluginProvenanceResult } from "../contract/results.ts";

interface Candidate {
  readonly id: CharacterId;
  readonly ownerId: UserId;
  readonly extensions: Record<string, unknown> | null;
  readonly importHash: string;
}

/** The first `plugin_<slug>` key's slug off a card's residual `extensions`, or null when none is present.
 *  A slug can never contain `_` (`SLUG_RE`), so the ONE `_` the prefix ends on is unambiguous — no parse
 *  hazard from a later `_` inside the slug itself. Object key order is insertion order (the only plugin that
 *  would ever call `setCardData` on a card it did not ingest is a distinct, later-installed one, so "first"
 *  reads as "earliest-written", the ingesting plugin's own post-import stamp). */
function firstPluginSlug(extensions: Record<string, unknown> | null): string | null {
  if (extensions === null) {
    return null;
  }
  for (const key of Object.keys(extensions)) {
    if (key.startsWith(PLUGIN_TOOL_NAME_PREFIX)) {
      return key.slice(PLUGIN_TOOL_NAME_PREFIX.length);
    }
  }
  return null;
}

/** Resolve `(ownerId, slug)` to that owner's currently-installed plugin id, or null when no such plugin is
 *  installed for them (uninstalled since, or never was — the candidate is then left authored). */
async function resolveInstalledPluginId(db: Db, ownerId: UserId, slug: string): Promise<PluginId | null> {
  const rows = await db
    .select({ id: plugins.id })
    .from(plugins)
    .where(and(eq(plugins.ownerId, ownerId), eq(plugins.slug, slug)))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Stamp `importedFrom` for every pre-#1702 plugin-ingested character whose plugin identity is recoverable
 *  from its card's reserved `plugin_<slug>` extensions key; leaves the rest `authored` (a heuristic derived
 *  from card content — the same honest limit `AUTHORED_CARD_CREATOR` accepts, `@orb/contracts/character`).
 *  Idempotent — see the file header. */
export async function backfillPluginProvenance(db: Db): Promise<BackfillPluginProvenanceResult> {
  const candidates: Candidate[] = await db
    .select({ id: characters.id, ownerId: characters.ownerId, extensions: characters.extensions, importHash: characters.importHash })
    .from(characters)
    .where(and(isNull(characters.importedFrom), isNotNull(characters.importHash)))
    .then((rows) => rows.filter((row): row is Candidate => row.importHash !== null));

  let backfilled = 0;
  let leftAuthored = 0;
  for (const candidate of candidates) {
    const slug = firstPluginSlug(candidate.extensions);
    const pluginId = slug === null ? null : await resolveInstalledPluginId(db, candidate.ownerId, slug);
    if (pluginId === null) {
      leftAuthored += 1;
      continue;
    }
    // @orb-waive no-await-db-in-loop(returning): one owner-scoped UPDATE per candidate because the written value is computed per row from that row's own plugin id and import hash; a single statement cannot carry per-row values here. Ends when the backfill is expressed as one CTE-joined update.
    const updated = await db
      .update(characters)
      .set({ importedFrom: pluginImportedFrom(pluginId, candidate.importHash) })
      // The owner rides the WHERE (owner-scoped-writes arm 1): the candidate row was read WITH its owner, so a
      // stranger's row of the same id — impossible by the id mint, but the gate asks the statement to say so —
      // moves 0 rows.
      .where(and(eq(characters.id, candidate.id), eq(characters.ownerId, candidate.ownerId), isNull(characters.importedFrom)))
      .returning({ id: characters.id });
    if (updated.length > 0) {
      backfilled += 1;
    } else {
      leftAuthored += 1;
    }
  }
  return { backfilled, leftAuthored };
}
