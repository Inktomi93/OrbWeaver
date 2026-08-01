// The Avatars appearance-section MODEL (SET-SEAMS §6, stage 1) — the section's two non-JSX facts: the ONE
// `SettingsSubcategory` shared by the contribution def (appearance-avatars-section.tsx) and the section body's
// `<Section>` anchor stamp; split out so neither imports the other (the library-settings-nav precedent, plus the
// owned-key tuple below). The `(anchor, subId)` pair is byte-identical to the pre-split pane's own subcategory
// (§7.1).

import type { SettingsSubcategory } from "#state";

export const APPEARANCE_AVATARS_SUBCATEGORY: SettingsSubcategory = {
  id: "avatars",
  label: "Avatars",
  keywords: ["portrait", "picture"],
  settings: [
    { id: "show-avatars", label: "Show avatars in chat" },
    { id: "avatar-size", label: "Avatar size" },
    { id: "avatar-shape", label: "Avatar shape" },
    { id: "avatar-aspect", label: "Avatar aspect" },
    { id: "avatar-ring", label: "Avatar ring" },
  ],
};

/** The `appearance` keys this section — and ONLY this section — WRITES (SET-SEAMS §2.3 S1/S2). ONE
 *  spelling, three consumers: the body's `pickKeys` projection + seeded defaults, its `Pick`-derived form
 *  type, and the contribution's `owns` claim — so "the patch names only the keys this section owns" is true
 *  by construction, and the door's `assertSettingsKeyPartition` proves the namespace stays a partition.
 *  Lives beside the nav entry (both are this section's non-JSX identity data, shared by the def and the
 *  body without either importing the other). */
export const APPEARANCE_AVATARS_KEYS = ["showInChatAvatars", "avatarSize", "avatarShape", "avatarAspect", "avatarRing"] as const;
