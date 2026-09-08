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
  /**
   * The CEILING on the autosize, in lines — the exact counterpart of `rows` (which is only a FLOOR under
   * `field-sizing: content`). Past it the box stops growing and scrolls internally. Absent = uncapped,
   * which is the native behavior and correct for a control whose content is short by construction.
   */
  maxRows?: number;
}

// Autosizes to its content via native CSS field-sizing: content. Rendered through Base UI
// Field.Control so inside a <Field> it registers with the field context (label/aria/validity);
// works standalone too — outside a Field.Root, Field.Control degrades to a plain control.
// `onValueChange` is Field.Control's native change arm (value + eventDetails); the DOM `onChange`
// still fires alongside it.
/** The line-box height of `n` rendered lines plus the control's own chrome — content (n × 1lh) + block
 *  padding (2 × --spacing-field = py-field) + the 1px border each side. The ONE formula both the `rows`
 *  floor and the `maxRows` ceiling are built from, so the two axes cannot drift into measuring the box
 *  differently (a ceiling one padding-unit off a floor is a field that scrolls at its own minimum). */
function lineBoxHeight(lines: number): string {
  return `calc(${lines} * 1lh + 2 * var(--spacing-field) + 2px)`;
}

export function Textarea({ className, rows, maxRows, style, onValueChange, onChange, ...rest }: TextareaProps): ReactElement {
  // `field-sizing: content` makes the browser IGNORE `rows` for sizing (it collapses to the content
  // height), so a `rows={3}` field renders as a single line. Re-floor the height off `rows` as a
  // min-height so `rows` again means "at least n lines" while the field keeps auto-growing past it.
  // max() with --spacing-control-lg keeps the comfortable single-line control floor (e.g. the composer's
  // rows={1}) from shrinking below the shared field height.
  const rowsFloor = rows === undefined ? undefined : { minHeight: `max(var(--spacing-control-lg), ${lineBoxHeight(rows)})` };
  // …AND THE CEILING (`maxRows`), the half that was missing. `field-sizing: content` grows without bound,
  // so a long stored value renders the WHOLE thing as one box: a 4500-character prose override measured
  // 2333px in a 720px viewport, which pushes the field's own counter, error and save status ~900px below
  // the fold — a refusal the author cannot see is a save that silently stopped working. A max-height in
  // the same line-box unit turns the overflow into the textarea's own scroll, so the text stays fully
  // reachable and the affordances under the box stay where the author is looking.
  const rowsCeiling = maxRows === undefined ? undefined : { maxHeight: lineBoxHeight(maxRows) };
  return (
    <BaseField.Control
      // Field.Control owns `onValueChange` natively (value + ChangeEventDetails) — ride it rather than
      // deriving the value from a hand-wrapped DOM onChange, which would drop the eventDetails arm.
      {...(onValueChange === undefined ? {} : { onValueChange })}
      render={
        <textarea
          {...(onChange === undefined ? {} : { onChange })}
          {...rest}
          // The scroll is explicit rather than left to the UA default: `overflow: auto` is a textarea's
          // native behavior, but the skin is composed from utilities and a future `overflow-hidden` in the
          // shared FIELD_CONTROL would silently turn the cap into a CLIP — text gone with no scrollbar.
          className={cn(textareaVariants(), maxRows === undefined ? undefined : "relative overflow-y-auto overscroll-contain", className)}
          data-slot="textarea-root"
          rows={rows}
          style={{ ...rowsFloor, ...rowsCeiling, ...style }}
        />
      }
    />
  );
}
