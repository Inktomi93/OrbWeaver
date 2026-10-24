import { CtIsolation } from "@orb/testkit/browser";
import { ListRow } from "@orb/ui/list-row";
import type { ReactElement } from "react";

export function RowTintStory(): ReactElement {
  return (
    <CtIsolation subject="ListRow rowTint" isolates="Which box carries the selection rail when the row, not the body, wears the tint">
      <ListRow actions={<span>actions</span>} rowTint="row" selected={false} title="At rest" />
      <ListRow actions={<span>actions</span>} rowTint="row" selected={true} title="Selected" />
      <ListRow selected={true} title="Body tint" />
    </CtIsolation>
  );
}
