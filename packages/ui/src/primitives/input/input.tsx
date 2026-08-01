import type { InputProps as BaseInputProps } from "@base-ui/react/input";
import { Input as BaseInput } from "@base-ui/react/input";
import type { ReactElement } from "react";
import { cn } from "#lib";
import { inputVariants } from "./variants";

export interface InputProps extends Omit<BaseInputProps, "type"> {
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
 * The text input — Base UI Input sealed behind the token skin; controlled-capable via
 * `value`/`onValueChange` passthrough and Field-aware for free (D42 §2 — Base UI seal).
 *
 * Usage: `<Input placeholder="Search…" value={query} onValueChange={setQuery} />`
 */
export function Input({ className, ...rest }: InputProps): ReactElement {
  return <BaseInput className={cn(inputVariants(), className)} data-slot="input-root" {...rest} />;
}
