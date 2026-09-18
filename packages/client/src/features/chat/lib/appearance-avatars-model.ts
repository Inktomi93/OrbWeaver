// The Avatars appearance-section MODEL (SET-SEAMS §6, stage 1) — the section's two non-JSX facts: the ONE
// `ConfigSubcategory` shared by the contribution def (appearance-avatars-section.tsx) and the section body's
// `<Section>` anchor stamp; split out so neither imports the other (the library-settings-nav precedent, plus the
// owned-key tuple below). The `(anchor, subId)` pair is byte-identical to the pre-split pane's own subcategory
// (§7.1).

import { APPEARANCE_OWNER_KEYS } from "#lib";
import type { ConfigSubcategory } from "#state";
import { AVATAR_ASPECT_ITEMS, AVATAR_RING_ITEMS, AVATAR_SHAPE_ITEMS, AVATAR_SIZE_ITEMS } from "./appearance-select-items.ts";

export const APPEARANCE_AVATARS_SUBCATEGORY: ConfigSubcategory = {
  id: "avatars",
  label: "Avatars",
  keywords: ["portrait", "picture"],
  teach: {
    summary: "Speaker portrait knobs: visibility, size, frame shape, aspect ratio and accent ring.",
    affects: ["avatar frames on every message row, in every chat, on this account"],
  },
  settings: [
    {
      id: "show-avatars",
      key: "showInChatAvatars",
      label: "Show avatars in chat",
      teach: { summary: "Hide to show only the speaker's name on each message.", affects: ["every message row, in every chat"] },
    },
    {
      id: "avatar-size",
      key: "avatarSize",
      label: "Avatar size",
      options: AVATAR_SIZE_ITEMS,
      teach: { summary: "How large each speaker's avatar renders beside their messages.", affects: ["avatar boxes in every chat"] },
    },
    {
      id: "avatar-shape",
      key: "avatarShape",
      label: "Avatar shape",
      options: AVATAR_SHAPE_ITEMS,
      teach: { summary: "Round or square avatar frames.", affects: ["avatar frames in every chat"] },
    },
    {
      id: "avatar-aspect",
      key: "avatarAspect",
      label: "Avatar aspect",
      options: AVATAR_ASPECT_ITEMS,
      teach: {
        summary: "Portrait reserves a taller box — the immersive VN-style modes use it.",
        affects: ["avatar boxes in every chat", "the immersive chat displays most of all"],
        related: [{ group: "appearance", sub: "message-style", setting: "chat-style" }],
      },
    },
    {
      id: "avatar-ring",
      key: "avatarRing",
      label: "Avatar ring",
      options: AVATAR_RING_ITEMS,
      teach: { summary: "An accent ring around each avatar, or none.", affects: ["avatar frames in every chat"] },
    },
  ],
};

/** The `appearance` keys this section — and ONLY this section — WRITES (SET-SEAMS §2.3 S1/S2). ONE
 *  spelling, three consumers: the body's `pickKeys` projection + seeded defaults, its `Pick`-derived form
 *  type, and the contribution's `owns` claim — so "the patch names only the keys this section owns" is true
 *  by construction, and the door's `assertSettingsKeyPartition` proves the namespace stays a partition.
 *  Lives beside the nav entry (both are this section's non-JSX identity data, shared by the def and the
 *  body without either importing the other). */
export const APPEARANCE_AVATARS_KEYS = APPEARANCE_OWNER_KEYS.avatars;
