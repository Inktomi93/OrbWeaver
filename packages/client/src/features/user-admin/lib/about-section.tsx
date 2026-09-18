// The About settings-SECTION CONTRIBUTION (owner ask 2026-09-18) — the co-located def user-admin exports on
// its front door; `compose/config-sections.ts` assembles it into the ONE section registry at the `admin`
// anchor.
//
// WHY THE `admin` ANCHOR, and the limit of that choice: `admin` is the existing group whose subject IS the
// deployment — operations, engines, accounts — and "which build is this box running" is the same kind of
// fact. It is also the only existing home: there is no `about` group in `CONFIG_GROUP_IDS`, and minting one
// would be a new PANE rather than a row in the registry. The consequence is honest and worth stating: the
// admin group carries `when: viewer.isAdmin`, so a NON-admin member of a multi-user box cannot read the
// version from the UI. The wire verb is `authedProcedure` (any authed caller), so the day this deserves a
// user-shelf home the server half needs no change.
//
// No `when` here: the admin pane carries the viewer gate (the `admin-engines-section.ts` rule).
// No `owns`: the section persists NOTHING — it reports, and its one button performs a read.

import type { ConfigSectionContribution } from "#state";
import { AboutSection } from "../components/about-section.tsx";
import { ABOUT_SUBCATEGORY } from "./about-nav.ts";

export const aboutSection: ConfigSectionContribution = {
  id: "admin-about",
  anchor: "admin",
  nav: ABOUT_SUBCATEGORY,
  body: () => <AboutSection />,
};
