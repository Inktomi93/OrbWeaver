import type { ComponentProps, ReactElement, ReactNode } from "react";
import type { VariantProps } from "tailwind-variants";
import { saveBarVariants } from "./variants";

export interface SaveBarProps extends Omit<ComponentProps<"div">, "title">, VariantProps<typeof saveBarVariants> {
  /** The entity/editor title (e.g. the character's name). */
  title: ReactNode;
  /** The entity kind label shown beside the title (e.g. "Character", "Preset"). */
  kind: ReactNode;
  className?: string;
}

/** Sticky editor footer/header chrome: title + kind label left, `children` docked right. Layout chrome only. */
export function SaveBar({ title, kind, sticky, className, children, ...props }: SaveBarProps): ReactElement {
  const slots = saveBarVariants({ sticky });
  return (
    <div {...props} className={slots.root({ className })} data-slot="save-bar-root">
      <div className={slots.label()} data-slot="save-bar-label">
        <span className={slots.title()} data-slot="save-bar-title">
          {title}
        </span>
        <span className={slots.kind()} data-slot="save-bar-kind">
          {kind}
        </span>
      </div>
      <div className={slots.actions()} data-slot="save-bar-actions">
        {children}
      </div>
    </div>
  );
}
