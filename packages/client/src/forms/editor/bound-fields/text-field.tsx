// Bound text field — `useBoundField<string>()` + the `<Field>`-wrapped `<Input>`. CONTROLLED
// (`value=`, never `defaultValue=`) ALWAYS: an uncontrolled input ignores `form.reset(saved)` and
// reseeds, silently breaking the save/discard/reseed lifecycle (the
// ui-libraries example's `defaultValue` binding is the documented trap, INVERTED here on purpose).

import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Eye, EyeOff, Icon } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { useBoundField } from "./use-bound-field.ts";

export interface TextFieldProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  /** A hover-tip explainer beside the label (`@orb/ui/field` `hint`) — for copy that doesn't need to
   *  stay always-visible. */
  readonly hint?: ReactNode;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  /** Input rendering mode — `password` masks (the admin create/reset-password fields). Text-shaped
   *  values only; a number wants `NumberField`, not a widened `type` here. @defaultValue "text" */
  readonly type?: "text" | "password";
  /** A password field with an explicit show/hide control. Ignored for text fields. */
  readonly revealable?: boolean;
  /** Autofill hint forwarded to the native input (`"new-password"` on the admin password fields so a
   *  browser never offers the ADMIN'S saved login inside another user's form). */
  readonly autoComplete?: string;
}

export function TextField(props: TextFieldProps): ReactElement {
  const { field, fieldProps } = useBoundField<string>(props);
  const [revealed, setRevealed] = useState(false);
  const canReveal = props.type === "password" && props.revealable === true;
  return (
    <Field {...fieldProps}>
      <Row gap="field" align="center">
        <Input
          value={field.state.value}
          onChange={(e): void => {
            field.handleChange(e.target.value);
          }}
          onBlur={field.handleBlur}
          placeholder={props.placeholder}
          type={canReveal && revealed ? "text" : (props.type ?? "text")}
          autoComplete={props.autoComplete}
          disabled={props.disabled}
          className="min-w-0 flex-1"
        />
        {canReveal ? (
          <Button
            type="button"
            intent="ghost"
            size="glyph-md"
            aria-label={revealed ? "Hide key" : "Show key"}
            aria-pressed={revealed}
            disabled={props.disabled}
            onClick={(): void => setRevealed((current) => !current)}
          >
            <Icon icon={revealed ? EyeOff : Eye} size="sm" />
          </Button>
        ) : null}
      </Row>
    </Field>
  );
}
