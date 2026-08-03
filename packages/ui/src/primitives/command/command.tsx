import {
  CommandEmpty as BaseCommandEmpty,
  CommandGroup as BaseCommandGroup,
  CommandInput as BaseCommandInput,
  CommandItem as BaseCommandItem,
  CommandList as BaseCommandList,
  CommandLoading as BaseCommandLoading,
  CommandRoot as BaseCommandRoot,
  CommandSeparator as BaseCommandSeparator,
  useCommandState,
} from "cmdk";
import type { ComponentProps, KeyboardEvent, ReactElement, ReactNode } from "react";
import { cn, formatResultCount } from "#lib";
import { Icon, Search } from "#primitives/icons";
import { commandVariants } from "./variants.ts";

const slots = commandVariants();

export interface CommandProps extends Omit<ComponentProps<typeof BaseCommandRoot>, "className"> {
  className?: string;
  /**
   * Fires on Escape while focus is inside the root — cmdk has no built-in close/escape behavior.
   * Does not call preventDefault/stopPropagation, so an ancestor Dialog's own Escape-to-close
   * still works whether or not this is supplied.
   */
  onEscape?: () => void;
}

/**
 * The command-palette seal. Domain-free: renders whatever CommandGroup/CommandItem tree the
 * caller supplies — the actual command registry is app-level. Filtering, sorting, vim bindings,
 * and the combobox/listbox ARIA wiring are cmdk's own — do not reimplement them. cmdk's own
 * `Command.Dialog` is skipped (a second modal implementation alongside our Base UI Dialog); a
 * future omni-bar composes `<Dialog><Command>…</Command></Dialog>` instead.
 */
export function Command({ className, onEscape, onKeyDown, ...rest }: CommandProps): ReactElement {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    onKeyDown?.(event);
    if (event.key === "Escape") {
      onEscape?.();
    }
  };
  return <BaseCommandRoot className={cn(slots.root(), className)} data-slot="command-root" onKeyDown={handleKeyDown} {...rest} />;
}

export interface CommandInputProps extends Omit<ComponentProps<typeof BaseCommandInput>, "className"> {
  className?: string;
}

/** The search box. The leading glyph is decorative — accessible name comes from aria-label. */
export function CommandInput({ className, ...rest }: CommandInputProps): ReactElement {
  return (
    <div className={slots.inputWrapper()} data-slot="command-input-wrapper">
      <Icon icon={Search} size="sm" />
      <BaseCommandInput className={cn(slots.input(), className)} data-slot="command-input" {...rest} />
    </div>
  );
}

export interface CommandListProps extends Omit<ComponentProps<typeof BaseCommandList>, "className"> {
  className?: string;
}

/** The scrollable listbox. No height is forced — the caller bounds it via `className`. */
export function CommandList({ className, ...rest }: CommandListProps): ReactElement {
  return <BaseCommandList className={cn(slots.list(), className)} data-slot="command-list" {...rest} />;
}

export interface CommandEmptyProps extends Omit<ComponentProps<typeof BaseCommandEmpty>, "className"> {
  className?: string;
}

/**
 * Renders only when the filtered result count is zero. Defaults to a plain text line; compose
 * `<EmptyState>` as children instead for a full-page omni-bar surface.
 */
export function CommandEmpty({ className, children, ...rest }: CommandEmptyProps): ReactElement {
  return (
    <BaseCommandEmpty className={cn(slots.empty(), className)} data-slot="command-empty" {...rest}>
      {children ?? "No results found."}
    </BaseCommandEmpty>
  );
}

export interface CommandGroupProps extends Omit<ComponentProps<typeof BaseCommandGroup>, "className"> {
  className?: string;
}

/**
 * A labeled section of items. cmdk renders the heading through an unstyled internal div with no
 * className slot, so the styled treatment wraps `heading` in a token-classed span instead.
 */
export function CommandGroup({ className, heading, ...rest }: CommandGroupProps): ReactElement {
  const styledHeading: ReactNode =
    heading === undefined ? undefined : (
      <span className={slots.groupHeading()} data-slot="command-group-heading">
        {heading}
      </span>
    );
  return <BaseCommandGroup className={cn(slots.group(), className)} data-slot="command-group" heading={styledHeading} {...rest} />;
}

export interface CommandItemProps extends Omit<ComponentProps<typeof BaseCommandItem>, "className"> {
  className?: string;
}

/**
 * A selectable command row — active on pointer-enter or arrow-key roving, never receives real DOM
 * focus. cmdk's default filter scores a query against `value`/`keywords`, NEVER the rendered
 * children — an id-based `value` needs the display text passed via `keywords` too, or typing the
 * visible label matches nothing.
 */
export function CommandItem({ className, ...rest }: CommandItemProps): ReactElement {
  return <BaseCommandItem className={cn(slots.item(), className)} data-slot="command-item" {...rest} />;
}

export interface CommandSeparatorProps extends Omit<ComponentProps<typeof BaseCommandSeparator>, "className"> {
  className?: string;
}

/** A divider between groups/items — cmdk hides it during a search unless `alwaysRender` is set. */
export function CommandSeparator({ className, ...rest }: CommandSeparatorProps): ReactElement {
  return <BaseCommandSeparator className={cn(slots.separator(), className)} data-slot="command-separator" {...rest} />;
}

export interface CommandLoadingProps extends Omit<ComponentProps<typeof BaseCommandLoading>, "className"> {
  className?: string;
}

/** Progressbar shown while async suggestions load — render conditionally around it. */
export function CommandLoading({ className, ...rest }: CommandLoadingProps): ReactElement {
  return <BaseCommandLoading className={cn(slots.loading(), className)} data-slot="command-loading" {...rest} />;
}

/** Announces the live filtered-result count to screen readers. Must render under `<Command>`. */
export function CommandStatus(): ReactElement {
  const count = useCommandState((state) => state.filtered.count);
  return (
    <div aria-live="polite" className={slots.status()} data-slot="command-status" role="status">
      {formatResultCount(count)}
    </div>
  );
}
