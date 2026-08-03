// The Engines settings-SECTION CONTRIBUTION (SET-SEAMS stage 3) — the co-located def user-admin exports on
// its front door; main.tsx assembles it into the ONE settings-section registry at the `admin` anchor.
//
// The stage-3 `owns` HOLD is RESOLVED here (SET-SEAMS stage 4): `engineLaunch` is CO-OWNED by two sections
// — this one's launch editor writes the restart-gated argv leaves, `admin-system-tuning` writes the
// per-request `genPresencePenalty` leaf — and the app-tier claim grammar is leaf-aware now
// (`AppSettingsClaimPath`), so both declare the truth instead of one staying silent. The claim DERIVES from
// the editor's own field tuples, so a new launch field can't silently escape the partition. Neither section
// may ever clear the PARENT key (`{engineLaunch: null}` would wipe the co-owner) — the partition's nesting
// arm REDs a parent claim beside these leaves, which is what keeps that rule honest.
//
// No `when`: the admin pane carries the viewer gate.

import type { SettingsSectionContribution } from "#state";
import { AdminEnginesSection } from "../components/admin-engines-section.tsx";
import { ADMIN_ENGINES_SUBCATEGORY } from "./admin-engines-nav.ts";
import { ENGINE_LAUNCH_CLAIM_KEYS } from "./engine-launch-fields.ts";

export const adminEnginesSection: SettingsSectionContribution = {
  id: "admin-engines",
  anchor: "admin",
  nav: ADMIN_ENGINES_SUBCATEGORY,
  owns: { tier: "app", keys: ENGINE_LAUNCH_CLAIM_KEYS },
  body: () => <AdminEnginesSection />,
};
