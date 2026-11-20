import type { ReactNode, Ref } from "react";
import type { OverflowMenuForm, OverflowMenuItem } from "./overflow-menu-form.ts";

/** One action in the band's row: its inline control and the menu form that stands in for it when the row has no room. A
 *  band action without a menu form does not type-check, so no action can be lost to the overflow. The band's last action is
 *  its primary: it never moves into the menu, and a primary with a `compact` command shows it as an icon when its word does
 *  not fit. */
interface ListBandAction {
  readonly id: string;
  readonly inline: ReactNode;
  readonly menu: readonly [OverflowMenuForm, ...OverflowMenuForm[]];
  readonly compact?: OverflowMenuItem;
  /** The compact icon's button, for a surface that returns focus to the band's primary. */
  readonly compactRef?: Ref<HTMLButtonElement>;
}

/** Section data for the shell-owned list band; feature actions cannot replace its identity anatomy. */
export interface ListPaneHeaderView {
  readonly title: string;
  readonly accent?: string;
  readonly count?: number | string;
  readonly back?: { readonly label: string; readonly onClick: () => void };
  readonly actions?: readonly ListBandAction[];
  readonly overlay?: ReactNode;
}

export type ListPaneHeaderProps = Omit<ListPaneHeaderView, "overlay">;
