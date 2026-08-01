// The Admin settings pane (client-architecture-lockdown.md §8) — a PURE SKIMMER since SET-SEAMS stage 3:
// `body: { kind: "sections" }`, no own surface and no own `subcategories`. The four groups it used to render
// inside one pane surface are self-owned settings-SECTION CONTRIBUTIONS in this same feature now (§6,
// reader-owns — user-admin owns the admin verbs): users · engines · model catalog · card embeddings, joining
// the AppSettings admin-tier sections that were already contributions (memory tuning, rate limits, system
// tuning). The settings host renders the `admin`-anchored contributions and DERIVES the pane's nav from them.
//
// `when` stays HERE and only here: it is the ONE viewer gate for everything at this anchor (nav, search,
// render), so no contributed admin section re-declares it.

import { Lock } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";

/** The admin pane — a `sections` skimmer. Section ORDER is the door array's order (main.tsx). */
export const adminPane: SettingsPaneDefinition = {
  id: "admin",
  group: "app",
  label: "Admin",
  icon: Lock,
  description: "Accounts, sessions, and the local inference engines on this deployment.",
  when: (viewer) => viewer.isAdmin,
  body: { kind: "sections" },
};
