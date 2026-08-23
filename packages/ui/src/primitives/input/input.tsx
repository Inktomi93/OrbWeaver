import type { InputProps as BaseInputProps } from "@base-ui/react/input";
import { Input as BaseInput } from "@base-ui/react/input";
import type { ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import { inputVariants } from "./variants.ts";

export interface InputProps extends Omit<BaseInputProps, "type">, VariantProps<typeof inputVariants> {
  className?: string;
  /**
   * The native input mode — TEXT-SHAPED values only.
   *
   * `"number"` is deliberately absent: numeric entry is the `NumberField` primitive everywhere (owner
   * ruling 2026-08-02), so `<Input type="number">` is a compile error and the tsc failure is the pointer.
   * A native number input carries a spinbutton role, browser-inconsistent spinners, and no clamp/format
   * story — `NumberField` owns all three plus the derived bounds description.
   *
   * The union is spelled out rather than `Exclude<HTMLInputTypeAttribute, "number">`: React's type
   * includes a `(string & {})` arm that swallows any literal, so an `Exclude` would narrow NOTHING. The
   * non-text families are covered by their own primitives (Checkbox, RadioGroup, Switch, Slider,
   * ColorField, FileTrigger/FileDropzone, Button).
   *
   * @defaultValue "text"
   */
  type?: "text" | "password" | "email" | "url" | "search" | "tel" | "date" | "datetime-local" | "month" | "time" | "week" | undefined;
}

/**
 * WHICH TYPES RENDER THEIR INTERIOR AS UA CHROME.
 *
 * The date family paints its own segmented editor (`::-webkit-datetime-edit`), so `placeholder` is inert on
 * it and an unset control prints the browser's bare `--------- ----` at FULL foreground — the loudest text in
 * a filter column, saying nothing (side-eye 2026-08-22 rail-chats P3, #522). CSS alone cannot ask "is this
 * empty": chromium matches NEITHER `:placeholder-shown` NOR `:invalid` on an empty date input (measured
 * 2026-08-22 — both `false` on `<input type="month">` with `value === ""`). So the primitive states the fact
 * as `data-empty` and `globals.css` tints the UA interior from it, in the SAME muted tone the `placeholder:`
 * base already gives every text input. The native picker itself is unchanged and deliberate — the record for
 * choosing it over a house primitive lives at the one call site that filters by month.
 *
 * A mapped Record over the `type` union, not a set of literals: a type added to `InputProps["type"]` fails
 * `tsc` here until it declares which side it is on (§5.5 string-union dispatch).
 */
const UA_RENDERED_INTERIOR: Record<NonNullable<InputProps["type"]>, boolean> = {
  date: true,
  "datetime-local": true,
  email: false,
  month: true,
  password: false,
  search: false,
  tel: false,
  text: false,
  time: true,
  url: false,
  week: true,
};

/**
 * The text input — Base UI Input sealed behind the token skin; controlled-capable via
 * `value`/`onValueChange` passthrough and Field-aware for free (D42 §2 — Base UI seal).
 *
 * Usage: `<Input placeholder="Search…" value={query} onValueChange={setQuery} />`
 */
export function Input({ className, layout, ...rest }: InputProps): ReactElement {
  const uaInteriorUnset = rest.type !== undefined && UA_RENDERED_INTERIOR[rest.type] && rest.value === "";
  return <BaseInput className={cn(inputVariants({ layout }), className)} data-slot="input-root" {...(uaInteriorUnset ? { "data-empty": "" } : {})} {...rest} />;
}
