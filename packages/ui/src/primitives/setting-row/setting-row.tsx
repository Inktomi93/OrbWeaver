import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve Info/Icon fine (the spinner.tsx precedent).
import { Icon, Info } from "#primitives/icons";
import { Tooltip, TooltipPopup, TooltipTrigger } from "#primitives/tooltip";
import { settingRowVariants } from "./variants";

export interface SettingRowProps {
  /** The id shared with the caller's control — wires the `<label htmlFor>` to it. */
  id: string;
  label: ReactNode;
  /** Hint copy behind an info-glyph tooltip; also becomes the glyph's accessible name. */
  hint?: string;
  /** A muted note rendered below the row — presence alone shows it (the "disabled, here's why" case). */
  disabledReason?: ReactNode;
  /** The control, docked right — any control sharing `id` (Switch, Select, Input, …). */
  children: ReactNode;
  className?: string;
}

/**
 * SettingRow — the settings-surface row: label left (htmlFor-wired to the caller's control),
 * control docked right, an optional info-glyph tooltip hint, and an optional
 * disabled-with-reason note (ui-package-design §6.1; work-order item 20). The control is a
 * plain slot — SettingRow only wires the label association via a shared `id`, so it stays
 * domain-agnostic across every settings surface (themes, automation budget, crew knobs,
 * plugin/admin).
 *
 * Usage: `<SettingRow id="auto-save" label="Auto-save" hint="Saves drafts every 30s">
 *   <Switch id="auto-save" checked={enabled} onCheckedChange={setEnabled} />
 * </SettingRow>`
 */
export function SettingRow({
  id,
  label,
  hint,
  disabledReason,
  children,
  className,
}: SettingRowProps): ReactElement {
  const slots = settingRowVariants();
  return (
    <div className={cn(slots.root(), className)} data-slot="setting-row-root">
      <div className={slots.main()} data-slot="setting-row-main">
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
