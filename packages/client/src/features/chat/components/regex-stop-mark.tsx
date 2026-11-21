// The mark and the reason a stopped regex script wears on every row of the Regex section that lists it: its tier row and its
// On screen roster row, so a script stopped on a pass that never reaches the roster still has a row to read it on.
// The mark leads the reason under the row, never the title line: beside the name it takes the width a phone row needs to
// show the name whole.

import { InlineToken } from "@orb/ui/inline-token";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { StoppedDisplayScript } from "#lib";
import { REGEX_BROWSER_STOPPED_MARK, REGEX_BROWSER_STOPPED_REASON, REGEX_NOT_APPLIED_MARK, regexNotAppliedReason } from "../lib/regex-stop-copy.ts";

// A browser stop and a server one read differently because the next step differs: a browser stop lifts at a
// reload, which does not fix it, and a server one holds until the pattern is fixed.
/** Under the row: the stop's mark, then why the script stopped and what to do about it, in full. */
export function RegexStopReason({ stop }: { readonly stop: StoppedDisplayScript }): ReactElement {
  const mark = stop.side === "browser" ? REGEX_BROWSER_STOPPED_MARK : REGEX_NOT_APPLIED_MARK;
  const reason = stop.side === "browser" ? REGEX_BROWSER_STOPPED_REASON : regexNotAppliedReason(stop.cause, stop.pass);
  return (
    <Text data-slot="regex-stop-reason" voice="gloss">
      <InlineToken leads={true} tone="warning">
        {mark}
      </InlineToken>
      <Text as="span" tone="warning" voice="gloss">
        {reason}
      </Text>
    </Text>
  );
}
