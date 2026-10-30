import type { ReactNode } from "react";
import type { OverflowMenuForm } from "./overflow-menu-form.ts";

/** An absent search requires an authored reason, never an omitted classification. */
export type ListSearchPolicy = "required" | { readonly planned: string };

/** One action in the band's row: its inline control and the menu form that stands in for it when the row has no
 *  room. A band action without a menu form does not type-check, so no action can be lost to the overflow. */
export interface ListBandAction {
  readonly id: string;
  readonly inline: ReactNode;
  readonly menu: readonly [OverflowMenuForm, ...OverflowMenuForm[]];
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
