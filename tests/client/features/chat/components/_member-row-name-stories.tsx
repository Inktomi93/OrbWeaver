import { CtIsolation } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { MemberRow } from "#client/features/chat/components/member-row.tsx";
import type { MemberCharacterRow, MemberPersonRow } from "#client/features/chat/lib/member-rows.ts";

/** One Members row with no actions, so the row body is the only named control. */
export function MemberRowNameStory({ row }: { readonly row: MemberCharacterRow | MemberPersonRow }): ReactElement {
  return (
    <CtIsolation subject="MemberRow" isolates="The row body's accessible name against its visible text needs no application data.">
      <MemberRow onRowFocus={(): void => undefined} registerRef={(): void => undefined} removalFinalFocus={(): boolean => false} row={row} tabIndex={0} />
    </CtIsolation>
  );
}
