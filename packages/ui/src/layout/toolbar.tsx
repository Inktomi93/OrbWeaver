// Base UI Toolbar — roving tabindex + ARIA for free, skinned as a Row.
import { Toolbar as BaseToolbar } from "@base-ui/react/toolbar";
import type { ComponentProps, ReactElement } from "react";
import {
  toolbarButtonVariants,
  toolbarGroupVariants,
  toolbarInputVariants,
  toolbarLinkVariants,
  toolbarSeparatorVariants,
  toolbarVariants,
} from "./variants.ts";

export type ToolbarProps = Omit<ComponentProps<typeof BaseToolbar.Root>, "className">;

/** Horizontal control strip — put `<ToolbarButton>` items inside so the roving tabindex engages. */
export function Toolbar(props: ToolbarProps): ReactElement {
  return <BaseToolbar.Root {...props} className={toolbarVariants()} />;
}

export type ToolbarButtonProps = Omit<ComponentProps<typeof BaseToolbar.Button>, "className">;

/** A toolbar item participating in the roving tabindex; compose the real button via Base UI's `render` prop. */
export function ToolbarButton(props: ToolbarButtonProps): ReactElement {
  return <BaseToolbar.Button {...props} className={toolbarButtonVariants()} />;
}

export type ToolbarSeparatorProps = Omit<ComponentProps<typeof BaseToolbar.Separator>, "className">;

/** A vertical rule between toolbar groups (Base UI Separator — correct ARIA orientation). */
export function ToolbarSeparator(props: ToolbarSeparatorProps): ReactElement {
  return <BaseToolbar.Separator {...props} className={toolbarSeparatorVariants()} />;
}

export type ToolbarGroupProps = Omit<ComponentProps<typeof BaseToolbar.Group>, "className">;

/**
 * A related cluster of toolbar items. Name it with `aria-label` — Base UI gives the group its own
 * accessible boundary so a screen reader announces "Numerical format, group" around the buttons
 * instead of one flat run of them, and `disabled` here inerts every item inside in one place.
 */
export function ToolbarGroup(props: ToolbarGroupProps): ReactElement {
  return <BaseToolbar.Group {...props} className={toolbarGroupVariants()} />;
}

export type ToolbarLinkProps = Omit<ComponentProps<typeof BaseToolbar.Link>, "className">;

/**
 * A navigating toolbar item — renders an `<a>` that JOINS the roving tabindex. A bare `<a>` dropped
 * into a `<Toolbar>` does not: the strip's arrow-key navigation would skip it and it would keep its
 * own tab stop, so the toolbar's "one tab stop, arrows within" contract breaks on that one item.
 */
export function ToolbarLink(props: ToolbarLinkProps): ReactElement {
  return <BaseToolbar.Link {...props} className={toolbarLinkVariants()} />;
}

export type ToolbarInputProps = Omit<ComponentProps<typeof BaseToolbar.Input>, "className">;

/**
 * A text control that participates in the toolbar's keyboard model. Compose a richer control through
 * Base UI's `render` prop — `<ToolbarInput render={<NumberField.Input />} />` is the documented
 * NumberField-in-a-toolbar shape (https://base-ui.com/react/components/toolbar, "Using with NumberField"). Use ONE per
 * horizontal toolbar, LAST: arrow keys drive both the caret and the roving tabindex.
 */
export function ToolbarInput(props: ToolbarInputProps): ReactElement {
  return <BaseToolbar.Input {...props} className={toolbarInputVariants()} />;
}
