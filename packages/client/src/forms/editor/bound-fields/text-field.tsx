// Bound text field — `useBoundField<string>()` + the `<Field>`-wrapped `<Input>`. CONTROLLED
// (`value=`, never `defaultValue=`) ALWAYS: an uncontrolled input ignores `form.reset(saved)` and
// reseeds, silently breaking the save/discard/reseed lifecycle (the
// ui-libraries example's `defaultValue` binding is the documented trap, INVERTED here on purpose).

import { Field } from "@orb/ui/field";
import { GlyphButton } from "@orb/ui/glyph-button";
import { Eye, EyeOff, Icon } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";
import type { BoundFieldShellProps } from "./use-bound-field.ts";
import { useBoundField } from "./use-bound-field.ts";

export interface TextFieldProps extends BoundFieldShellProps {
  readonly placeholder?: string;
  /** Input rendering mode — `password` masks (the admin create/reset-password fields). Text-shaped
   *  values only; a number wants `NumberField`, not a widened `type` here. @defaultValue "text" */
  readonly type?: "text" | "password";
  /** A password field with an explicit show/hide control. Ignored for text fields. */
  readonly revealable?: boolean;
  /** Autofill hint forwarded to the native input (`"new-password"` on the admin password fields so a
   *  browser never offers the ADMIN'S saved login inside another user's form). */
  readonly autoComplete?: string;
  /** A failure the form does not validate (a rejected fetch): the field reads as invalid. */
  readonly invalid?: boolean;
  /** The id of the element that states that failure; the input points at it. */
  readonly describedBy?: string;
}

export function TextField(props: TextFieldProps): ReactElement {
  const { field, fieldProps } = useBoundField<string>(props);
  const [revealed, setRevealed] = useState(false);
  const canReveal = props.type === "password" && props.revealable === true;
  return (
    <Field {...fieldProps} {...(props.invalid === undefined ? {} : { invalid: props.invalid })}>
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
          {...(props.describedBy === undefined ? {} : { "aria-describedby": props.describedBy })}
          disabled={props.disabled}
          className="flex-1 min-inline-0"
        />
        {canReveal ? (
          <GlyphButton
            type="button"
            variant="ghost"
            glyph="md"
            aria-label={revealed ? "Hide key" : "Show key"}
            aria-pressed={revealed}
            disabled={props.disabled}
            onClick={(): void => setRevealed((current) => !current)}
          >
            <Icon icon={revealed ? EyeOff : Eye} size="sm" />
          </GlyphButton>
        ) : null}
      </Row>
    </Field>
  );
}
