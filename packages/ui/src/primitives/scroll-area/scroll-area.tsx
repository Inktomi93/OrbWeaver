import type {
  ScrollAreaRootProps as BaseRootProps,
  ScrollAreaViewportProps as BaseViewportProps,
} from "@base-ui/react/scroll-area";
import { ScrollArea as BaseScrollArea } from "@base-ui/react/scroll-area";
import type { ReactElement } from "react";
import { scrollAreaVariants } from "./variants";

const slots = scrollAreaVariants();

export interface ScrollAreaProps extends Omit<BaseRootProps, "className"> {
  className?: string;
  /** Class for the inner scrollable viewport (where `children` live). */
  viewportClassName?: string;
}

/**
 * A scroll region with custom, token-skinned scrollbars — seals Base UI ScrollArea (native scroll
 * physics preserved; the scrollbar/thumb overlay only appears where content overflows). Bundles
 * Root → Viewport(children) → Scrollbar(vertical + horizontal) → Thumb so the anatomy cannot be
 * mis-assembled. Set a bounded height/width on the root (`className`) to make it scroll.
 * `<ScrollArea className="h-[...]"><LongList/></ScrollArea>`
 * Spec: ui-package-design §6.1 — styled scrollbars for scroll REGIONS.
 */
export function ScrollArea(props: ScrollAreaProps): ReactElement {
  const { className, viewportClassName, children, ...rest } = props;
  return (
    <BaseScrollArea.Root
      className={slots.root({ className })}
      data-slot="scroll-area-root"
      {...rest}
    >
      <BaseScrollArea.Viewport
        className={slots.viewport({ className: viewportClassName })}
        data-slot="scroll-area-viewport"
      >
        {children}
      </BaseScrollArea.Viewport>
      <BaseScrollArea.Scrollbar
        className={slots.scrollbar()}
        data-slot="scroll-area-scrollbar"
        orientation="vertical"
      >
        <BaseScrollArea.Thumb className={slots.thumb()} data-slot="scroll-area-thumb" />
      </BaseScrollArea.Scrollbar>
      <BaseScrollArea.Scrollbar
        className={slots.scrollbar()}
        data-slot="scroll-area-scrollbar"
        orientation="horizontal"
      >
        <BaseScrollArea.Thumb className={slots.thumb()} data-slot="scroll-area-thumb" />
      </BaseScrollArea.Scrollbar>
    </BaseScrollArea.Root>
  );
}

export interface ScrollAreaViewportProps extends Omit<BaseViewportProps, "className"> {
  className?: string;
}
