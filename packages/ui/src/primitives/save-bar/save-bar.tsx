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
        {/* The editor/entity title is the detail pane's section heading — a real <h2> so SR heading-nav
            can jump to it (the LIST panel titles are h2 too; the Settings modal's h2/h3 is the template). */}
        <h2 className={slots.title()} data-slot="save-bar-title">
          {title}
        </h2>
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
