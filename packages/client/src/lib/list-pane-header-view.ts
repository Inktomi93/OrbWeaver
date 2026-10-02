import type { ReactNode } from "react";

/** An absent search requires an authored reason, never an omitted classification. */
export type ListSearchPolicy = "required" | { readonly planned: string };

/** Section data for the shell-owned list band; feature actions cannot replace its identity anatomy. */
export interface ListPaneHeaderView {
  readonly title: string;
  readonly accent?: string;
  readonly count?: number | string;
  readonly back?: { readonly label: string; readonly onClick: () => void };
  readonly action?: ReactNode;
  readonly overlay?: ReactNode;
}

export type ListPaneHeaderProps = Omit<ListPaneHeaderView, "overlay">;
