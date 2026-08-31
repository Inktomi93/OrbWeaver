// The Looks section's nav entry (#866 S4 / #297 apply-not-mode — config-revamp-design.md §7.3): the ONE
// `ConfigSubcategory` shared by the contribution def and the section body's `<Section>` anchor stamp. The
// theme fold: the picker + the builder LEFT the retired rail-foot `theme` modal and live here, first in
// the Appearance group.

import type { ConfigSubcategory } from "#state";

export const APPEARANCE_LOOKS_SUBCATEGORY: ConfigSubcategory = {
  id: "looks",
  label: "Looks",
  keywords: ["theme", "palette", "color", "dark", "light", "appearance"],
  teach: {
    summary:
      "Appearance choices are applied states, not modes you enter — picking a look APPLIES it (#297). The three shipped looks are a closed set; imported and built themes join Your themes beside them.",
    affects: ["the whole app's palette, on this account everywhere you sign in"],
  },
  settings: [
    {
      id: "shipped-looks",
      label: "Shipped looks",
      keywords: ["hearth", "mocha", "light", "built-in", "default", "switch theme"],
      teach: {
        summary: "Hearth, Mocha and Light — the built-in palettes. Picking one applies it; none of them can be edited or deleted, only started FROM.",
        affects: ["the whole app's palette"],
        related: [{ group: "appearance", sub: "looks", setting: "theme-builder" }],
      },
    },
    {
      id: "your-themes",
      label: "Your themes",
      keywords: ["custom", "imported", "my themes", "apply", "export", "delete"],
      teach: {
        summary:
          "Every theme you built or imported, as rows — apply one, reopen it in the builder, export it as a file, or delete it. Importing a theme file adds a row here.",
        affects: ["your own theme library — never the shipped looks"],
      },
    },
    {
      id: "theme-builder",
      label: "Theme builder",
      keywords: ["builder", "editor", "custom css", "accent", "new theme", "customize colors"],
      teach: {
        summary:
          "Starts from the look you are on and opens every token. Saving mints a NAMED THEME of yours — it never edits the shipped look, and there is no freestanding color knob anywhere else: a color decision always becomes a theme.",
        affects: ["a new row in Your themes; the app only changes when you apply it"],
        related: [{ group: "appearance", sub: "looks", setting: "your-themes" }],
      },
    },
  ],
};
