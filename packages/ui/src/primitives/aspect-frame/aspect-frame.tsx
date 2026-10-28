import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import type { MediaAspect } from "./aspect.ts";
import { aspectFrameVariants } from "./variants.ts";

export interface AspectFrameProps extends ComponentProps<"div">, VariantProps<typeof aspectFrameVariants> {
  readonly aspect: MediaAspect;
}

/** Reserve a named media ratio independently of decoding; the child owns its fit inside the frame. */
export function AspectFrame({ aspect, className, children, ...props }: AspectFrameProps): ReactElement {
  const slots = aspectFrameVariants({ aspect });
  return (
    <div {...props} className={cn(slots.root(), className)} data-aspect={aspect} data-slot="aspect-frame">
      <div className={slots.content()} data-slot="aspect-frame-content">
        {children}
      </div>
    </div>
  );
}
