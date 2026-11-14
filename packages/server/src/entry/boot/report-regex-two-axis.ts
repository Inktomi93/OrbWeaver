// Names, in the boot log, every regex script migration 0020 moved off the save pass or narrowed, with what it can
// no longer reach. It exists only because that rewrite is one-time and the owner was promised each changed script
// by name; once 0020 is applied nothing is pending and it logs nothing. Delete it with
// `readRegexTwoAxisChanges` when no database older than 0020 can still boot. Not a pattern for other migrations.
//
// A script's name is library metadata, not roleplay text, so it is logged, capped; its find and replace text never is.

import type { Db, RegexTwoAxisChangedScript } from "@orb/db";
import { REGEX_TWO_AXIS_MIGRATION, readRegexTwoAxisChanges, regexScripts } from "@orb/db";
import type { RegexPass, RegexTarget } from "@orb/kit/regex";
import { REGEX_TARGETS, regexPassReadsTarget } from "@orb/kit/regex";
import { inArray } from "drizzle-orm";
import type { Logger } from "#foundation/observability";

/** The longest script name a boot line carries. */
export const LOGGED_SCRIPT_NAME_MAX = 120;

const LEGACY_DISPLAY = "DISPLAY";
const LEGACY_PROMPT_HISTORY = "PROMPT_HISTORY";

type Reach = `${RegexPass}:${RegexTarget}`;

function isTarget(member: string): member is RegexTarget {
  return (REGEX_TARGETS as readonly string[]).includes(member);
}

// What a placement-set row reached as it ran before 0020: a row with neither old member ran on the save pass over its
// targets whatever its flags said, an editor-written row ran each member's own pass.
function reachBefore(script: RegexTwoAxisChangedScript): Set<Reach> {
  const targets = script.placement.filter(isTarget);
  const native = script.placement.includes(LEGACY_DISPLAY) || script.placement.includes(LEGACY_PROMPT_HISTORY);
  const reach = new Set<Reach>(targets.filter((target) => !native || target !== "WORLD_INFO").map((target): Reach => `save:${target}`));
  if (native && targets.includes("WORLD_INFO")) {
    reach.add("prompt:WORLD_INFO");
  }
  if (script.placement.includes(LEGACY_DISPLAY)) {
    for (const target of ["USER_INPUT", "AI_OUTPUT", "REASONING"] as const) {
      reach.add(`display:${target}`);
    }
  }
  if (script.placement.includes(LEGACY_PROMPT_HISTORY)) {
    reach.add("prompt:USER_INPUT");
    reach.add("prompt:AI_OUTPUT");
  }
  return reach;
}

function reachAfter(targets: readonly RegexTarget[], passes: readonly RegexPass[]): Set<Reach> {
  return new Set(passes.flatMap((pass) => targets.filter((target) => regexPassReadsTarget(pass, target)).map((target): Reach => `${pass}:${target}`)));
}

/** The changed scripts to report, read before migrating; empty unless 0020 is among `pending`. */
export async function readRegexTwoAxisReport(db: Db, pending: readonly string[]): Promise<RegexTwoAxisChangedScript[]> {
  return pending.includes(REGEX_TWO_AXIS_MIGRATION) ? await readRegexTwoAxisChanges(db) : [];
}

/** After migrating: one warn line per changed script, then one summary line. */
export async function logRegexTwoAxisReport(log: Logger, db: Db, changed: readonly RegexTwoAxisChangedScript[]): Promise<void> {
  if (changed.length === 0) {
    return;
  }
  const rows = await db
    .select({ id: regexScripts.id, behavior: regexScripts.behavior })
    .from(regexScripts)
    .where(
      inArray(
        regexScripts.id,
        changed.map((script) => script.id),
      ),
    );
  const after = new Map(rows.map((row) => [row.id, row.behavior]));
  for (const script of changed) {
    const behavior = after.get(script.id);
    const targets = behavior?.targets ?? [];
    const passes = behavior?.passes ?? [];
    const kept = reachAfter(targets, passes);
    log.warn(
      {
        scriptId: script.id,
        name: script.name.slice(0, LOGGED_SCRIPT_NAME_MAX),
        change: script.change,
        after: { targets, passes },
        dropped: [...reachBefore(script)].filter((reach) => !kept.has(reach)),
      },
      "boot/migrate: regex script rewritten onto targets and passes",
    );
  }
  const moved = changed.filter((script) => script.change === "moved").length;
  log.info({ moved, narrowed: changed.length - moved }, "boot/migrate: regex scripts rewritten onto targets and passes");
}
