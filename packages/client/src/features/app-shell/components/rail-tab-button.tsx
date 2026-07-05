// RailTabButton — one affordance in the MOBILE bottom tab bar (L6/J12 · D62 P3). Distinct from the
// desktop `RailButton` (icon-only + hover tooltip): a thumb-reach tab needs a PERSISTENT 10px label under
// the icon (there is no hover on touch, and Base UI suppresses tooltips on coarse pointers anyway), so
// this is a separate leaf, not a variant of RailButton. Composed from @orb/ui primitives (Button · Icon ·
// Text) — app-shell paints the frame, the affordance stays primitive-composed. The vertical icon+label
// stack + active tint live in shell.css keyed off `.shell-tab-button` + `data-active` (the RailButton
// precedent: shell-tier chrome, not inline utilities).

import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the rail-button.tsx precedent).
import type { LucideIcon } from "@orb/ui/icons";
// biome-ignore lint/correctness/noUnresolvedImports: same @orb/ui/icons resolver gap as above — tsc/vite resolve Icon fine.
import { Icon } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

export interface RailTabButtonProps {
  readonly label: string;
  readonly icon: LucideIcon;
  /** Active (current section) — Ember tint + `aria-current`. The "You" tab passes `false`. */
  readonly active?: boolean;
  readonly onClick: () => void;
}

export function RailTabButton({
  label,
  icon,
  active = false,
  onClick,
}: RailTabButtonProps): ReactElement {
  return (
    <Button
      intent="ghost"
      // The label is visible below the icon AND the accessible name (the icon is decorative here — the
      // Text carries the name), so no separate aria-label is needed; `aria-current` marks the active tab.
      aria-current={active ? "page" : undefined}
      data-active={active ? "" : undefined}
      className="shell-tab-button"
      onClick={onClick}
    >
      <Icon icon={icon} size="sm" aria-hidden={true} />
      <Text as="span" size="micro" className="shell-tab-label">
        {label}
      </Text>
    </Button>
  );
}
