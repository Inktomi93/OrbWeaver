// The row menu's Duplicate door. A copy made while a turn is generating would land inside that turn's output,
// so the item is disabled with its reason during a live turn; the verb refuses the same call at the server.

import type { MessageView } from "@orb/contracts/chat";
import { CopyPlus } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { DescribedMenuItem } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { isLiveTurnPhase, useTurnPhase } from "#state";
import { useDuplicateMutation } from "../hooks/use-message-mutations.ts";
import { MESSAGE_DUPLICATE_GENERATING, MESSAGE_DUPLICATE_NAME } from "../lib/message-action-names.ts";

export function MessageDuplicateItem({ message }: { readonly message: MessageView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const duplicate = useDuplicateMutation({ trpc, invalidation });
  const liveTurn = isLiveTurnPhase(useTurnPhase(message.chatId));
  const onDuplicate = (): void => {
    if (duplicate.isPending || liveTurn) {
      return;
    }
    duplicate.mutate({ chatId: message.chatId, messageId: message.id });
  };
  return (
    <DescribedMenuItem
      detail={liveTurn ? MESSAGE_DUPLICATE_GENERATING : undefined}
      disabled={liveTurn}
      icon={CopyPlus}
      label={MESSAGE_DUPLICATE_NAME}
      onClick={onDuplicate}
    />
  );
}
