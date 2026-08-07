import type { FieldControlProps as BaseFieldControlProps } from "@base-ui/react/field";
import { Field as BaseField } from "@base-ui/react/field";
import type { ComponentPropsWithRef, ReactElement } from "react";
import { cn } from "#lib";
import { textareaVariants } from "./variants.ts";

// `onValueChange` is PICKED from Field.Control's own props, never re-spelled: hand-writing
// `(value: string) => void` silently drops the second `Field.Control.ChangeEventDetails` argument
// (reason / cancel() / allowPropagation()), and a Base UI minor that adds a change reason would
// never reach this seal's callers. Same derive-never-respell rule as combobox/autocomplete.
export interface TextareaProps extends ComponentPropsWithRef<"textarea">, Pick<BaseFieldControlProps, "onValueChange"> {
  className?: string;
}

// Autosizes to its content via native CSS field-sizing: content. Rendered through Base UI
// Field.Control so inside a <Field> it registers with the field context (label/aria/validity);
// works standalone too — outside a Field.Root, Field.Control degrades to a plain control.
// `onValueChange` is Field.Control's native change arm (value + eventDetails); the DOM `onChange`
// still fires alongside it.
export function Textarea({ className, rows, style, onValueChange, onChange, ...rest }: TextareaProps): ReactElement {
  // `field-sizing: content` makes the browser IGNORE `rows` for sizing (it collapses to the content
  // height), so a `rows={3}` field renders as a single line. Re-floor the height off `rows` as a
  // min-height — content lines (n × 1lh) + block padding (2 × --spacing-field = py-field) + the 1px
  // border each side — so `rows` again means "at least n lines" while the field keeps auto-growing
  // past it. max() with --spacing-control-lg keeps the comfortable single-line control floor (e.g.
  // the composer's rows={1}) from shrinking below the shared field height.
  const rowsFloor = rows === undefined ? undefined : { minHeight: `max(var(--spacing-control-lg), calc(${rows} * 1lh + 2 * var(--spacing-field) + 2px))` };
  return (
    <BaseField.Control
      // Field.Control owns `onValueChange` natively (value + ChangeEventDetails) — ride it rather than
      // deriving the value from a hand-wrapped DOM onChange, which would drop the eventDetails arm.
      {...(onValueChange === undefined ? {} : { onValueChange })}
      render={
        <textarea
          {...(onChange === undefined ? {} : { onChange })}
          {...rest}
          className={cn(textareaVariants(), className)}
          data-slot="textarea-root"
          rows={rows}
          style={{ ...rowsFloor, ...style }}
        />
      }
    />
  );
}
