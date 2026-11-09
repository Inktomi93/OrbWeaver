import type { CharacterId, ChatId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { AddMemberPopover } from "#client/features/chat/components/add-member-popover.tsx";

/** The production Add a character popover, with the characters already in the roster left out of its list. */
export function AddMemberPopoverStory({
  chatId,
  existingCharacterIds,
}: {
  readonly chatId: ChatId;
  readonly existingCharacterIds: readonly CharacterId[];
}): ReactElement {
  return (
    <CtClientProviders>
      <AddMemberPopover chatId={chatId} existingCharacterIds={existingCharacterIds} />
    </CtClientProviders>
  );
}
