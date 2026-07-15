// The Account modal as ONE co-located definition (client-architecture-lockdown.md §6d).

import { CircleUser } from "@orb/ui/icons";
import type { ModalDefinition } from "#state";
import { AccountSurface } from "../surfaces/account-surface";

export const accountModal: ModalDefinition = {
  id: "account",
  title: "Account",
  trigger: { placement: "avatar", label: "Account", icon: CircleUser },
  body: (): ReturnType<typeof AccountSurface> => <AccountSurface />,
};
