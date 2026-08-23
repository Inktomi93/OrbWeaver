// The chats pane's ZERO-RESULT action slot (#541). Extracted from `surfaces/chat-list-surface.tsx` for the
// same reason the faces strip + scope chip were (`chat-list-character-filter.tsx`, the 450-line cap): the
// surface composes, it does not also hold the narrowing vocabulary. The exits themselves are derived by
// `lib/chat-list-scope.ts` (pure), which is where the WHY is recorded.

import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import type { FilterExit } from "../lib/chat-list-scope.ts";

/** One secondary button per ACTIVE narrowing axis. Wraps, because three exits do not fit the rail pane's
 *  290px column on one line. */
export function FilterExits({ exits }: { readonly exits: readonly FilterExit[] }): ReactElement {
  return (
    <Row align="center" className="flex-wrap justify-center" gap="field">
      {exits.map((exit) => (
        <Button intent="secondary" key={exit.key} onClick={exit.onClear} size="sm">
          {exit.label}
        </Button>
      ))}
    </Row>
  );
}
