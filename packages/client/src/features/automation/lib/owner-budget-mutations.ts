// C5 — the OWNER-GLOBAL rate-ceiling write. Its own file rather than a row in `rule-mutations.ts` because
// it is a different PLANE: those five verbs act on a rule and address a rule list, this one acts on the
// author's own budget row and addresses the budget read. Homing it beside them would put "which list does a
// rule write repaint" and "the owner's ceiling" under one header that could only be true of half of it.
//
// NO OPTIMISTIC PATCH, deliberately. This is a SAFETY BELT: showing a new ceiling before the server has it
// would mean the surface briefly claims a bound that is not yet enforced, and a belt that reads as tighter
// than it is is worse than one that repaints a beat late.

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

export const useSetOwnerBudgets = createEntityMutation<inferInput<Trpc["automation"]["setOwnerBudgets"]>, inferOutput<Trpc["automation"]["setOwnerBudgets"]>>({
  options: (trpc) => trpc.automation.setOwnerBudgets.mutationOptions(),
  invalidates: (trpc) => [trpc.automation.getOwnerBudgets.queryFilter()],
  errorToast: "Couldn't save that limit.",
});
