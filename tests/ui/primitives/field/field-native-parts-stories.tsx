import { CtIsolation } from "@orb/testkit/browser/ct-isolated-subject.tsx";
import { Field, FieldValidity } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import type { ReactElement } from "react";

export function FieldCustomValidityStory(): ReactElement {
  return (
    <CtIsolation subject="FieldValidity" isolates="Browser-owned validator and native Field control registration">
      <Field
        label="Age"
        description="Use your age in years"
        validationMode="onChange"
        validate={(value): string | null => (value === "13" ? "Too young" : null)}
      >
        <Input />
        <FieldValidity>
          {({ validity, error }): ReactElement => {
            let message = "unvalidated";
            if (validity.valid !== null) {
              message = validity.valid ? "valid" : error;
            }
            return <output aria-label="Age validity">{message}</output>;
          }}
        </FieldValidity>
      </Field>
    </CtIsolation>
  );
}

export function FieldNativeConstraintStory(): ReactElement {
  return (
    <CtIsolation subject="Field native constraints" isolates="Browser email and required validation propagated through FieldValidity">
      <Field label="Contact email" description="Where replies arrive" validationMode="onChange">
        <Input type="email" required={true} />
        <FieldValidity>
          {({ validity }): ReactElement => {
            let message = "unvalidated";
            if (validity.valid !== null) {
              message = validity.valid ? "valid" : "invalid";
            }
            if (validity.typeMismatch) {
              message = "type mismatch";
            }
            if (validity.valueMissing) {
              message = "missing";
            }
            return <output aria-label="Email validity">{message}</output>;
          }}
        </FieldValidity>
      </Field>
    </CtIsolation>
  );
}
