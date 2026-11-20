// The canon reads take only the visibility object chat's resolver handed out. A spread copy keeps the phantom brand key,
// so the type cannot tell it from the resolved answer; object identity can, and a frozen answer cannot be edited in place.
// ASSUMES(single-replica): the set is keyed by object identity and never leaves this process.

import type { ViewerVisibility } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { ChatNotFoundError } from "../contract/errors.ts";

const resolved = new WeakSet<object>();

/** Mint the answer for a viewer whose present participant row in `answer.chatId` was just loaded. Only
 *  `resolveViewerVisibility` calls this: `no-restricted-imports` refuses the import elsewhere through the
 *  `SERVER_IMPORT_HOMES` table in `tooling/src/eslint/security-policy.ts`, and policy `viewer-visibility-registry-importers`
 *  names every importer of this module. */
export function mintViewerVisibility(answer: Pick<ViewerVisibility, "chatId" | "role" | "historyFloorSeq" | "readsHidden">): ViewerVisibility {
  const minted = Object.freeze({ ...answer }) as ViewerVisibility;
  resolved.add(minted);
  return minted;
}

/** Refuse any visibility the resolver did not hand out for `chatId`, before a read uses its floor or its hidden-content
 *  verdict. A function that takes an answer as a parameter runs this first; `orb/viewer-visibility-parameter-checked`
 *  refuses one that does not.
 *  @throws {@link ChatNotFoundError} for an answer resolved for another chat: it proves no membership in `chatId`, and a
 *  non-member's answer for a room is not-found (Spine-Identity-and-Auth §2). */
export function assertResolvedVisibility(visibility: ViewerVisibility, chatId: ChatId): void {
  if (!resolved.has(visibility)) {
    throw new Error("canon read: this visibility is not an answer chat's resolver handed out");
  }
  // The answer is frozen and identity-checked above, so its chat id is the one the resolver stamped.
  if (visibility.chatId !== chatId) {
    throw new ChatNotFoundError(chatId);
  }
}
