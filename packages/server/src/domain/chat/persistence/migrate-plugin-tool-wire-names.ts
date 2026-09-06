// domain/chat/persistence/migrate-plugin-tool-wire-names — the #1391 rewrite of persisted
// `ToolCallRecord.name`s inside `message_variants.tool_calls`, one prefix rename at a time.
//
// WHY CHAT OWNS IT even though the subject is a plugin's namespace: `message_variants` is chat's table and a
// table's OWNER domain writes it — the same rule that put `migrateProseSlotVocab` in preset and
// `backfillPluginProvenance` in character. The plugin knowledge (WHICH prefix becomes which, and which
// namespaces are too ambiguous to touch) is decided in `domain/plugin/substrate/wire-name-renames.ts` and
// arrives here as plain `{from, to}` data, wired by the boot step — so chat imports no sibling domain.
//
// WHY IT IS A BOOT DATA STEP AND NOT A `0000_baseline.sql` LINE: there is NO DDL. The column is plain TEXT
// and only a string INSIDE the JSON moved, so a baseline regen would not rewrite a single row (Tier-1-DB
// §"Regime 1"), and pre-launch the baseline is squashed rather than forward-only, so there is no incremental
// migration file to hang a data rewrite on.
//
// WHY IT MATTERS — the SILENT arm, which is the whole reason this is not "the model will just see a new
// name": a `tool-card` plugin surface is matched to a persisted call by `toolWireName`
// (`domain/plugin/verbs/list-surfaces.ts`, U3). Rename the mint without rewriting the rows and every card a
// hyphen-slug plugin ever rendered silently falls back to the generic tool block — no error, no log, just a
// transcript that quietly got poorer. That is the #1649 silent-loss class the owner ruled against.
//
// THE STATEMENT SHAPE, and why it is a LOOP rather than one array rebuild. `tool_calls` is a JSON ARRAY, and
// the obvious `json_group_array(...) FROM json_each(...)` rebuild would re-serialize the whole array —
// making the write whole-record, and making the transcript's call ORDER depend on json_each's scan order,
// which is not a documented guarantee. Instead each statement does ONE `json_set` at ONE computed path,
// `$[<lowest matching index>].name`, leaving every other byte of the array in place. Repeat until no row
// matches.
//
// TERMINATION IS PROVEN, NOT ASSUMED: a rename's `to` can never start with its `from` (they are the same
// slug flattened with `_` and with `__`, and the slug HAS a hyphen — so they differ at that position), which
// means a rewritten element never matches the predicate again. Each pass therefore strictly reduces the
// number of matching elements. No iteration cap is needed and none is spelled, because a cap would be a
// guess about a bound the algebra already gives.
//
// IDEMPOTENT BY PREDICATE, no marker column: the WHERE fires only on a variant that still holds a call under
// the legacy prefix. The second boot matches zero rows. The rename set itself carries the other half of
// idempotency (`pluginToolWireNameRenames` refuses a rename whose DESTINATION namespace another installed
// slug's legacy names still occupy), which is what stops a second run from rewriting a first run's output.
//
// FAIL-OPEN ON GARBAGE: the `json_valid` guard is nested INSIDE the json function's first argument, never a
// sibling AND term — SQLite may reorder AND operands and `json_each`/`json_type` RAISE on non-JSON text,
// which at this call site would abort boot on one corrupt row (#1649 proved this by un-nesting it). A blob
// that is not a JSON array resolves to `'[]'`, matches nothing, and is left for the read seam's own parse.

import type { Db } from "@orb/db";
import { messageVariants } from "@orb/db";
import type { SQL } from "drizzle-orm";
import { and, isNotNull, sql } from "drizzle-orm";

/** The column as a JSON ARRAY, or the empty array when the stored text is not JSON at all. Every json
 *  function below takes THIS rather than the raw column — see the fail-open note in the header. */
