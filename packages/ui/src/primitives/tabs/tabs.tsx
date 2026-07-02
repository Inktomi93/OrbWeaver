import type {
  TabsIndicatorProps as BaseTabsIndicatorProps,
  TabsListProps as BaseTabsListProps,
  TabsPanelProps as BaseTabsPanelProps,
  TabsRootProps as BaseTabsRootProps,
  TabsTabProps as BaseTabsTabProps,
} from "@base-ui/react/tabs";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { ReactElement } from "react";
import { cn } from "#lib";
import { tabsVariants } from "./variants";

// `orientation` is narrowed OUT: Base UI accepts "vertical" but the variants ship no vertical CSS
// branch, so exposing it would promise a silently-broken layout. Vertical support (type + CSS +
// test, together) lands when a real consumer needs it — see ui-primitive-contract BATCH 1.
export interface TabsProps extends Omit<BaseTabsRootProps, "orientation"> {
  className?: string;
}

export interface TabsListProps extends BaseTabsListProps {
  className?: string;
}

export interface TabsTabProps extends BaseTabsTabProps {
  className?: string;
}

export interface TabsIndicatorProps extends BaseTabsIndicatorProps {
  className?: string;
}

export interface TabsPanelProps extends BaseTabsPanelProps {
  className?: string;
}

/**
 * Tabs root — Base UI Tabs sealed behind the token skin; controlled-capable via
 * `value`/`onValueChange` passthrough (D42 §2 — Base UI seal; tabs added per ui-package-design §10.7).
 *
 * Usage:
 * `<Tabs defaultValue="prompt"><TabsList><TabsTab value="prompt">Prompt</TabsTab></TabsList>
 *  <TabsPanel value="prompt">…</TabsPanel></Tabs>`
 */
export function Tabs({ className, ...rest }: TabsProps): ReactElement {
  return <BaseTabs.Root className={cn(tabsVariants().root(), className)} {...rest} />;
}

/**
 * Tab strip — roving tabindex from Base UI. Seal default: arrow keys ACTIVATE as they move
 * (`activateOnFocus` — Base UI 1.6 defaults it to false; overridable via props).
 * `<TabsList><TabsTab …/></TabsList>`
 */
export function TabsList({ className, ...rest }: TabsListProps): ReactElement {
  return (
    <BaseTabs.List
      activateOnFocus={true}
      className={cn(tabsVariants().list(), className)}
      {...rest}
    />
  );
}

/** One tab button. `<TabsTab value="sampling">Sampling</TabsTab>` */
export function TabsTab({ className, ...rest }: TabsTabProps): ReactElement {
  return <BaseTabs.Tab className={cn(tabsVariants().tab(), className)} {...rest} />;
}

/**
 * The sliding active-tab marker — Base UI Tabs.Indicator. Renders a `<span>` inside `TabsList`
 * (place it after the `TabsTab`s) and tracks the active tab via the runtime `--active-tab-*` vars;
 * `transition-all` animates the slide. `<TabsList><TabsTab .../><TabsIndicator /></TabsList>`
 */
export function TabsIndicator({ className, ...rest }: TabsIndicatorProps): ReactElement {
  return <BaseTabs.Indicator className={cn(tabsVariants().indicator(), className)} {...rest} />;
}

/** The content pane paired to a tab by `value`. `<TabsPanel value="sampling">…</TabsPanel>` */
export function TabsPanel({ className, ...rest }: TabsPanelProps): ReactElement {
  return <BaseTabs.Panel className={cn(tabsVariants().panel(), className)} {...rest} />;
}
