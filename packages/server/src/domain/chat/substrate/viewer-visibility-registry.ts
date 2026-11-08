// The canon reads take only the visibility object chat's resolver handed out. A spread copy keeps the phantom brand key,
// so the type cannot tell it from the resolved answer; object identity can, and a frozen answer cannot be edited in place.
// ASSUMES(single-replica): the set is keyed by object identity and never leaves this process.

import type { ViewerVisibility } from "@orb/contracts/chat";

const resolved = new WeakSet<object>();

/** Mint the answer for a viewer whose present participant row was just loaded. Only `resolveViewerVisibility` calls this
 *  (an ESLint import restriction in `eslint.config.ts` names it). */
export function mintViewerVisibility(answer: Pick<ViewerVisibility, "role" | "historyFloorSeq" | "readsHidden">): ViewerVisibility {
  const minted = Object.freeze({ ...answer }) as ViewerVisibility;
  resolved.add(minted);
  return minted;
}

/** Refuse any visibility the resolver did not hand out, before a read uses its floor or its hidden-content verdict. */
export function assertResolvedVisibility(visibility: ViewerVisibility): void {
  if (!resolved.has(visibility)) {
    throw new Error("canon read: this visibility is not an answer chat's resolver handed out");
  }
}
