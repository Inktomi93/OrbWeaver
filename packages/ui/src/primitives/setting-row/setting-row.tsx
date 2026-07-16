import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
import { Icon, Info } from "#primitives/icons";
import { Tooltip, TooltipPopup, TooltipTrigger } from "#primitives/tooltip";
import { settingRowVariants } from "./variants";

export interface SettingRowProps {
  /** The id shared with the caller's control — wires the `<label htmlFor>` to it. */
  id: string;
  label: ReactNode;
  /** Always-visible muted copy under the label; use `hint` instead for copy behind a hover tooltip. */
  description?: ReactNode;
  /** Hint copy behind an info-glyph tooltip; also becomes the glyph's accessible name. */
  hint?: string;
  /** A muted note rendered below the row — presence alone shows it (the "disabled, here's why" case). */
  disabledReason?: ReactNode;
  /** The control, docked right — any control sharing `id` (Switch, Select, Input, …). */
  children: ReactNode;
  className?: string;
}

/** Settings-surface row: label left (htmlFor-wired to the caller's control), control docked right. */
export function SettingRow({ id, label, description, hint, disabledReason, children, className }: SettingRowProps): ReactElement {
  const slots = settingRowVariants();
  return (
    <div className={cn(slots.root(), className)} data-slot="setting-row-root">
      <div className={slots.main()} data-slot="setting-row-main">
        <div className={slots.labelBlock()} data-slot="setting-row-label-block">
          <div className={slots.labelGroup()} data-slot="setting-row-label-group">
            <label className={slots.label()} data-slot="setting-row-label" htmlFor={id}>
              {label}
            </label>
            {hint === undefined ? null : (
              <Tooltip>
                <TooltipTrigger className={slots.hintTrigger()} data-slot="setting-row-hint-trigger">
                  <Icon icon={Info} label={hint} size="sm" />
                </TooltipTrigger>
                <TooltipPopup>{hint}</TooltipPopup>
              </Tooltip>
            )}
          </div>
          {description === undefined ? null : (
            <p className={slots.description()} data-slot="setting-row-description">
              {description}
            </p>
          )}
        </div>
        <div className={slots.control()} data-slot="setting-row-control">
          {children}
        </div>
      </div>
      {disabledReason === undefined ? null : (
        <p className={slots.disabledReason()} data-slot="setting-row-disabled-reason">
          {disabledReason}
        </p>
      )}
    </div>
  );
}
