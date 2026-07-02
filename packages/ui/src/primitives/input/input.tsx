import type { InputProps as BaseInputProps } from "@base-ui/react/input";
import { Input as BaseInput } from "@base-ui/react/input";
import type { ReactElement } from "react";
import { cn } from "#lib";
import { inputVariants } from "./variants";

export interface InputProps extends BaseInputProps {
  className?: string;
}

/**
 * The text input — Base UI Input sealed behind the token skin; controlled-capable via
 * `value`/`onValueChange` passthrough and Field-aware for free (D42 §2 — Base UI seal).
 *
 * Usage: `<Input placeholder="Search…" value={query} onValueChange={setQuery} />`
 */
export function Input({ className, ...rest }: InputProps): ReactElement {
  return <BaseInput className={cn(inputVariants(), className)} {...rest} />;
}
