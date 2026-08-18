import type { ComponentProps, ReactElement, ReactNode } from "react";
import type { VariantProps } from "tailwind-variants";
import { saveBarVariants } from "./variants.ts";

export interface SaveBarProps extends Omit<ComponentProps<"div">, "title">, VariantProps<typeof saveBarVariants> {
  /** The entity/editor title (e.g. the character's name). */
  title: ReactNode;
  /** The entity kind label shown beside the title (e.g. "Character", "Preset"). */
  kind: ReactNode;
  /**
   * A DIAGNOSTIC about the entity (a token census, a byte size) — the datum that is useful when the bar has
   * room and must never be the reason the entity's NAME truncates. It rides its own slot, which sits inline
   * at the bar's end at `@md` and above and drops to a full-width line UNDER the identity below that, so a
   * phone renders the name whole and the census whole (side-eye 2026-08-18 P1-4 — the shipped bar clipped
   * "Sabine Veyra" to "Sabin…" so `1257 total · 1017 permanent` could print in full).
   *
   * Distinct from `children`, which is the bar's CONTROLS (save status, buttons) and keeps its width.
   */
  meta?: ReactNode;
  className?: string;
}

/** Sticky editor footer/header chrome: title + kind label left, an optional `meta` diagnostic, `children`
 *  docked right. Layout chrome only. */
export function SaveBar({ title, kind, meta, sticky, className, children, ...props }: SaveBarProps): ReactElement {
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
      {meta === undefined ? null : (
        <div className={slots.meta()} data-slot="save-bar-meta">
          {meta}
        </div>
      )}
      <div className={slots.actions()} data-slot="save-bar-actions">
        {children}
      </div>
    </div>
  );
}
