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
import { cn } from "#lib";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve Search/Icon fine (the spinner.tsx precedent).
import { Icon, Search } from "#primitives/icons";
import { commandVariants } from "./variants";

const slots = commandVariants();

export interface CommandProps extends Omit<ComponentProps<typeof BaseCommandRoot>, "className"> {
  className?: string;
  /**
   * Fires on Escape while focus is inside the root. cmdk has NO built-in close/escape behavior
   * (it is not its own overlay, R8 — verified against the shipped source: the root's `onKeyDown`
   * switch only handles Arrow/Home/End/Enter) — this is the seam a caller wires to clear the
   * query or close an enclosing Dialog/Popover. Deliberately does not call
   * `preventDefault`/`stopPropagation`, so an ancestor Base UI Dialog's native Escape-to-close
   * keeps working whether or not this is supplied.
   */
  onEscape?: () => void;
}

/**
 * The command-palette seal (D42 §2 — cmdk sealed behind `primitives/command/`, dep-cruiser
 * `ui-satellite-seals`). Domain-free: renders whatever `CommandGroup`/`CommandItem` tree the
 * caller supplies — the registry of actual commands/actions is app-level (client/features),
 * never here. Filtering, sorting, `loop`, vim bindings (ctrl+n/j/p/k), and the combobox/listbox
 * ARIA wiring (`role="combobox"` on the input, `role="listbox"` on the list,
 * `aria-activedescendant` roving) are cmdk's own — do not reimplement them (R1/R3).
 *
 * **Deliberate omission (R2 exception, documented):** `cmdk`'s `Command.Dialog` is skipped — it
 * renders through `@radix-ui/react-dialog`, a second modal/focus-trap implementation alongside
 * our own Base-UI-sealed `<Dialog>`/`<Popover>` (D42: Base UI is THE headless primitive). A future
 * omni-bar composes `<Dialog><Command>…</Command></Dialog>` (or `<Popover>`) at the client layer
 * instead — this seal is the list/input engine only, never the overlay chrome.
 *
 * Usage:
 * ```tsx
 * <Command label="Command palette" onEscape={close}>
 *   <CommandInput aria-label="Search commands" placeholder="Type a command…" />
 *   <CommandList>
 *     <CommandEmpty>No matching commands.</CommandEmpty>
 *     <CommandGroup heading="Files">
 *       <CommandItem onSelect={openFile} value="report.md">report.md</CommandItem>
 *     </CommandGroup>
 *   </CommandList>
 * </Command>
 * ```
 */
export function Command({ className, onEscape, onKeyDown, ...rest }: CommandProps): ReactElement {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    onKeyDown?.(event);
    if (event.key === "Escape") {
      onEscape?.();
    }
  };
  return (
    <BaseCommandRoot
      className={cn(slots.root(), className)}
      data-slot="command-root"
      onKeyDown={handleKeyDown}
      {...rest}
    />
  );
}

export interface CommandInputProps
  extends Omit<ComponentProps<typeof BaseCommandInput>, "className"> {
  className?: string;
}

/**
 * The search box — `role="combobox"` + `aria-controls`/`aria-activedescendant` wired by cmdk
 * (R1). The leading glyph is decorative (the input's accessible name comes from `aria-label`/
 * `<Field>` association, not the icon) — the lucide seal, never a hand-rolled `<svg>` (R3).
 * `<CommandInput aria-label="Search commands" placeholder="Type a command…" />`
 */
export function CommandInput({ className, ...rest }: CommandInputProps): ReactElement {
  return (
    <div className={slots.inputWrapper()} data-slot="command-input-wrapper">
      <Icon icon={Search} size="sm" />
      <BaseCommandInput
        className={cn(slots.input(), className)}
        data-slot="command-input"
        {...rest}
      />
    </div>
  );
}

export interface CommandListProps
  extends Omit<ComponentProps<typeof BaseCommandList>, "className"> {
  className?: string;
}

/**
 * The scrollable `role="listbox"` containing `CommandGroup`/`CommandItem`/`CommandSeparator`. No
 * height is forced — the caller bounds it via `className` (the virtual-list convention: an
 * unbounded parent is the caller's bug, not this seal's).
 * `<CommandList className="max-h-80"><CommandItem>…</CommandItem></CommandList>`
 */
export function CommandList({ className, ...rest }: CommandListProps): ReactElement {
  return (
    <BaseCommandList className={cn(slots.list(), className)} data-slot="command-list" {...rest} />
  );
}

export interface CommandEmptyProps
  extends Omit<ComponentProps<typeof BaseCommandEmpty>, "className"> {
  className?: string;
}

/**
 * Renders only when the filtered result count is zero (cmdk owns the count check, R1). Defaults
 * to a plain text line for a compact popup; compose `<EmptyState icon title description />` from
 * `@orb/ui/empty-state` as `children` instead when the palette is a full-page surface (an
 * omni-bar) that warrants the illustrated teaching-moment treatment.
 * `<CommandEmpty>No matching commands.</CommandEmpty>`
 */
