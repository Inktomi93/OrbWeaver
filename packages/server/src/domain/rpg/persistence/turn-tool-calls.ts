// domain/rpg/persistence/turn-tool-calls — the per-variant record of WHAT THE MODEL DID on a folded turn
// (TOOLCALLS-INVISIBLE, arm A). One row per producing variant, holding that turn's whole call list.
//
// WHY THIS TABLE EXISTS AT ALL: D112 rules that chat never resolves, executes or persists a terminal tool's
// calls — they are handed straight back to the contributor. That is what keeps the fold server-internal, and
// it is also why nothing in the product could ever show what a turn did. The CONTRIBUTOR recording its own
// calls is the clause working as written; filling chat's `message_variants.tool_calls` would have been the
// same feature with the ruling quietly reversed (see the table's header).
//
// NO ACTIVE-LINEAGE PROJECTION HERE, deliberately — unlike `listActiveJournal`. The journal RENDERS a single
// merged archive, so it must resolve which entries belong to the visible lineage. This read feeds a per-ROW
// disclosure: the row already knows which variant it is showing, so the client indexes by `variantId` and a
// swipe re-targets with NO refetch. Filtering to the selected variant here would make every swipe a network
// round-trip to display data the client already held.
//
// No parse-on-read belt beyond the one below: `calls` is the only JSON column.

import type { Db } from "@orb/db";
import { rpgTurnToolCalls } from "@orb/db";
import type { MessageVariantId, RpgGameId } from "@orb/kit/ids";
import { desc, eq } from "drizzle-orm";
import type { NewRpgTurnToolCalls, RpgTurnToolCallsRow } from "../contract/service.ts";

/** Record one folded turn's calls. `id`/`now` injected (determinism).
 *
 *  IDEMPOTENT ON THE VARIANT: a re-flush of the same variant REPLACES its record rather than throwing on the
 *  unique index. A record is a description of one completed turn, so the newest description of it wins — and
 *  a state write must never be able to fail a turn on an observability row (the flush's standing
 *  errors-as-data posture). */
export async function recordTurnToolCalls(db: Db, values: NewRpgTurnToolCalls): Promise<RpgTurnToolCallsRow> {
  const rows = await db
    .insert(rpgTurnToolCalls)
    .values(values)
    .onConflictDoUpdate({ target: rpgTurnToolCalls.variantId, set: { calls: values.calls, messageId: values.messageId, createdAt: values.createdAt } })
    .returning();
  const row = rows[0];
  if (!row) {
    throw new Error("recordTurnToolCalls: no row returned");
  }
  return row;
}

/** A game's recorded turns, newest first — the transcript window the client indexes by `variantId`. Paged so
 *  a long game never serves its whole history to render a disclosure most people never open. */
export function listTurnToolCalls(db: Db, gameId: RpgGameId, opts: { readonly limit: number }): Promise<RpgTurnToolCallsRow[]> {
  return db
    .select()
    .from(rpgTurnToolCalls)
    .where(eq(rpgTurnToolCalls.gameId, gameId))
    .orderBy(desc(rpgTurnToolCalls.createdAt), desc(rpgTurnToolCalls.id))
    .limit(opts.limit);
}

/** The record for ONE variant (test/introspection — the CASCADE probe reads this). */
export function findTurnToolCallsByVariant(db: Db, variantId: MessageVariantId): Promise<RpgTurnToolCallsRow[]> {
  return db.select().from(rpgTurnToolCalls).where(eq(rpgTurnToolCalls.variantId, variantId));
}
