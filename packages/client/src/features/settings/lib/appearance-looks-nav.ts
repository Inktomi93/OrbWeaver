// The Looks section's nav entry (#866 S4 / #297 apply-not-mode — config-revamp-design.md §7.3): the ONE
// `ConfigSubcategory` shared by the contribution def and the section body's `<Section>` anchor stamp. The
// theme fold: the picker + the builder LEFT the retired rail-foot `theme` modal and live here, first in
// the Appearance group.
//
// TWO LEAVES, NOT THREE (#920). `your-themes` retired with the shipped-vs-yours split — one collection
// renders every theme in one shape, so there is no second row for it to name. The surviving collection
// leaf keeps its `shipped-looks` ID (an id is an address other rows link and deep-links resolve; renaming
// it would break both for a label change) and takes the honest LABEL.

import type { ConfigSubcategory } from "#state";

export const APPEARANCE_LOOKS_SUBCATEGORY: ConfigSubcategory = {
  id: "looks",
  label: "Looks",
  keywords: ["theme", "palette", "color", "dark", "light", "appearance"],
  teach: {
    summary:
      "Appearance choices are applied states, not modes you enter — picking a look APPLIES it (#297). Shipped and self-made themes live in ONE collection and wear the same card; whether a theme shipped with the app is a property of that theme, not a different kind of thing.",
    affects: ["the whole app's palette, on this account everywhere you sign in"],
  },
  settings: [
    {
      id: "shipped-looks",
      label: "Themes",
      keywords: ["hearth", "mocha", "light", "built-in", "default", "switch theme", "custom", "imported", "my themes", "apply", "export", "delete"],
      teach: {
        summary:
          "Every theme, in one place and in one shape — the ones that ship with the app and the ones you build or import. Picking one applies it. What differs is what a theme LETS you do: a shipped theme can be applied, duplicated and exported; one of yours adds editing and deleting.",
        affects: ["the whole app's palette, on this account everywhere you sign in"],
        related: [{ group: "appearance", sub: "looks", setting: "theme-builder" }],
      },
    },
    {
      id: "theme-builder",
      label: "Theme builder",
      keywords: ["builder", "editor", "custom css", "accent", "new theme", "customize colors"],
      teach: {
        summary:
          "Starts from the look you are on and opens every token. Saving mints a NAMED THEME of yours — it never edits the shipped look, and there is no freestanding color knob anywhere else: a color decision always becomes a theme.",
        affects: ["a new card in the collection above; the app only changes when you apply it"],
        related: [{ group: "appearance", sub: "looks", setting: "shipped-looks" }],
      },
    },
  ],
};
