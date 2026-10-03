// The About group's nav entries: each `ConfigSubcategory` is shared by its contribution def and the section
// body's `<Section>` anchor stamp, split out so neither imports the other (the `admin-engines-nav.ts` precedent).
// The keywords are the words a person types when filing a bug or checking for a new release.

import type { ConfigSubcategory } from "#state";

export const ABOUT_SUBCATEGORY: ConfigSubcategory = {
  id: "version",
  label: "About this install",
  navLabel: "Version",
  keywords: ["version", "build", "commit", "sha", "release", "bug report"],
  teach: {
    summary: "Which Orbweaver this install runs: the release number and the exact commit it was built from. Copy the version line into any bug report.",
    affects: ["nothing; this section only reports"],
  },
};

export const ABOUT_UPDATES_SUBCATEGORY: ConfigSubcategory = {
  id: "updates",
  label: "Updates",
  keywords: ["update", "upgrade", "github", "newer", "latest"],
  teach: {
    summary: "Asks GitHub whether a newer release or commit exists. It runs only when you press the button.",
    affects: ["nothing; the check reads GitHub and changes no setting"],
  },
};
