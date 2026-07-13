// The bound FORM components (the save chrome): SubmitButton, DirtyPill, and the form-level error banner.
// State reads go through form.Subscribe — react-form re-exports only the deprecated useStore hook, and
// importing useSelector straight from @tanstack/react-store would be a phantom dep. DirtyPill reads
// `!isDefaultValue`, not raw `isDirty` (which never clears).

import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import type { ReactElement, ReactNode } from "react";
import { useFormContext } from "../contexts";
import { fieldErrorText } from "./field-error";

export interface SubmitButtonProps {
  readonly children?: ReactNode;
}

export function SubmitButton({ children }: SubmitButtonProps): ReactElement {
  const form = useFormContext();
  return (
    <form.Subscribe
      selector={(s): readonly [boolean, boolean] => [s.canSubmit, s.isSubmitting] as const}
    >
      {([canSubmit, isSubmitting]): ReactElement => (
        <Button type="submit" disabled={!canSubmit || isSubmitting} loading={isSubmitting}>
          {children ?? "Save"}
        </Button>
      )}
    </form.Subscribe>
  );
}

/** "Unsaved" chip — visible only while the values genuinely differ from the (re)baselined defaults. */
export function DirtyPill(): ReactElement {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(s): boolean => s.isDefaultValue}>
      {(isDefaultValue): ReactElement | null =>
        isDefaultValue ? null : <Badge intent="warning">Unsaved</Badge>
      }
    </form.Subscribe>
  );
}

/** The form-level error line (`errorMap.onSubmit` — server/cross-field validator `{ form }` messages). */
export function FormErrorBanner(): ReactElement {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(s): unknown => s.errorMap.onSubmit}>
      {(onSubmitError): ReactElement | null => {
        if (onSubmitError === undefined || onSubmitError === null) {
          return null;
        }
        const text =
          typeof onSubmitError === "string" ? onSubmitError : fieldErrorText([onSubmitError]);
        return text === null ? null : <Badge intent="danger">{text}</Badge>;
      }}
    </form.Subscribe>
  );
}
