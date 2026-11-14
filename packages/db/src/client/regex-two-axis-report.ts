// The scripts migration 0020 rewrites off the save pass or narrows, read before it runs so boot can name them.
// It exists only because that rewrite is one-time and the owner was promised every changed script by name; once
// 0020 is applied it selects nothing (no stored behavior keeps a `placement` list), and it goes when no database
// that predates 0020 can still boot. Not a pattern: a migration reports nothing at boot by default.

import type { RegexScriptId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { parseStringArrayColumn } from "../query/parsers.ts";
import type { Db } from "./index.ts";

/** The migration whose rewrite {@link readRegexTwoAxisChanges} reports. */
export const REGEX_TWO_AXIS_MIGRATION = "0020_regex-two-axis";

/** `moved`: a flagged row leaves the save pass. `narrowed`: an editor-written row loses some reach. */
export type RegexTwoAxisChange = "moved" | "narrowed";

/** One script the rewrite changes, with the placement-set shape it held before. */
export interface RegexTwoAxisChangedScript {
  readonly id: RegexScriptId;
  readonly name: string;
  readonly change: RegexTwoAxisChange;
  readonly placement: readonly string[];
  readonly markdownOnly: boolean;
  readonly promptOnly: boolean;
}

interface ChangedRow {
  readonly id: RegexScriptId;
  readonly name: string;
  readonly change: RegexTwoAxisChange;
  readonly placement: string;
  readonly markdownOnly: number;
  readonly promptOnly: number;
}

/**
 * The rows 0020 moves or narrows, by the rule its header states: a row with no `DISPLAY` or `PROMPT_HISTORY`
 * member and a set flag moves off the save pass; an editor-written row narrows when a save member stands beside
 * an ephemeral one (the save reading wins), or when `DISPLAY` stands beside `PROMPT_HISTORY` or `WORLD_INFO`
 * with no save member (no target widens). Read-only; run it before migrating. A fresh database, whose chain has
 * not made the table yet, has nothing to report.
 */
export async function readRegexTwoAxisChanges(db: Db): Promise<RegexTwoAxisChangedScript[]> {
  const table = await db.all(sql`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'regex_scripts'`);
  if (table.length === 0) {
    return [];
  }
  const rows = await db.all<ChangedRow>(sql`
    SELECT id, name, change, placement, markdownOnly, promptOnly FROM (
      SELECT id, name, json_extract(behavior, '$.placement') AS placement,
        coalesce(json_extract(behavior, '$.markdownOnly'), 0) AS markdownOnly,
        coalesce(json_extract(behavior, '$.promptOnly'), 0) AS promptOnly,
        EXISTS (SELECT 1 FROM json_each(behavior, '$.placement') WHERE value IN ('DISPLAY', 'PROMPT_HISTORY')) AS native,
        EXISTS (SELECT 1 FROM json_each(behavior, '$.placement') WHERE value IN ('USER_INPUT', 'AI_OUTPUT', 'REASONING')) AS saves,
        EXISTS (SELECT 1 FROM json_each(behavior, '$.placement') WHERE value = 'DISPLAY') AS display,
        EXISTS (SELECT 1 FROM json_each(behavior, '$.placement') WHERE value IN ('PROMPT_HISTORY', 'WORLD_INFO')) AS promptSide,
        CASE WHEN EXISTS (SELECT 1 FROM json_each(behavior, '$.placement') WHERE value IN ('DISPLAY', 'PROMPT_HISTORY')) THEN 'narrowed' ELSE 'moved' END AS change
      FROM regex_scripts
      WHERE json_type(behavior, '$.placement') = 'array' AND json_type(behavior, '$.targets') IS NULL
    )
    WHERE (NOT native AND (markdownOnly = 1 OR promptOnly = 1))
       OR (native AND saves)
       OR (native AND NOT saves AND display AND promptSide)
    ORDER BY name, id
  `);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    change: row.change,
    placement: parseStringArrayColumn(JSON.parse(row.placement)) ?? [],
    markdownOnly: row.markdownOnly === 1,
    promptOnly: row.promptOnly === 1,
  }));
}
