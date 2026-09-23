import {
  CommandEmpty as BaseCommandEmpty,
  CommandGroup as BaseCommandGroup,
  CommandInput as BaseCommandInput,
  CommandItem as BaseCommandItem,
  CommandList as BaseCommandList,
  CommandLoading as BaseCommandLoading,
  CommandRoot as BaseCommandRoot,
  useCommandState,
} from "cmdk";
import type { ComponentProps, ReactElement, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn, formatResultCount } from "#lib";
import type { ButtonBaseProps, ButtonProps } from "#primitives/button";
import { Button } from "#primitives/button";
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
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    onKeyDown?.(event);
    if (event.key === "Escape") {
      onEscape?.();
    }
  };
  return <BaseCommandRoot className={cn(slots.root(), className)} data-slot="command-root" onKeyDown={handleKeyDown} {...rest} />;
}

export interface CommandInputProps extends Omit<ComponentProps<typeof BaseCommandInput>, "className"> {
  className?: string;
  /**
   * Is a `<CommandList>` actually MOUNTED right now? Pass this from any caller that renders its list
   * conditionally; omit it when the list is always present (the omni-bar shape), where cmdk is already right.
   *
   * WHY IT IS A PROP AND NOT AN ATTRIBUTE THE CALLER SPELLS: cmdk hardcodes a literal `true` for
   * `aria-expanded`, plus its own list id for `aria-controls`, AFTER spreading the caller's props (verified
   * in the `cmdk@1.1.1` dist bundle), so a call-site `aria-expanded` is silently discarded. That is a fair
   * default for cmdk's own always-mounted anatomy and a lie for ours: the settings search announced itself
   * expanded onto a listbox that does not exist until you type (side-eye 2026-08-16).
   */
  expanded?: boolean;
}

/** The search box. The leading glyph is decorative — accessible name comes from aria-label. */
export function CommandInput({ className, expanded, ...rest }: CommandInputProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  // cmdk's own `aria-controls` (its list id), remembered so the EXPANDED arm can put it back. It is stable
  // per Command root, and it is only ever read from the DOM cmdk itself wrote.
  const listIdRef = useRef<string | null>(null);

  // NO DEP ARRAY, AND BOTH ARMS ACT — the two halves of one correction, each paid for by a measured failure:
  //   · no deps, because cmdk re-asserts the attributes on every render, so a correction keyed to `expanded`
  //     would be undone by the next unrelated re-render;
  //   · an explicit RESTORE, because React's reconciler compares its own previous vnode, not the DOM. cmdk
  //     renders the literal `true` every time, so once this effect has written `"false"` React sees no prop
  //     change and never rewrites the attribute — the box stayed collapsed forever (caught by the CT).
  // `useLayoutEffect` lands both in the same frame as the commit, so no reader samples the wrong value.
  // `aria-controls` moves WITH `aria-expanded`: a control pointing at an unmounted id is the same defect.
  // (The `folder-picker` precedent — a ref + setAttribute is how this package states what the vendor will not.)
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (el === null || expanded === undefined) {
      return;
    }
    const current = el.getAttribute("aria-controls");
    if (current !== null) {
      listIdRef.current = current;
    }
    el.setAttribute("aria-expanded", expanded ? "true" : "false");
    if (expanded) {
      if (listIdRef.current !== null) {
        el.setAttribute("aria-controls", listIdRef.current);
      }
    } else {
      el.removeAttribute("aria-controls");
    }
  });

  // cmdk's `selectedItemId` can remain unset when filtering removes its old selection, even though it has
  // rendered a replacement option with `aria-selected=true` (side-eye #355). Its input consequently omits
  // `aria-activedescendant`. The selected DOM row is cmdk's own roving-selection truth, so mirror only that
  // existing relation and observe the vendor's filtered mounts rather than owning keyboard navigation.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input === null) {
      return;
    }
    const root = input.closest("[cmdk-root]");
    if (root === null) {
      return;
    }
    const syncActiveDescendant = (): void => {
      const selected = root.querySelector<HTMLElement>('[cmdk-item][aria-selected="true"]');
      if (selected?.id === undefined || selected.id === "") {
        input.removeAttribute("aria-activedescendant");
      } else {
        input.setAttribute("aria-activedescendant", selected.id);
      }
    };
    syncActiveDescendant();
    const observer = new MutationObserver(syncActiveDescendant);
    observer.observe(root, { attributes: true, attributeFilter: ["aria-selected", "id"], childList: true, subtree: true });
    return (): void => observer.disconnect();
  }, []);

  return (
    <div className={slots.inputWrapper()} data-slot="command-input-wrapper">
      <Icon icon={Search} size="sm" />
      <BaseCommandInput className={cn(slots.input(), className)} data-slot="command-input" ref={inputRef} {...rest} />
    </div>
  );
}

export interface CommandListProps extends Omit<ComponentProps<typeof BaseCommandList>, "className">, Pick<VariantProps<typeof commandVariants>, "listSize"> {
  className?: string;
}

/** The scrollable listbox. Content-sized by default; bounded surfaces choose a declared list-size arm. */
export function CommandList({ className, listSize, ...rest }: CommandListProps): ReactElement {
  return <BaseCommandList className={cn(commandVariants({ listSize }).list(), className)} data-slot="command-list" {...rest} />;
}

/** An ALIAS, not an `extends`: `ButtonProps` is the icon-only-name union (§13.10 N1, #1021), and an
 *  interface cannot extend a union — nor should this wrapper weaken the requirement it forwards. */
export type CommandAuxiliaryButtonProps = ButtonProps;

/**
 * A non-option action mounted inside a Command root. The focused button owns Enter through its native
 * keyboard contract; cmdk must not translate that same key into activation of its roving selected item.
 * Space already stays native because cmdk does not consume it, and Escape keeps bubbling so the containing
 * command surface/dialog can close normally.
 */
export function CommandAuxiliaryButton(props: CommandAuxiliaryButtonProps): ReactElement {
  // Taken whole rather than destructured: a rest over the name union loses which arm the caller
  // satisfied, and the forwarded props would stop proving they carry a name.
  const handleKeyDown: NonNullable<ButtonBaseProps["onKeyDown"]> = (event): void => {
    props.onKeyDown?.(event);
    if (event.key === "Enter") {
      event.stopPropagation();
    }
  };
  // The handler lands AFTER the spread on purpose — the wrapper's Enter containment is the whole point
  // of the part, and a caller's own onKeyDown (which this handler already calls first) must not replace it.
  return <Button {...props} onKeyDown={handleKeyDown} />;
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

export interface CommandLoadingProps extends Omit<ComponentProps<typeof BaseCommandLoading>, "className"> {
  className?: string;
}

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
