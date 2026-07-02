import type { ComponentProps, ReactElement, ReactNode } from "react";
import type { VariantProps } from "tailwind-variants";
import { saveBarVariants } from "./variants";

export interface SaveBarProps
  extends Omit<ComponentProps<"div">, "title">,
    VariantProps<typeof saveBarVariants> {
  /** The entity/editor title (e.g. the character's name). */
  title: ReactNode;
  /** The entity kind label shown beside the title (e.g. "Character", "Preset"). */
  kind: ReactNode;
  className?: string;
}

/**
 * SaveBar — sticky editor footer/header chrome (ui-package-design §6.1, work-order #22): title +
 * kind label on the left, `children` docked right (dirty indicator, discard, save — the CALLER
 * supplies these). This is layout chrome ONLY — no form/dirty state, no save handling; that
 * wiring lives in the client form factories (ui-package-design §6.2), never here.
 *
 * Usage: `<SaveBar title={name} kind="Character" sticky="footer"><DirtyPill/><Button>Save</Button></SaveBar>`.
 */
export function SaveBar({
  title,
  kind,
  sticky,
  className,
  children,
  ...props
}: SaveBarProps): ReactElement {
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
