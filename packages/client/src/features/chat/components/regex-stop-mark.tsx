// The mark and the reason a stopped regex script wears on every row of the Regex section that lists it: its tier row and its
// On screen roster row, so a script stopped on a pass that never reaches the roster still has a row to read it on.

import { InlineToken } from "@orb/ui/inline-token";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { StoppedDisplayScript } from "#lib";
import { REGEX_BROWSER_STOPPED_MARK, REGEX_BROWSER_STOPPED_REASON, REGEX_NOT_APPLIED_MARK, regexNotAppliedReason } from "../lib/regex-stop-copy.ts";

// A browser stop and a server one read differently because the next step differs: a browser stop lifts at a
// reload, which does not fix it, and a server one holds until the pattern is fixed.
export function RegexStopMark({ stop }: { readonly stop: StoppedDisplayScript }): ReactElement {
  const mark = stop.side === "browser" ? REGEX_BROWSER_STOPPED_MARK : REGEX_NOT_APPLIED_MARK;
  return <InlineToken tone="warning">{mark}</InlineToken>;
}

/** Under the row: why the script stopped and what to do about it, in full. */
export function RegexStopReason({ stop }: { readonly stop: StoppedDisplayScript }): ReactElement {
  return (
    <Text data-slot="regex-stop-reason" tone="warning" voice="gloss">
      {stop.side === "browser" ? REGEX_BROWSER_STOPPED_REASON : regexNotAppliedReason(stop.cause, stop.pass)}
    </Text>
  );
}
