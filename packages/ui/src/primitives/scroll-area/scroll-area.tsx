import type { ScrollAreaRootProps as BaseRootProps, ScrollAreaViewportProps as BaseViewportProps } from "@base-ui/react/scroll-area";
import { ScrollArea as BaseScrollArea } from "@base-ui/react/scroll-area";
import type { ReactElement } from "react";
import { cn } from "#lib";
import { scrollAreaVariants } from "./variants.ts";

const slots = scrollAreaVariants();

export interface ScrollAreaViewportProps extends Omit<BaseViewportProps, "className"> {
  className?: string;
}

export interface ScrollAreaProps extends Omit<BaseRootProps, "className"> {
  className?: string;
  viewportClassName?: string;
  /** Class for the sized `Content` wrapper (where `children` live). */
  contentClassName?: string;
  /**
   * The child WRAPS instead of overflowing sideways — a `flex-wrap` rail, a prose column, anything whose
   * width is the viewport's. @defaultValue false
   *
   * Why it needs a prop at all: Base UI puts `min-width: fit-content` as an INLINE style on `Content` so a
   * horizontally overflowing child can measure past the viewport (its `min-w-max` class below is the same
   * intent). For a wrapping child that is exactly wrong — a flex row inside a fit-content box lays out at
   * MAX-content and therefore never wraps. Measured on the characters tag panel: 551 chips on one clipped
   * line behind a horizontal scrollbar, with the vertical cap working perfectly above it.
   * A className CANNOT express this. An inline style outranks any non-`!important` class, so the fix has to
   * be an inline style of our own — which is a decision about the SEAL, not something a call site should be
   * spelling with an `!important` escape hatch.
   */
  wrapContent?: boolean;
  /** Props forwarded to the scrolling Viewport, not the Root — where `onScroll`/`ref` belong for autoscroll tracking. */
  viewportProps?: ScrollAreaViewportProps;
}

/**
 * A scroll region with custom, token-skinned scrollbars — seals Base UI ScrollArea. Bundles Root →
 * Viewport → Content(children) → Scrollbar(vertical + horizontal) → Thumb → Corner so the anatomy
 * cannot be mis-assembled. Set a bounded height/width on the root (`className`) to make it scroll.
 */
export function ScrollArea(props: ScrollAreaProps): ReactElement {
  const { className, viewportClassName, contentClassName, viewportProps, wrapContent = false, children, ...rest } = props;
  return (
    <BaseScrollArea.Root className={slots.root({ className })} data-slot="scroll-area-root" {...rest}>
      <BaseScrollArea.Viewport
        {...viewportProps}
        className={slots.viewport({
          className: cn(viewportClassName, viewportProps?.className),
        })}
        data-slot="scroll-area-viewport"
      >
        <BaseScrollArea.Content
          className={slots.content({ className: cn(wrapContent ? "min-w-0" : undefined, contentClassName) })}
          data-slot="scroll-area-content"
          style={wrapContent ? { minWidth: 0 } : undefined}
        >
          {children}
        </BaseScrollArea.Content>
      </BaseScrollArea.Viewport>
      <BaseScrollArea.Scrollbar className={slots.scrollbar()} data-slot="scroll-area-scrollbar-vertical" orientation="vertical">
        <BaseScrollArea.Thumb className={slots.thumb()} data-slot="scroll-area-thumb-vertical" />
      </BaseScrollArea.Scrollbar>
      <BaseScrollArea.Scrollbar className={slots.scrollbar()} data-slot="scroll-area-scrollbar-horizontal" orientation="horizontal">
        <BaseScrollArea.Thumb className={slots.thumb()} data-slot="scroll-area-thumb-horizontal" />
      </BaseScrollArea.Scrollbar>
      <BaseScrollArea.Corner className={slots.corner()} data-slot="scroll-area-corner" />
    </BaseScrollArea.Root>
  );
}
