// The PROMOTE door's mutation (TD door 1) — "save this card's look as a theme". It lives in the CHARACTER
// feature because that is where the door is: the values are authored on the Appearance tab and the settings
// feature can never be imported sideways (`client-features-no-cross`). Reading `trpc.settings.*` directly is
// the sanctioned cross-feature seam (UI-Arch §11.0 — the same door `use-chat-style` uses).
//
// busDriven: `settings.promoteTheme` emits `themesChanged` after the durable write, which covers the theme
// library read — the picker shows the new row without this hook invalidating anything itself.

import type { PromoteThemeInput, Theme } from "@orb/contracts/theme";
import { createEntityMutation } from "#data";

export const usePromoteTheme = createEntityMutation<PromoteThemeInput, Theme>({
  options: (trpc) => trpc.settings.promoteTheme.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't save this look as a theme.",
});
