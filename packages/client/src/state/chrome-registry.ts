// The chrome-registry contract (shell-chrome-unification.md §A, topbar.trail slice) — a shell chrome
// affordance as ONE co-located `ChromeEntry`, assembled at the door (main.tsx) via
// `createContributorRegistry`. `rail.nav`/`rail.end` are named now (the closed zone vocabulary) but get no
// consumer this wave — deferred with the rest of the shell-chrome program.

import type { LucideIcon } from "@orb/ui/icons";
import type { ReactNode } from "react";

export const CHROME_ZONES = ["rail.nav", "rail.end", "topbar.trail"] as const;
export type ChromeZone = (typeof CHROME_ZONES)[number];

/** A chrome widget as ONE definition. `body` renders the live affordance (a bell with its own
 *  badge+popover, a toggle button) — never a static icon/label pair. */
export interface ChromeEntry {
  readonly id: string;
  readonly label: string;
  readonly icon?: LucideIcon;
  readonly zone: ChromeZone;
  readonly order?: number;
  /** Capability gate, called UNCONDITIONALLY per entry — the registry list is frozen at the door
   *  (contentBySection precedent), so hooks-over-a-stable-list is legal. `false` ⇒ render NOTHING (no
   *  gap) — preserves the notification bell's no-flash-then-yank rule. Omitted ⇒ always visible. */
  readonly useVisible?: () => boolean;
  readonly body: () => ReactNode;
}
