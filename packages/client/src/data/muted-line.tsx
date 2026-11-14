// The one muted line: a receded sentence with an optional ghost action, in the slot of a list inside a surface. It is
// the empty arm of a list ("No injections yet.") and the doorway to where a thing is set up ("Set up trackers in the
// Game tab."). A surface's own empty state is `EmptyState` (the three-states law), never this.
//
// - It lives beside `QueryErrorState` and `SkeletonRows`, the error and loading arms of the same slot, so the data
//   tier's own `QueryInlineStates` can draw it and every tier above reads it through `#data`.
// - The voice is `quiet`, the muted body line its voice header names for an empty-state line (owner ruling), at every
//   site, so the line reads the same in every pane.
// - `announce` is for a filter miss: focus stays in the search box, so the line is a status message a keyboard reader
//   hears. The role rides this line, never the list around it, which would announce every row on every keystroke.

import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ComponentProps, ReactElement } from "react";

interface MutedLineAction {
  readonly label: string;
  readonly onAction: () => void;
}

export interface MutedLineProps extends Omit<ComponentProps<"div">, "className" | "children" | "style" | "role"> {
  readonly children: string;
  /** A quiet next step after the sentence. */
  readonly action?: MutedLineAction | undefined;
  /** The line is a status message, for a filter miss under the search box that keeps focus. */
  readonly announce?: boolean;
}

export function MutedLine({ children, action, announce = false, ...rest }: MutedLineProps): ReactElement {
  return (
    <Row {...rest} align="baseline" data-slot="muted-line" gap="field" wrap={true} {...(announce ? { role: "status" } : {})}>
      <Text as="span" voice="quiet">
        {children}
      </Text>
      {action === undefined ? null : (
        <Button onClick={action.onAction} size="sm" type="button" variant="ghost">
          {action.label}
        </Button>
      )}
    </Row>
  );
}
