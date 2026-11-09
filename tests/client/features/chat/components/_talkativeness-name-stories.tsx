import { CtIsolation } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { TalkativenessPopover } from "#client/features/chat/components/talkativeness-popover.tsx";
import type { MemberCharacterRow } from "#client/features/chat/lib/member-rows.ts";

/** The chip and its open popover for one character seat. */
export function TalkativenessNameStory({ row, open }: { readonly row: MemberCharacterRow; readonly open: boolean }): ReactElement {
  return (
    <CtIsolation subject="TalkativenessPopover" isolates="The chip's and popover's accessible names need no application data.">
      <TalkativenessPopover onOpenChange={(): void => undefined} onSetTalkativeness={(): void => undefined} open={open} row={row} />
    </CtIsolation>
  );
}