export function CommandEmpty({ className, children, ...rest }: CommandEmptyProps): ReactElement {
  return (
    <BaseCommandEmpty className={cn(slots.empty(), className)} data-slot="command-empty" {...rest}>
      {children ?? "No results found."}
    </BaseCommandEmpty>
  );
}

export interface CommandGroupProps
  extends Omit<ComponentProps<typeof BaseCommandGroup>, "className"> {
  className?: string;
}

/**
 * A labeled section of items — grouped items are always shown/hidden together under a filter
 * (cmdk's grouping semantics, R1). cmdk renders the heading through a plain, unstyled internal
 * `<div>` (no className slot on that part) — the styled treatment is applied by wrapping `heading`
 * in a token-classed `<span>` here, the targeted workaround for the missing slot.
 * `<CommandGroup heading="Files"><CommandItem>…</CommandItem></CommandGroup>`
 */
export function CommandGroup({ className, heading, ...rest }: CommandGroupProps): ReactElement {
  const styledHeading: ReactNode =
    heading === undefined ? undefined : (
      <span className={slots.groupHeading()} data-slot="command-group-heading">
        {heading}
      </span>
    );
  return (
    <BaseCommandGroup
      className={cn(slots.group(), className)}
      data-slot="command-group"
      heading={styledHeading}
      {...rest}
    />
  );
}

export interface CommandItemProps
  extends Omit<ComponentProps<typeof BaseCommandItem>, "className"> {
  className?: string;
}

/**
 * A selectable command row — `role="option"`, active on pointer-enter or arrow-key roving
 * (`data-selected`), never receives real DOM focus (the roving-`aria-activedescendant` combobox
 * pattern, R1). Prefer an explicit `value` over relying on inferred children/textContent when the
 * item tree is built from a filtered/mapped array — cmdk infers `value` from rendered text ONLY
 * when omitted, and a changing textContent at a stable position needs the id-based `value` to
 * keep its identity (the same footgun class as `VirtualList`'s `getItemKey`).
 *
 * **Verified footgun (R6 — caught by a red test, not theorized):** cmdk's default filter scores
 * a query against `value` (and `keywords`), NEVER against the rendered children. An id-based
 * `value` (e.g. `file.id`, not human-readable) means typing the visible label matches NOTHING —
 * pass the display text via `keywords` alongside an id `value` so search still matches what the
 * user reads.
 * `<CommandItem keywords={[file.name]} onSelect={openFile} value={file.id}>{file.name}</CommandItem>`
 */
export function CommandItem({ className, ...rest }: CommandItemProps): ReactElement {
  return (
    <BaseCommandItem className={cn(slots.item(), className)} data-slot="command-item" {...rest} />
  );
}

export interface CommandSeparatorProps
  extends Omit<ComponentProps<typeof BaseCommandSeparator>, "className"> {
  className?: string;
}

/**
 * A divider between groups/items (`role="separator"`) — cmdk hides it automatically while a
 * search query is active unless `alwaysRender` is set (R1).
 * `<CommandSeparator />`
 */
export function CommandSeparator({ className, ...rest }: CommandSeparatorProps): ReactElement {
  return (
    <BaseCommandSeparator
      className={cn(slots.separator(), className)}
      data-slot="command-separator"
      {...rest}
    />
  );
}

export interface CommandLoadingProps
  extends Omit<ComponentProps<typeof BaseCommandLoading>, "className"> {
  className?: string;
}

/**
 * `role="progressbar"` shown while async suggestions load — render conditionally around it per
 * cmdk's contract (R2 full part surface: async command sources are a named consumer, not a
 * hypothetical).
 * `{isLoading && <CommandLoading label="Searching…" />}`
 */
export function CommandLoading({ className, ...rest }: CommandLoadingProps): ReactElement {
  return (
    <BaseCommandLoading
      className={cn(slots.loading(), className)}
      data-slot="command-loading"
      {...rest}
    />
  );
}

/**
 * Announces the live filtered-result count to screen readers (mirrors `AutocompleteResultStatus`
 * — the established `@orb/ui` precedent for a filterable listbox, ui-package-design §6.1). Reads
 * cmdk's OWN `useCommandState` selector so the count always matches the rendered list. Must
 * render under `<Command>`; place anywhere in its tree (context-only, no layout).
 * `<Command><CommandInput /><CommandStatus /><CommandList>…</CommandList></Command>`
 */
export function CommandStatus(): ReactElement {
  const count = useCommandState((state) => state.filtered.count);
  return (
    <div aria-live="polite" className={slots.status()} data-slot="command-status" role="status">
      {`${count} ${count === 1 ? "result" : "results"}`}
    </div>
  );
}
