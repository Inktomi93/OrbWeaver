// `useReattributePersona`: the one client door to `chat.reattributePersona`. The persona panel, the game tab's
// resync and the message menu all restamp, and a feature may never import another feature, so it lives here.
// Bus-driven: the verb emits one `messageEdited` per restamped slot, which the open room's reads cover.

import type { inferInput } from "@trpc/tanstack-react-query";
import { createEntityMutation } from "./create-entity-mutation.ts";
import type { Trpc } from "./trpc.ts";

/** Vars derive from the wire, so a change to the server-owned `scope` union breaks every caller at compile time. */
export const useReattributePersona = createEntityMutation<inferInput<Trpc["chat"]["reattributePersona"]>, unknown>({
  options: (trpc) => trpc.chat.reattributePersona.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't restamp your messages.",
});
