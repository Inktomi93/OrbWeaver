import type { ComponentPropsWithRef, ReactElement } from "react";
import { cn } from "#lib";
import { textarea } from "./variants";

export interface TextareaProps extends ComponentPropsWithRef<"textarea"> {
  className?: string;
}

/**
 * The multi-line text control — a plain styled `<textarea>` on the token skin, autosizing to its
 * content via native CSS `field-sizing: content` (D54 — no JS measuring). React 19 `ref` is a
 * plain prop. Standalone, or paired with `<Field>` by sharing an `id` with its label.
 *
 * Usage: `<Textarea placeholder="Describe the scene…" value={text} onChange={onChange} />`
 */
export function Textarea({ className, ...rest }: TextareaProps): ReactElement {
  return <textarea className={cn(textarea(), className)} {...rest} />;
}
