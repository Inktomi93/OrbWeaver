// personaChrome — the Identity (persona) widget as a registered `rail.end` chrome entry.
// ONE widget, TWO lenses: `body("bar")` renders the desktop rail-foot
// avatar chip + popover; `body("sheet")` inlines the SAME sections (Account strip · Playing-as · persona
// rows · this-chat) into the mobile You sheet — mobile persona switching lives HERE (§B ruling 1). It is
// the ONE bespoke affordance the lockdown left prop-injected (`AppShellProps.railFoot`); registering it
// at the door (main.tsx) kills that seam (§E-6). `mobile: "sheet"` folds it off the mobile bar into the
// You sheet's `body("sheet")` projection (§E-5).

import type { ReactNode } from "react";
import type { ChromeEntry, ChromePresentation } from "#state";
import { PersonaPanelSurface } from "../surfaces/persona-panel-surface.tsx";

export const personaChrome: ChromeEntry = {
  id: "persona-identity",
  label: "Account & personas",
  zone: "rail.end",
  // After the rail.end footer modals (theme/settings order 0/1) — the identity sits last, as the
  // desktop rail-foot avatar did.
  order: 50,
  mobile: "sheet",
  behavior: { kind: "widget", body: (presentation: ChromePresentation): ReactNode => <PersonaPanelSurface presentation={presentation} /> },
};
