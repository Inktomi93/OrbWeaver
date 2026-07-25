// The ONE decorative-background KIND display-label map (BG-C) — the Appearance settings surface's
// `backgroundImageKind` select AND the shared `BackgroundSourceField` picker show the same labels for the
// same `@orb/contracts/theme` tuple. Features can't import each other; `lib/` sits below every feature (and
// below `#components`), so this is the shared home — the `message-role-labels.ts` precedent.

import type { BackgroundImageKind } from "@orb/contracts/theme";
import { BACKGROUND_IMAGE_KINDS } from "@orb/contracts/theme";
import type { SelectItems } from "@orb/ui/select";

export const BACKGROUND_KIND_LABELS: Record<BackgroundImageKind, string> = {
  none: "None",
  seeded: "Seeded",
  external: "URL",
  asset: "Upload",
};

export const BACKGROUND_KIND_ITEMS: SelectItems<string> = BACKGROUND_IMAGE_KINDS.map((value) => ({
  value,
  label: BACKGROUND_KIND_LABELS[value],
}));
