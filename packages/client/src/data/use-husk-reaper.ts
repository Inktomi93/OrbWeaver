// `useHuskReaper` — the nav-away arm of husk GC (D166).
//
// A chat row exists from the creation click, so leaving a room you just made and never used leaves an
// unclaimed HUSK behind. The client tells the server about it on the way out; the server decides. Mounted
// ONCE at the app root, beside the other always-on drivers, so no feature unmount can drop it.
//
// IT IS BEST-EFFORT AND IT IS NOT A GUARANTEE. The belt is the 24h TTL sweep. This arm exists only to keep
// the common case tidy (most husks die within seconds of abandonment), and it obeys three rules:
//   · it NEVER blocks navigation — the store has already moved on by the time the listener runs;
//   · it NEVER surfaces an error — offline, a race with a claim, a reap of a room that turned out to be
//     real: all are non-events for the user, so the mutation declares `errorToast: false` and the promise is
//     swallowed. A toast here would report a failure the user cannot act on and did not ask for;
//   · it NEVER asserts husk-ness — `reapHusk` re-checks `started_at IS NULL` server-side and no-ops
//     otherwise, so a wrong guess costs one cheap round-trip and changes nothing.
//
// The subscription is the store's own fire-and-forget publication (`subscribeHuskAbandoned`), which keeps
// `#state` tRPC-free — the `subscribeUserMessageCommitted` precedent (state/chat-stream.ts).

import type { inferInput } from "@trpc/tanstack-react-query";
import { useEffect } from "react";
import { subscribeHuskAbandoned } from "#state";
import { createEntityMutation } from "./create-entity-mutation.ts";
import type { Trpc } from "./trpc.ts";
import { useTRPC } from "./trpc.ts";
import { useInvalidation } from "./use-invalidation.ts";

// `busDriven` because a reap that DOES land fans `chatDeleted`, which the list + the active-chat pointer already react to.
const useReapHuskMutation = createEntityMutation<inferInput<Trpc["chat"]["reapHusk"]>, unknown>({
  options: (trpc) => trpc.chat.reapHusk.mutationOptions(),
  busDriven: true,
  // Silent: no person started this reap, and a failed one is a non-event (see the header).
  errorToast: false,
});

/** Mount once at the app root: fires `chat.reapHusk` when a created-but-unused room is navigated away from. */
export function useHuskReaper(): void {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const reap = useReapHuskMutation({ trpc, invalidation });
  // The mutation object is re-created per render; the subscription must not churn with it, so the effect
  // holds the LATEST fire through a stable indirection rather than re-subscribing every commit.
  const fire = reap.mutate;
  useEffect(
    () =>
      subscribeHuskAbandoned((chatId) => {
        // Fire-and-forget: `mutate` (never `mutateAsync`) so nothing here can reject into the caller's
        // navigation, and no callback so nothing can surface.
        fire({ chatId });
      }),
    [fire],
  );
}
