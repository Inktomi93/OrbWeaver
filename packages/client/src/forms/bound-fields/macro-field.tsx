// Bound macro-aware textarea — useFieldContext<string>() binding @orb/ui/macro-textarea inside <Field>.
// The macro catalog is passed in as `suggestions` (ui imports no domain registry). `showTokenCount`
// renders a live "~N tokens" line below the field, computed via the one kit estimator — promoted here
// instead of hand-assembled per call site.

import { estimateTokens } from "@orb/kit/tokens";
import { Field } from "@orb/ui/field";
import { Row } from "@orb/ui/layout";
import type { MacroSuggestion } from "@orb/ui/macro-textarea";
import { MacroTextarea } from "@orb/ui/macro-textarea";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useFieldContext } from "../contexts";
import { touchedFieldError } from "./field-error";

export interface MacroFieldProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  /** A hover-tip explainer beside the label (`@orb/ui/field` `hint`) — for copy that doesn't need to
   *  stay always-visible. */
  readonly hint?: ReactNode;
  /** The macro catalog to complete against on `{{` (app-level data — the field never imports a registry). */
  readonly suggestions: readonly MacroSuggestion[];
  readonly placeholder?: string;
  readonly rows?: number;
  readonly disabled?: boolean;
  /** Extra classes forwarded to the underlying textarea (e.g. a taller min-height). */
  readonly className?: string;
  /** Renders a live "~N tokens" line below the field (§6.3) — omit for fields that never reach the
   *  model (e.g. creatorNotes). @defaultValue false */
  readonly showTokenCount?: boolean;
}

export function MacroField({
  label,
  description,
  hint,
  suggestions,
  placeholder,
  rows,
  disabled,
  className,
  showTokenCount,
}: MacroFieldProps): ReactElement {
  const field = useFieldContext<string>();
  const error = touchedFieldError(field.state.meta);
  return (
    <>
      <Field
        label={label}
        description={description}
        hint={hint}
        error={error}
        disabled={disabled ?? false}
        name={field.name}
      >
        <MacroTextarea
          value={field.state.value}
          onChange={(next): void => {
            field.handleChange(next);
          }}
          onBlur={field.handleBlur}
          suggestions={suggestions}
          disabled={disabled ?? false}
          {...(placeholder === undefined ? {} : { placeholder })}
          {...(rows === undefined ? {} : { rows })}
          {...(className === undefined ? {} : { className })}
        />
      </Field>
      {showTokenCount === true ? (
        <Row gap="row" align="center" className="justify-end">
          <Text size="micro" tone="muted" className="font-mono">
            ~{estimateTokens(field.state.value)} tokens
          </Text>
        </Row>
      ) : null}
    </>
  );
}
