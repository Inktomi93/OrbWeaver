// Base UI Toolbar — roving tabindex + ARIA for free, skinned as a Row.
import { Toolbar as BaseToolbar } from "@base-ui/react/toolbar";
import type { ComponentProps, ReactElement } from "react";
import { toolbarButtonVariants, toolbarSeparatorVariants, toolbarVariants } from "./variants";

export interface ToolbarProps extends Omit<ComponentProps<typeof BaseToolbar.Root>, "className"> {
  className?: string;
}

/** Horizontal control strip — put `<ToolbarButton>` items inside so the roving tabindex engages. */
export function Toolbar({ className, ...props }: ToolbarProps): ReactElement {
  return <BaseToolbar.Root {...props} className={toolbarVariants({ className })} />;
}

export interface ToolbarButtonProps
  extends Omit<ComponentProps<typeof BaseToolbar.Button>, "className"> {
  className?: string;
}

/** A toolbar item participating in the roving tabindex; compose the real button via Base UI's `render` prop. */
export function ToolbarButton({ className, ...props }: ToolbarButtonProps): ReactElement {
  return <BaseToolbar.Button {...props} className={toolbarButtonVariants({ className })} />;
}

export interface ToolbarSeparatorProps
  extends Omit<ComponentProps<typeof BaseToolbar.Separator>, "className"> {
  className?: string;
}

/** A vertical rule between toolbar groups (Base UI Separator — correct ARIA orientation). */
export function ToolbarSeparator({ className, ...props }: ToolbarSeparatorProps): ReactElement {
  return <BaseToolbar.Separator {...props} className={toolbarSeparatorVariants({ className })} />;
}
