import type {
  TabsIndicatorProps as BaseTabsIndicatorProps,
  TabsListProps as BaseTabsListProps,
  TabsPanelProps as BaseTabsPanelProps,
  TabsRootProps as BaseTabsRootProps,
  TabsTabProps as BaseTabsTabProps,
} from "@base-ui/react/tabs";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { ReactElement } from "react";
import { useLayoutEffect, useRef } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import { tabsVariants } from "./variants.ts";

export interface TabsProps extends BaseTabsRootProps {
  className?: string;
}

export interface TabsListProps extends BaseTabsListProps {
  className?: string;
}

export interface TabsTabProps extends BaseTabsTabProps, VariantProps<typeof tabsVariants> {
  className?: string;
}

export interface TabsIndicatorProps extends BaseTabsIndicatorProps {
  className?: string;
}

export interface TabsPanelProps extends BaseTabsPanelProps {
  className?: string;
}

export function Tabs({ className, ...rest }: TabsProps): ReactElement {
  return <BaseTabs.Root className={cn(tabsVariants().root(), className)} data-slot="tabs-root" {...rest} />;
}

// Seal default: arrow keys ACTIVATE as they move (Base UI defaults activateOnFocus to false).
export function TabsList({ className, ...rest }: TabsListProps): ReactElement {
  return <BaseTabs.List activateOnFocus={true} className={cn(tabsVariants().list(), className)} data-slot="tabs-list" {...rest} />;
}

// `layout="stacked"` is the glyph-over-caption cell (the rpg HUD's rails): the ONE home for a tab whose
// height must follow its content — a caller cannot get there with `className` (see variants.ts).
export function TabsTab({ className, layout, ...rest }: TabsTabProps): ReactElement {
  return <BaseTabs.Tab className={cn(tabsVariants({ layout }).tab(), className)} data-slot="tabs-tab" {...rest} />;
}

export function TabsIndicator({ className, ...rest }: TabsIndicatorProps): ReactElement {
  return <BaseTabs.Indicator className={cn(tabsVariants().indicator(), className)} data-slot="tabs-indicator" {...rest} />;
}

/** Everything the browser puts in the tab sequence on its own. `[tabindex]` is deliberately excluded from
 *  the positive half by the `:not()` — a `-1` stop is programmatic-only and does not save the reader a Tab. */
const TABBABLE_DESCENDANT =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [contenteditable="true"], [tabindex]:not([tabindex^="-"])';

/**
 * THE PANEL IS ONLY A TAB STOP WHEN IT HAS NOTHING ELSE TO OFFER (#537, corpus ARIA sweep).
 *
 * Base UI sets `tabIndex: open ? 0 : -1` unconditionally (`TabsPanel.js`), so EVERY open panel is a tab
 * stop. APG's tabs pattern puts the panel in the sequence only when it "does not contain any focusable
 * elements" — the stop exists so a keyboard reader can reach panel CONTENT that is otherwise unreachable
 * (and so a scrollable read-only panel can be scrolled). Measured on the corpus Archetypes context tab:
 * `tabindex="0"` on a panel holding two buttons, i.e. one dead stop announcing the panel's name again in
 * front of the controls it already contains.
 *
 * DERIVED, never declared by the caller: the answer is a property of the CONTENT, and a `focusable` prop
 * would be a claim every call site would have to keep true as its body changed. Base UI keeps only the OPEN
 * panel mounted, so this measures exactly one element per tab set, with a `querySelector` that
 * short-circuits on the first match.
 *
 * IT CORRECTS THE ATTRIBUTE RATHER THAN RE-DECLARING IT, and that is not a shortcut. `tabIndex` here is
 * Base UI's own render output, so a state-backed prop would need a dependency-free layout effect calling
 * `setState` — which `react-hooks/exhaustive-deps` REDs, while pinning the effect to `[children]` is
 * exactly the "more dependencies than necessary" biome REDs. Writing the resolved attribute on the node the
 * seal already owns satisfies both honestly: it runs in a LAYOUT effect (before paint, so no flash) and on
 * every commit, which is what makes content arriving after mount — a query resolving, a section revealing
 * its controls — change the answer.
 *
 * It runs on the OPEN panel only, keyed on Base UI's own `inert` (which is exactly what it puts on a closed
 * one alongside `tabIndex: -1`). Both directions are written, not just the demotion: a panel whose last
 * control unmounts — a filter emptying a list, a form collapsing to a sentence — becomes the read-only case
 * the stop exists FOR, and a one-way correction would have quietly taken it away.
 */
export function TabsPanel({ className, ...rest }: TabsPanelProps): ReactElement {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect((): void => {
    const node = panelRef.current;
    if (node === null || node.hasAttribute("inert")) {
      return;
    }
    node.setAttribute("tabindex", node.querySelector(TABBABLE_DESCENDANT) === null ? "0" : "-1");
  });
  return (
    <BaseTabs.Panel
      className={cn(tabsVariants().panel(), className)}
      data-slot="tabs-panel"
      {...rest}
      // The seal OWNS the panel node's ref — the correction above is its only reader, and no call site
      // passes one. Last, so it cannot be lost to a spread.
      ref={panelRef}
    />
  );
}
