import { CtIsolation } from "@orb/testkit/browser";
import type { ListRowProps } from "@orb/ui/list-row";
import { ListRow } from "@orb/ui/list-row";
import type { ReactElement } from "react";

/** One clickable production row with the caller's title, qualifier, subtitle and meta. */
export function AccessibleNameRowStory(props: Pick<ListRowProps, "meta" | "subtitle" | "title" | "titleQualifier">): ReactElement {
  return (
    <CtIsolation subject="ListRow accessible name" isolates="The row's name and description wiring on the native button">
      <ListRow clickable={true} {...props} />
    </CtIsolation>
  );
}
