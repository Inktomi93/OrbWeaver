import { CtIsolation } from "@orb/testkit/browser";
import { ListRow } from "@orb/ui/list-row";
import type { ReactElement } from "react";

export function FullTitleStory(): ReactElement {
  return (
    <CtIsolation subject="ListRow fullTitle" isolates="The unabbreviated title shows in a tooltip on the title and is announced as the row's description">
      <ListRow clickable={true} fullTitle="Main system instruction" title="Main" />
    </CtIsolation>
  );
}

export function RowTintStory(): ReactElement {
  return (
    <CtIsolation subject="ListRow rowTint" isolates="Which box carries the selection rail when the row, not the body, wears the tint">
      <ListRow actions={<span>actions</span>} rowTint="row" selected={false} title="At rest" />
      <ListRow actions={<span>actions</span>} rowTint="row" selected={true} title="Selected" />
      <ListRow selected={true} title="Body tint" />
    </CtIsolation>
  );
}
