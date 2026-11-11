// The ONE display-word map for the `system | on | off` vocabulary. Features can't import each other; `lib/` sits
// below every feature, so a chip that shows an on/off state reads its word here, never the wire spelling.

import type { OsPreferenceMode } from "@orb/contracts/settings";

export const OS_PREFERENCE_LABELS: Record<OsPreferenceMode, string> = {
  system: "System",
  on: "On",
  off: "Off",
};
