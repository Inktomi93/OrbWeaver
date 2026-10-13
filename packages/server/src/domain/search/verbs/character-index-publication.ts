// Card writes invalidate the owner's lexical index before publishing the original user event.

import type { EmitUserEvent } from "@orb/contracts/user-bus";
import { evictFieldIndex } from "../substrate/field-index.ts";

export function createCharacterIndexPublication(publish: EmitUserEvent): EmitUserEvent {
  return (userId, event): void => {
    if (event.type === "charactersChanged") {
      evictFieldIndex(userId);
    }
    publish(userId, event);
  };
}
