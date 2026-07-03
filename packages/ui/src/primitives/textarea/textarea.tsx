import { Field as BaseField } from "@base-ui/react/field";
import type { ComponentPropsWithRef, ReactElement } from "react";
import { cn } from "#lib";
import { textareaVariants } from "./variants";

export interface TextareaProps extends ComponentPropsWithRef<"textarea"> {
  className?: string;
}

/**
 * The multi-line text control — a styled `<textarea>` on the token skin, autosizing to its content
 * via native CSS `field-sizing: content` (D54 — no JS measuring). Rendered through Base UI
 * `Field.Control` so that inside a `<Field>` it REGISTERS with the field context: label association
 * (`htmlFor`↔`id`), `aria-describedby` to the description, and `data-invalid`/validity all flow
 * automatically (a plain `<textarea>` gets none of that). Works standalone too — outside a
 * `Field.Root`, `Field.Control` degrades to a plain control. React 19 `ref` is a plain prop.
 *
 * Usage: `<Field label="Bio"><Textarea value={text} onChange={onChange} /></Field>`
 */
export function Textarea({ className, ...rest }: TextareaProps): ReactElement {
  // The textarea-typed props ride the render element (Base UI merges its registration — id/aria/
  // data-invalid — onto it); Field.Control itself carries none, so its `<input>`-typed prop surface
  // never conflicts with the textarea's `onChange`/etc.
  return (
    <BaseField.Control
      render={
        <textarea
          {...rest}
          className={cn(textareaVariants(), className)}
          data-slot="textarea-root"
        />
      }
    />
  );
}
