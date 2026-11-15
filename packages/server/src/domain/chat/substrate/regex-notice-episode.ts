// The turn-scoped record of host regex scripts a server pass did not apply (D53), drained by the engine or the edit
// verb into host-only `regex_script_not_applied` warnings. A history pass reports a spent budget once per row and a
// round runs its passes once per speaker; the room is told once per script and cause.

import type { RegexScriptInput } from "@orb/kit/regex";
import { regexNotAppliedCause } from "#primitives/regex";
import type { RegexNotice, RegexNoticeEpisode } from "../contract/results.ts";

export function createRegexNoticeEpisode(): RegexNoticeEpisode {
  const seen = new Set<string>();
  let pending: RegexNotice[] = [];
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
      pending.push({ scriptId: row.id, cause, pass });
    },
    take: (): readonly RegexNotice[] => {
      const taken = pending;
      pending = [];
      return taken;
    },
  };
}
