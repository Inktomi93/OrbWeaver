// The frame of one script's row in the room's Regex section, tier row and On screen roster row alike. It holds the two
// facts the rest of the app reads off a row:
//
//   - A REQUEST TO LAND ON THE ROW (`regex-row-request-store.ts`, made by the stopped-script notice's Show this script) is
//     taken here once: the row scrolls to the middle of its pane and takes focus. A script on both the roster and a tier
//     draws two rows, and the roster's takes the request (`lands`), so one script never moves focus twice.
//   - THE ROW IS ON SCREEN, so a stop on its script reads inline and raises no notice beside it (`showStopRow`).

import type { RegexScriptRow } from "@orb/contracts/regex";
import { Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { showStopRow } from "#lib";
import { clearRegexRowRequest, useRequestedRegexRow } from "#state";

export function RegexRowAnchor({
  script,
  lands,
  children,
}: {
  readonly script: Pick<RegexScriptRow, "id" | "findRegex">;
  /** Whether this row takes a request for its script: false on a tier row whose script the roster also draws. */
  readonly lands: boolean;
  readonly children: ReactNode;
}): ReactElement {
  const { id, findRegex } = script;
  const node = useRef<HTMLDivElement>(null);
  const requested = useRequestedRegexRow() === id && lands;
  useEffect(() => {
    if (!requested) {
      return;
    }
    node.current?.scrollIntoView({ block: "center" });
    node.current?.focus({ preventScroll: true });
    clearRegexRowRequest();
  }, [requested]);
  useEffect(() => showStopRow({ id, findRegex }), [id, findRegex]);
  return (
    <Stack data-slot="regex-row-anchor" focusTarget={true} ref={node} tabIndex={-1}>
      {children}
    </Stack>
  );
}
