// The Engines settings-SECTION CONTRIBUTION (SET-SEAMS stage 3) — the co-located def user-admin exports on
// its front door; main.tsx assembles it into the ONE settings-section registry at the `admin` anchor.
//
// No `owns` claim, DELIBERATELY, and this one is a cited stage-3 hold rather than a plain exemption: the
// section's launch-config editor writes `engineLaunch` (a sparse restart-gated argv delta), but the §2.3
// claim granularity is the TOP-LEVEL key and `engineLaunch` is already claimed by `admin-system-tuning`
// (which writes the per-request leaf `engineLaunch.genPresencePenalty`). Declaring it here would throw the
// door's overlap arm for a pair of writes that are in fact leaf-disjoint. The APP tier has no gap arm until
// stage 4 (AppSettings is still pane-owned there), and stage 4 is where the app-tier partition is designed
// per-section with its own baselines — the claim split for `engineLaunch` lands with it.
//
// No `when`: the admin pane carries the viewer gate.

import type { SettingsSectionContribution } from "#state";
import { AdminEnginesSection } from "../components/admin-engines-section";
import { ADMIN_ENGINES_SUBCATEGORY } from "./admin-engines-nav";

export const adminEnginesSection: SettingsSectionContribution = {
  id: "admin-engines",
  anchor: "admin",
  nav: ADMIN_ENGINES_SUBCATEGORY,
  body: () => <AdminEnginesSection />,
};
