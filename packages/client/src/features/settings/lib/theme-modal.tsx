// The Theme modal as ONE co-located definition (client-architecture-lockdown.md §6d).

// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve the SunMoon glyph fine (the rail-slots precedent).
import { SunMoon } from "@orb/ui/icons";
import type { ModalDefinition } from "#state";
import { ThemePickerSurface } from "../surfaces/theme-picker-surface";

export const themeModal: ModalDefinition = {
  id: "theme",
  title: "Theme",
  trigger: { placement: "rail-footer", label: "Switch theme", icon: SunMoon },
  body: (): ReturnType<typeof ThemePickerSurface> => <ThemePickerSurface />,
};
