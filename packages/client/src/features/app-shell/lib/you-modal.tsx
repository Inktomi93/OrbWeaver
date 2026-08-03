// The You modal as ONE co-located definition (client-architecture-lockdown.md §6d) — app-shell owns it
// (the drawer folds rail footer affordances + section overflow into one mobile sheet).

import { CircleUser } from "@orb/ui/icons";
import type { ModalDefinition } from "#state";
import { YouSheet } from "../components/you-sheet.tsx";

export const youModal: ModalDefinition = {
  id: "you",
  title: "You",
  presentation: "drawer",
  trigger: { placement: "mobile-tab", label: "You", icon: CircleUser },
  body: (): ReturnType<typeof YouSheet> => <YouSheet />,
};
