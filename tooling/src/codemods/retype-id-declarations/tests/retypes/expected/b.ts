// A file with no import keeps its header comment on top.

import type { UserId } from "@orb/kit/ids";

/** The doc comment stays with its declaration. */
export function keyOf(userId: UserId | null): string {
  return userId ?? "";
}
