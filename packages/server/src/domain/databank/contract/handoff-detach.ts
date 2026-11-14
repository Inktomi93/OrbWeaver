// domain/databank/contract/handoff-detach — the op type for the databank-owned statement the host-handoff swap
// commits (D64, D337). A handoff copies no documents, so every chat document the incoming host does not own leaves
// the room with the role swap.

import type { StatementToken } from "@orb/db/wiring";
import type { ChatId, UserId } from "@orb/kit/ids";

/** The UNEXECUTED `chat_documents` delete of every document on `chatId` that `hostUserId`, the incoming host, does
 *  not own. The owner test runs inside the statement, so it judges the junction as the swap batch finds it. */
export type DetachHandoffDocuments = (args: { readonly chatId: ChatId; readonly hostUserId: UserId }) => StatementToken;
