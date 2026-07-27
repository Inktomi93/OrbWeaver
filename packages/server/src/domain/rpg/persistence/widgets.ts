// domain/rpg/persistence/widgets — custom HUD widget DEFINITIONS store (rpg-design/05 §4.1). Identity-plane
// CRUD (the value plane lives on the snapshot, `widgetValues`). `binding` is parse-on-read through the
// contract schema. The verb layer (W1b) host-gates; persistence takes the ids it's given.

import type { RpgWidgetDef } from "@orb/contracts/rpg";
import { rpgWidgetBindingSchema } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { rpgHudWidgets } from "@orb/db";
import type { RpgGameId, RpgWidgetId } from "@orb/kit/ids";
import { and, asc, eq } from "drizzle-orm";
import { RpgStateCorruptError } from "../contract/errors";
import type { NewRpgWidget, RpgWidgetRow } from "../contract/service";

/** Re-validate the `binding` JSON through its contract schema (parse-on-read). */
function parseWidgetRow(row: RpgWidgetRow): RpgWidgetRow {
  const parsed = rpgWidgetBindingSchema.safeParse(row.binding);
  if (!parsed.success) {
    throw new RpgStateCorruptError("rpg_hud_widgets", row.id, `binding: ${parsed.error.message}`);
  }
  return { ...row, binding: parsed.data };
}

/** All widget defs for a game, sorted by `sort` then id (a stable render order), parsed. */
export async function listWidgets(db: Db, gameId: RpgGameId): Promise<readonly RpgWidgetRow[]> {
  const rows = await db.select().from(rpgHudWidgets).where(eq(rpgHudWidgets.gameId, gameId)).orderBy(asc(rpgHudWidgets.sort), asc(rpgHudWidgets.id));
  return rows.map(parseWidgetRow);
}

/** Create a widget def, returning it parsed. `id`/`now` injected. */
export async function insertWidget(
  db: Db,
  input: { readonly id: RpgWidgetId; readonly gameId: RpgGameId; readonly def: RpgWidgetDef; readonly now: number },
): Promise<RpgWidgetRow> {
  const rows = await db
    .insert(rpgHudWidgets)
    .values({
      id: input.id,
      gameId: input.gameId,
      type: input.def.type,
      label: input.def.label,
      icon: input.def.icon,
      position: input.def.position,
      accent: input.def.accent,
      sort: input.def.sort,
      binding: input.def.binding,
      createdAt: input.now,
    })
    .returning();
  const row = rows[0];
  if (!row) {
    throw new Error("insertWidget: no row returned");
  }
  return parseWidgetRow(row);
}

/** Patch a widget def's mutable columns (the verb composes the patch). SCOPED to `gameId` — a widget id from
 *  another game matches zero rows (the cross-tenant IDOR belt); returns whether a row was touched so the verb
 *  can surface a leak-free not-found. */
export async function updateWidget(
  db: Db,
  gameId: RpgGameId,
  id: RpgWidgetId,
  // Per-field `| undefined` (the transport wire patch the W2 verb spreads in): a `.set()` skips undefined keys,
  // and `exactOptionalPropertyTypes` needs the explicit undefined for the zod-`.partial()` wire shape to assign.
  patch: { [K in "type" | "label" | "icon" | "position" | "accent" | "sort" | "binding"]?: NewRpgWidget[K] | undefined },
): Promise<boolean> {
  const rows = await db
    .update(rpgHudWidgets)
    .set(patch)
    .where(and(eq(rpgHudWidgets.id, id), eq(rpgHudWidgets.gameId, gameId)))
    .returning({ id: rpgHudWidgets.id });
  return rows.length > 0;
}

/** Delete a widget def. SCOPED to `gameId` — a foreign game's widget id matches zero rows. Returns whether a
 *  row was deleted (the verb throws a leak-free not-found on a no-match). */
export async function deleteWidget(db: Db, gameId: RpgGameId, id: RpgWidgetId): Promise<boolean> {
  const rows = await db
    .delete(rpgHudWidgets)
    .where(and(eq(rpgHudWidgets.id, id), eq(rpgHudWidgets.gameId, gameId)))
    .returning({ id: rpgHudWidgets.id });
  return rows.length > 0;
}
