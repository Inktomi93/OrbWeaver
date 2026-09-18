// The About section's nav entry (owner ask 2026-09-18) — the ONE `ConfigSubcategory` shared by the
// contribution def and the section body's `<Section>` anchor stamp, split out so neither imports the other
// (the `admin-engines-nav.ts` precedent beside it).
//
// The keywords are the words a person actually types when they are looking for this: "version" when filing
// a bug, "update" when they heard there was a new release, "commit"/"sha" when an agent asked them for one.

import type { ConfigSubcategory } from "#state";

export const ABOUT_SUBCATEGORY: ConfigSubcategory = {
  id: "about",
  label: "About this install",
  navLabel: "About",
  keywords: ["version", "build", "commit", "sha", "update", "upgrade", "release", "github", "bug report"],
  teach: {
    summary:
      "Which Orbweaver this box is running — the release number, the exact commit it was built from, and whether that commit is still the newest one on GitHub. Quote the version line in any bug report.",
    affects: ["nothing — this section only reports; the update check reads GitHub and changes no setting"],
  },
};
