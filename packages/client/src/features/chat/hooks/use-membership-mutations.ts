import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** `invites.kick` vars — host removes a present HUMAN member (their authored rows remain; canon is history). */

export const useKickMember = createEntityMutation<inferInput<Trpc["invites"]["kick"]>, unknown>({
  options: (trpc) => trpc.invites.kick.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't remove that member.",
});

/** `invites.selfLeave` vars — leave your own membership (a sole-host leave archives the room server-side). */

export const useSelfLeave = createEntityMutation<inferInput<Trpc["invites"]["selfLeave"]>, unknown>({
  options: (trpc) => trpc.invites.selfLeave.mutationOptions(),
  // The leaver's own chat list drops the room and no delivered bus event covers it (header audit).
  invalidates: (trpc) => [trpc.chat.listChats.pathFilter()],
  errorToast: "Couldn't leave the chat.",
});

/** `invites.setMemberHistoryVisibility` vars — host sets how much room canon one HUMAN member may read
 *  (D16 `joinHistoryVisibility`: `full` = the whole canon, the default; `from-join` = only from their own
 *  join point). Never moves their join point — it changes what they may read from it. */

export const useSetMemberHistoryVisibility = createEntityMutation<inferInput<Trpc["invites"]["setMemberHistoryVisibility"]>, unknown>({
  options: (trpc) => trpc.invites.setMemberHistoryVisibility.mutationOptions(),
  // Bus-driven: the verb emits `chatUpdated` on the OPEN chat → `chatReads` (getChat, which carries the
  // roster's `joinHistoryVisibility`, AND listMessages, which the TARGET member's clamp just moved). Both the
  // setting host and the affected member are subscribed, so no mutation-side filter and no new bus row.
  busDriven: true,
  errorToast: "Couldn't change what that member can read.",
});

/** `invites.nominateHostHandoff` vars — host nominates a present member as the new host (step 1 of two).
 *  `offer` is the departing host's OPT-IN point-in-time property gift (the confirm step's checkbox), stored
 *  with the nomination and executed only if the nominee ACCEPTS. Omitted / all-false = give nothing = the
 *  built D64 behavior. */

export const useNominateHostHandoff = createEntityMutation<inferInput<Trpc["invites"]["nominateHostHandoff"]>, unknown>({
  options: (trpc) => trpc.invites.nominateHostHandoff.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't nominate that member as host.",
});
