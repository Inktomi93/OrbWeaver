// The Theme modal as ONE co-located definition (client-architecture-lockdown.md §6d).

import { SunMoon } from "@orb/ui/icons";
import type { ModalDefinition } from "#state";
import { ThemePickerSurface } from "../surfaces/theme-picker-surface.tsx";

export const themeModal: ModalDefinition = {
  id: "theme",
  title: "Theme",
  trigger: { placement: "rail.end", label: "Switch theme", icon: SunMoon },
  body: (): ReturnType<typeof ThemePickerSurface> => <ThemePickerSurface />,
};
