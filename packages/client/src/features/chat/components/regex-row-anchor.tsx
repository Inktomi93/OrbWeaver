// The frame of one script's row in the room's Regex section, tier row and On screen roster row alike. It holds the two
// facts the rest of the app reads off a row:
//
//   - A REQUEST TO LAND ON THE ROW (`regex-row-request-store.ts`, made by the stopped-script notice's Show this script) is
//     taken here once: the row scrolls to the middle of its pane and takes focus. A script on both the roster and a tier
//     draws two rows, and the roster's takes the request (`lands`), so one script never moves focus twice.
//   - THE ROW IS IN VIEW, so a stop on its script reads inline and raises no notice beside it (`showStopRow`). A row in a
//     collapsed pane or below an open pane's fold is mounted and not in view, and its stop still raises its notice.

import type { RegexScriptRow } from "@orb/contracts/regex";
import { Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { showStopRow } from "#lib";
import { clearRegexRowRequest, useRequestedRegexRow } from "#state";

/** How much of the row must be in view for its stop to read inline: the row's reason sits under its name. */
const ROW_IN_VIEW_RATIO = 0.5;

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
  // Shown means a reader can see it: the pane stays mounted while it is collapsed, and a row can sit below the fold of an open one.
  useEffect(() => {
    const target = node.current;
    if (target === null) {
      return;
    }
    let release: (() => void) | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        release?.();
        release = entries.at(-1)?.isIntersecting === true ? showStopRow({ id, findRegex }) : undefined;
      },
      { threshold: ROW_IN_VIEW_RATIO },
    );
    observer.observe(target);
    return (): void => {
      observer.disconnect();
      release?.();
    };
  }, [id, findRegex]);
  return (
    <Stack data-slot="regex-row-anchor" focusTarget={true} ref={node} tabIndex={-1}>
      {children}
    </Stack>
  );
}
