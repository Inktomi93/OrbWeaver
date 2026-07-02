// Base UI Toolbar (verified against @base-ui/react@1.6.0: parts Root/Button/Group/Link/Input/
// Separator; Root props orientation/disabled/loopFocus) — roving tabindex + ARIA for free,
// skinned as a Row (ui-package-design §10.6: D42 lists Toolbar under layout/; D54 adds Base UI
// Toolbar; merged here).
import { Toolbar as BaseToolbar } from "@base-ui/react/toolbar";
import type { ComponentProps, ReactElement } from "react";
import { toolbar, toolbarButton, toolbarSeparator } from "./variants";

export interface ToolbarProps extends Omit<ComponentProps<typeof BaseToolbar.Root>, "className"> {
  className?: string;
}

/**
 * Horizontal control strip — Base UI Toolbar root (roving tabindex, arrow-key focus) dressed as a
 * Row (gap-row px-block h-control-md items-center). Put `<ToolbarButton>` items inside so the
 * roving tabindex engages (ui-package-design §6.1 layout row).
 *
 * Usage: `<Toolbar aria-label="formatting"><ToolbarButton>Bold</ToolbarButton></Toolbar>`.
 */
export function Toolbar({ className, ...props }: ToolbarProps): ReactElement {
  return <BaseToolbar.Root {...props} className={toolbar({ className })} />;
}

export interface ToolbarButtonProps
  extends Omit<ComponentProps<typeof BaseToolbar.Button>, "className"> {
  className?: string;
}

/**
 * A toolbar item participating in the roving tabindex. Carries only a minimal touch-floor skin
 * (h-control-sm ≥44px — gate touch-target-floor); compose the real button primitive via Base UI's
 * `render` prop: `<ToolbarButton render={<Button variant="ghost" />} />`.
 */
export function ToolbarButton({ className, ...props }: ToolbarButtonProps): ReactElement {
  return <BaseToolbar.Button {...props} className={toolbarButton({ className })} />;
}

export interface ToolbarSeparatorProps
  extends Omit<ComponentProps<typeof BaseToolbar.Separator>, "className"> {
  className?: string;
}

/** A vertical rule between toolbar groups (Base UI Separator — correct ARIA orientation). */
export function ToolbarSeparator({ className, ...props }: ToolbarSeparatorProps): ReactElement {
  return <BaseToolbar.Separator {...props} className={toolbarSeparator({ className })} />;
}
