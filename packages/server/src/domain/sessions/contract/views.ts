// domain/sessions — read-model views. SessionView's canonical home is @orb/contracts/session, re-exported
// type-only so domain callers name it through the feature's contract surface. ViewerView is the canonical
// "who am I" read, projected from the request Principal at the transport seam — not a persistence read.

import type { UserRole } from "@orb/contracts/identity";
import type { Handle, UserId } from "@orb/kit/ids";

export type { SessionView } from "@orb/contracts/session";

/** The canonical viewer identity, projected from the request Principal. A stale client globalRole is a UI
 *  hint only — server authz always re-reads the live row. */
export interface ViewerView {
  readonly userId: UserId;
  readonly handle: Handle;
  readonly globalRole: UserRole;
}
