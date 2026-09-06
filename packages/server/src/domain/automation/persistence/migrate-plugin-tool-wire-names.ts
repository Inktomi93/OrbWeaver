// domain/automation/persistence/migrate-plugin-tool-wire-names — the #1391 rewrite of the `run_tool` arm's
// `name` inside `automation_rules.actions`, one prefix rename at a time.
//
// THE CHAT TWIN, one table over (`domain/chat/persistence/migrate-plugin-tool-wire-names.ts`) — read that
// file's header for the statement algebra, the termination proof, the LIKE-vs-substr note and the nested
// `json_valid` guard, none of which is restated here. Only the two DIFFERENCES belong in this header:
//
//   1. THE ARM FILTER. `actions` is a heterogeneous 1..8 array of action arms, and `name` means something
//      else on other arms (an author's label, a variable key). So the predicate is `$.type = 'run_tool'` AND
//      the prefix test — never the prefix test alone. D146-a is what makes a plugin tool reachable from a
//      rule at all, and `run_tool` is deliberately the tuple's closing closed/open boundary member, so this
//      is the ONE arm that can hold a plugin wire name.
//   2. WHAT AN UN-MIGRATED ROW COSTS. Unlike the transcript's silent card fallback, a stale `run_tool.name`
//      is at least LOUD at fire time — the arm resolves against the LIVE registry
//      (`substrate/validate.ts` at mint, the executor at fire) and a name nobody holds does not act. Loud is
//      better than silent, but a rule the host authored and never touched again would simply stop firing, so
//      it is still a rewrite the owner ruled for rather than a nice-to-have.
//
// WHY AUTOMATION OWNS IT: `automation_rules` is automation's table and a table's OWNER domain writes it. The
// plugin knowledge arrives as plain `{from, to}` data from the boot step (decided by
// `domain/plugin/substrate/wire-name-renames.ts`), so automation imports no sibling domain.

import type { Db } from "@orb/db";
import { automationRules } from "@orb/db";
import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";

/** The column as a JSON ARRAY, or the empty array when the stored text is not JSON at all. */
const ACTIONS_JSON: SQL = sql`(case when json_valid(${automationRules.actions}) then ${automationRules.actions} else '[]' end)`;

/** One arm's field, addressed from the COLUMN by index rather than off `json_each`'s row value.
 *
 *  WHY THE INDEXED FORM RATHER THAN THE SHORTER `element.value`: it is the SAME addressing the rewrite's own
 *  `json_set` uses, so the file speaks one scheme end to end — and `element.value` is genuinely NOT a column
 *  read, which the `open-json-column-key-parity` gate cannot tell (a `json_each(…) AS element` alias is not a
 *  table alias, so its `.value` pools into every drizzle column named `value` and the arm's `$.type` read gets
 *  attributed to the open `settings.value` blob). Reported as a gate blind spot; this spelling is the honest
 *  one regardless of the gate. */
function armField(index: SQL, field: "type" | "name"): SQL {
  return sql`json_extract(${ACTIONS_JSON}, '$[' || ${index} || '].${sql.raw(field)}')`;
}

/** Is this element a `run_tool` arm naming a tool under `from`? Both halves, always — see difference (1). */
function matchesArm(from: string): SQL {
  return sql`${armField(sql`element.key`, "type")} = 'run_tool' and substr(${armField(sql`element.key`, "name")}, 1, ${from.length}) = ${from}`;
}

/** The LOWEST arm index still naming a legacy tool, as a scalar subquery. */
function lowestMatchingIndex(from: string): SQL {
  return sql`(select element.key from json_each(${ACTIONS_JSON}) as element where ${matchesArm(from)} order by element.key limit 1)`;
}

/** Rewrite every `run_tool` arm naming a tool under `from` to the same tool under `to`, for one rename.
 *  Returns the number of arm rewrites applied. */
async function applyOneRename(db: Db, from: string, to: string): Promise<number> {
  const path = sql`('$[' || ${lowestMatchingIndex(from)} || '].name')`;
  let applied = 0;
  for (;;) {
    const rows = await db
      .update(automationRules)
      .set({
        // ONE key-wise `json_set` at ONE path: every sibling arm, and every other field of THIS arm
        // (`argsTemplate`, `resultScope`), is untouched — the migration re-prefixes a name and nothing else.
        actions: sql`json_set(${ACTIONS_JSON}, ${path}, ${to} || substr(json_extract(${ACTIONS_JSON}, ${path}), ${from.length + 1}))`,
      })
      .where(sql`exists (select 1 from json_each(${ACTIONS_JSON}) as element where ${matchesArm(from)})`)
      .returning({ id: automationRules.id });
    if (rows.length === 0) {
      return applied;
    }
    applied += rows.length;
  }
}

/**
 * Re-prefix every `run_tool` arm that the #1391 injective mint renamed. `renames` is
 * `pluginToolWireNameRenames(...)`'s answer, handed down by the boot step; an empty array is a no-op and the
 * normal case. Returns the total number of arms rewritten; 0 on every boot after the first.
 */
export async function migratePluginToolWireNames(db: Db, renames: readonly { readonly from: string; readonly to: string }[]): Promise<number> {
  let rewritten = 0;
  for (const rename of renames) {
    rewritten += await applyOneRename(db, rename.from, rename.to);
  }
  return rewritten;
}