const TOOL_CALLS_JSON: SQL = sql`(case when json_valid(${messageVariants.toolCalls}) then ${messageVariants.toolCalls} else '[]' end)`;

/** One record's `name`, addressed from the COLUMN by index rather than off `json_each`'s row value.
 *
 *  WHY THE INDEXED FORM RATHER THAN THE SHORTER `element.value`: it is the SAME addressing the rewrite's own
 *  `json_set` uses, so the file speaks one scheme end to end — and `element.value` is genuinely NOT a column
 *  read, which the `open-json-column-key-parity` gate cannot tell (a `json_each(…) AS element` alias is not a
 *  table alias, so its `.value` pools into every drizzle column named `value` and this `$.name` read gets
 *  attributed to the open `settings.value` blob). Reported as a gate blind spot; this spelling is the honest
 *  one regardless of the gate. */
function recordName(index: SQL): SQL {
  return sql`json_extract(${TOOL_CALLS_JSON}, '$[' || ${index} || '].name')`;
}

/** Does one array element carry a tool name under `from`? `substr(…) = from` rather than `LIKE from || '%'`
 *  on purpose: `_` is a single-character WILDCARD in SQLite's LIKE, and every prefix here is dense with
 *  underscores, so a LIKE would match names that merely rhyme with the namespace. */
function matchesPrefix(from: string): SQL {
  return sql`substr(${recordName(sql`element.key`)}, 1, ${from.length}) = ${from}`;
}

/** The LOWEST array index still carrying a legacy name, as a scalar subquery. `order by` makes the choice
 *  deterministic, so a partially-applied pass (a crash mid-boot) resumes in the same place. */
function lowestMatchingIndex(from: string): SQL {
  return sql`(select element.key from json_each(${TOOL_CALLS_JSON}) as element where ${matchesPrefix(from)} order by element.key limit 1)`;
}

/**
 * Rewrite every persisted `ToolCallRecord.name` under `from` to the same name under `to`, for one rename.
 * Returns the number of `json_set` statements that changed a row — a useful boot signal, NOT a row count
 * (one variant holding three legacy calls counts three).
 */
async function applyOneRename(db: Db, from: string, to: string): Promise<number> {
  const path = sql`('$[' || ${lowestMatchingIndex(from)} || '].name')`;
  let applied = 0;
  for (;;) {
    // @orb-waive no-await-db-in-loop(returning): the same converge-to-fixpoint migration as the automation half: one pass per matching arm, repeating until zero rows. Ends when json_set can rewrite every matching arm in one statement.
    const rows = await db
      .update(messageVariants)
      .set({
        // ONE key-wise `json_set` at ONE path: the tool half of the name is carried across VERBATIM
        // (`substr` past the prefix), never re-derived — the migration cannot mint a name, only re-prefix one.
        toolCalls: sql`json_set(${TOOL_CALLS_JSON}, ${path}, ${to} || substr(json_extract(${TOOL_CALLS_JSON}, ${path}), ${from.length + 1}))`,
      })
      .where(and(isNotNull(messageVariants.toolCalls), sql`exists (select 1 from json_each(${TOOL_CALLS_JSON}) as element where ${matchesPrefix(from)})`))
      .returning({ id: messageVariants.id });
    if (rows.length === 0) {
      return applied;
    }
    applied += rows.length;
  }
}

/**
 * Re-prefix every persisted plugin tool-call name that the #1391 injective mint renamed. `renames` is
 * `pluginToolWireNameRenames(...)`'s answer, handed down by the boot step — an empty array (no hyphenated
 * slug installed, or every one of them ambiguous) is a no-op and the normal case.
 *
 * Returns the total number of names rewritten; 0 on every boot after the first.
 */
export async function migratePluginToolWireNames(db: Db, renames: readonly { readonly from: string; readonly to: string }[]): Promise<number> {
  let rewritten = 0;
  for (const rename of renames) {
    rewritten += await applyOneRename(db, rename.from, rename.to);
  }
  return rewritten;
}
