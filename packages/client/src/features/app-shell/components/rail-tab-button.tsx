// RailTabButton — one affordance in the mobile bottom tab bar. Distinct from the desktop RailButton
// (icon-only + hover tooltip): a thumb-reach tab needs a persistent label under the icon since there's no
// hover on touch. The vertical icon+label stack + active tint live in shell.css keyed off
// `.shell-tab-button` + `data-active`.

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
