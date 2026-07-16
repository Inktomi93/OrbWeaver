// The Account modal as ONE co-located definition (client-architecture-lockdown.md §6d). Reached from
// INSIDE the persona identity widget's Account strip (shell-chrome-unification.md §B: You ⊃ Identity ⊃
// Account), so it rides the `content` placement — "my trigger lives inside a feature surface" — never a
// derived rail/topbar affordance (the `avatar` pseudo-placement was retired at §E-5).

import { CircleUser } from "@orb/ui/icons";
import type { ModalDefinition } from "#state";
import { AccountSurface } from "../surfaces/account-surface";

export const accountModal: ModalDefinition = {
  id: "account",
  title: "Account",
  trigger: { placement: "content", label: "Account", icon: CircleUser },
  body: (): ReturnType<typeof AccountSurface> => <AccountSurface />,
};
