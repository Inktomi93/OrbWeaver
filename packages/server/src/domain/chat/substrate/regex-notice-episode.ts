// The turn-scoped record of host regex scripts a server pass did not apply (D53), drained by the engine or the edit
// verb into host-only warnings. A history pass reports a spent budget once per row and a round runs its passes once
// per speaker; the room is told once per script and cause.
// SECURITY: any member's turn runs the host's passes, and each warning is a durable row kept for the room's life, so
// a take names at most `REGEX_NOT_APPLIED_NAMED_MAX` and folds the rest into one count. Past the cap a note costs a
// key and a counter, never a notice object.

import { REGEX_NOT_APPLIED_NAMED_MAX, REGEX_NOT_APPLIED_OVERFLOW_CODE, REGEX_SCRIPT_NOT_APPLIED_CODE } from "@orb/contracts/chat";
import type { RegexScriptInput } from "@orb/kit/regex";
import { regexNotAppliedCause } from "#primitives/regex";
import type { RegexNotice, RegexNoticeEpisode } from "../contract/results.ts";

export function createRegexNoticeEpisode(): RegexNoticeEpisode {
  // Kept past the cap too, so the overflow count is of distinct scripts and causes, not of reports.
  const seen = new Set<string>();
  let named = 0;
  let pending: RegexNotice[] = [];
  let unnamed = 0;
  return {
    note: (pass, err, script: RegexScriptInput, scripts): void => {
      // The pass hands the executor these very rows, so the failing script is one of them by identity.
      const row = scripts.find((candidate) => candidate === script);
      if (row === undefined) {
        return;
      }
      const cause = regexNotAppliedCause(err);
      const key = `${row.id}\u0000${cause}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      if (named < REGEX_NOT_APPLIED_NAMED_MAX) {
        named += 1;
        pending.push({ code: REGEX_SCRIPT_NOT_APPLIED_CODE, scriptId: row.id, cause, pass });
      } else {
        unnamed += 1;
      }
    },
    take: (): readonly RegexNotice[] => {
      const taken: RegexNotice[] = unnamed > 0 ? [...pending, { code: REGEX_NOT_APPLIED_OVERFLOW_CODE, count: unnamed }] : pending;
      pending = [];
      unnamed = 0;
      return taken;
    },
  };
}
