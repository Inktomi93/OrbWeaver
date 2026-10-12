// Story wrapper for the FieldValidity CT (CT mounts from a non-test module). Playwright CT cannot
// mount an INLINE render-prop function passed at the mount() call site — children callbacks get
// proxied back to the Node test process for event-style assertions (e.g. onValueChange), not
// invoked in-browser to produce renderable JSX. The render-prop must be a real component closed
// over entirely within an importable module (ui-primitive-contract §4.4) — hence this fixture.
import { Field, FieldValidity } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import type { ReactElement } from "react";

const TOO_YOUNG = "13";

export function FieldValidityStory(): ReactElement {
  return (
    <Field label="Age" validate={(value): string | null => (value === TOO_YOUNG ? "Too young" : null)} validationMode="onChange">
      <Input />
      <FieldValidity>{(validity): ReactElement => <span>{validity.validity.valid === false ? "field is invalid" : "field is valid"}</span>}</FieldValidity>
    </Field>
  );
}
