import type { LucideIcon } from "@orb/ui/icons";

/** One command in an action's menu form: what the menu shows and the handler its inline control also calls. */
export interface OverflowMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
}

/** A group of commands one level down, for an inline control that is itself a menu. */
export interface OverflowSubmenu {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly items: readonly OverflowMenuForm[];
}

/** What an action offers in its row's "More" menu when the row has no room for its inline form. */
export type OverflowMenuForm = OverflowMenuItem | OverflowSubmenu;
