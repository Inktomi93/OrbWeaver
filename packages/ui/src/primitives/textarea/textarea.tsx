import { Field as BaseField } from "@base-ui/react/field";
import type { ComponentPropsWithRef, ReactElement } from "react";
import { cn } from "#lib";
import { textareaVariants } from "./variants";

export interface TextareaProps extends ComponentPropsWithRef<"textarea"> {
  className?: string;
}

// Autosizes to its content via native CSS field-sizing: content. Rendered through Base UI
// Field.Control so inside a <Field> it registers with the field context (label/aria/validity);
// works standalone too — outside a Field.Root, Field.Control degrades to a plain control.
export function Textarea({ className, ...rest }: TextareaProps): ReactElement {
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
