import { Select as BaseSelect } from "@base-ui/react/select";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
import { select } from "./variants";

// Breathing room between trigger and popup (a positioning input, not a styled length).
const POPUP_SIDE_OFFSET = 4;

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectProps {
  /** The options — `Select.Value` renders the selected option's label automatically. */
  items: readonly SelectOption[];
  /** Controlled value — pair with `onValueChange` (Base UI controlled passthrough). */
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
  placeholder?: ReactNode;
  disabled?: boolean;
  required?: boolean;
  /** Identifies the field when a form is submitted. */
  name?: string;
  /** Applied to the trigger (the in-flow element). */
  className?: string;
  id?: string;
}

/**
 * The single-value select — Base UI Select sealed with the full explicit anatomy
 * (Trigger/Value/Icon → Portal → Positioner → Popup → List/Item), so features never hand-assemble
 * parts (D42 §2 — Base UI seal; explicit Positioner kills the portal weirdness).
 *
 * Usage: `<Select items={models} placeholder="Pick a model" value={id} onValueChange={setId} />`
 */
export function Select({
  items,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  disabled = false,
  required = false,
  name,
  className,
  id,
}: SelectProps): ReactElement {
  const slots = select();
  return (
    <BaseSelect.Root
      defaultValue={defaultValue}
      disabled={disabled}
      items={items}
      name={name}
      onValueChange={(next: string | null): void => onValueChange?.(next)}
      required={required}
      value={value}
    >
      <BaseSelect.Trigger className={cn(slots.trigger(), className)} id={id}>
        <BaseSelect.Value placeholder={placeholder} />
        <BaseSelect.Icon className={slots.icon()}>
          <svg aria-hidden="true" fill="none" height="12" viewBox="0 0 12 12" width="12">
            <path
              d="M3 4.5 6 7.5l3-3"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          alignItemWithTrigger={false}
          className={slots.positioner()}
          sideOffset={POPUP_SIDE_OFFSET}
        >
          <BaseSelect.Popup className={slots.popup()}>
            <BaseSelect.List>
              {items.map((item) => (
                <BaseSelect.Item className={slots.item()} key={item.value} value={item.value}>
                  <BaseSelect.ItemText>{item.label}</BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator className={slots.itemIndicator()}>
                    <svg aria-hidden="true" fill="none" height="12" viewBox="0 0 12 12" width="12">
                      <path
                        d="m2.5 6.5 2.5 2.5 4.5-5"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
