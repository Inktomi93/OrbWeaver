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

export interface TabsProps extends BaseTabsRootProps {
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

export function Tabs({ className, ...rest }: TabsProps): ReactElement {
  return (
    <BaseTabs.Root
      className={cn(tabsVariants().root(), className)}
      data-slot="tabs-root"
      {...rest}
    />
  );
}

// Seal default: arrow keys ACTIVATE as they move (Base UI defaults activateOnFocus to false).
export function TabsList({ className, ...rest }: TabsListProps): ReactElement {
  return (
    <BaseTabs.List
      activateOnFocus={true}
      className={cn(tabsVariants().list(), className)}
      data-slot="tabs-list"
      {...rest}
    />
  );
}

export function TabsTab({ className, ...rest }: TabsTabProps): ReactElement {
  return (
    <BaseTabs.Tab className={cn(tabsVariants().tab(), className)} data-slot="tabs-tab" {...rest} />
  );
}

export function TabsIndicator({ className, ...rest }: TabsIndicatorProps): ReactElement {
  return (
    <BaseTabs.Indicator
      className={cn(tabsVariants().indicator(), className)}
      data-slot="tabs-indicator"
      {...rest}
    />
  );
}

export function TabsPanel({ className, ...rest }: TabsPanelProps): ReactElement {
  return (
    <BaseTabs.Panel
      className={cn(tabsVariants().panel(), className)}
      data-slot="tabs-panel"
      {...rest}
    />
  );
}
