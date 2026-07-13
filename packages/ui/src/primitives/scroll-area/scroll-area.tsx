import type {
  ScrollAreaRootProps as BaseRootProps,
  ScrollAreaViewportProps as BaseViewportProps,
} from "@base-ui/react/scroll-area";
import { ScrollArea as BaseScrollArea } from "@base-ui/react/scroll-area";
import type { ReactElement } from "react";
import { cn } from "#lib";
import { scrollAreaVariants } from "./variants";

const slots = scrollAreaVariants();

export interface ScrollAreaViewportProps extends Omit<BaseViewportProps, "className"> {
  className?: string;
}

export interface ScrollAreaProps extends Omit<BaseRootProps, "className"> {
  className?: string;
  viewportClassName?: string;
  /** Class for the sized `Content` wrapper (where `children` live). */
  contentClassName?: string;
  /** Props forwarded to the scrolling Viewport, not the Root — where `onScroll`/`ref` belong for autoscroll tracking. */
  viewportProps?: ScrollAreaViewportProps;
}

/**
 * A scroll region with custom, token-skinned scrollbars — seals Base UI ScrollArea. Bundles Root →
 * Viewport → Content(children) → Scrollbar(vertical + horizontal) → Thumb → Corner so the anatomy
 * cannot be mis-assembled. Set a bounded height/width on the root (`className`) to make it scroll.
 */
export function ScrollArea(props: ScrollAreaProps): ReactElement {
  const { className, viewportClassName, contentClassName, viewportProps, children, ...rest } =
    props;
  return (
    <BaseScrollArea.Root
      className={slots.root({ className })}
      data-slot="scroll-area-root"
      {...rest}
    >
      <BaseScrollArea.Viewport
        {...viewportProps}
        className={slots.viewport({
          className: cn(viewportClassName, viewportProps?.className),
        })}
        data-slot="scroll-area-viewport"
      >
        <BaseScrollArea.Content
          className={slots.content({ className: contentClassName })}
          data-slot="scroll-area-content"
        >
          {children}
        </BaseScrollArea.Content>
      </BaseScrollArea.Viewport>
      <BaseScrollArea.Scrollbar
        className={slots.scrollbar()}
        data-slot="scroll-area-scrollbar-vertical"
        orientation="vertical"
      >
        <BaseScrollArea.Thumb className={slots.thumb()} data-slot="scroll-area-thumb-vertical" />
      </BaseScrollArea.Scrollbar>
      <BaseScrollArea.Scrollbar
        className={slots.scrollbar()}
        data-slot="scroll-area-scrollbar-horizontal"
        orientation="horizontal"
      >
        <BaseScrollArea.Thumb className={slots.thumb()} data-slot="scroll-area-thumb-horizontal" />
      </BaseScrollArea.Scrollbar>
      <BaseScrollArea.Corner className={slots.corner()} data-slot="scroll-area-corner" />
    </BaseScrollArea.Root>
  );
}
