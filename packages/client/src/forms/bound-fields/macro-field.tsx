// Bound macro-aware textarea — useBoundField<string>() binding @orb/ui/macro-textarea inside <Field>.
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
import { useBoundField } from "./use-bound-field";

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

export function MacroField(props: MacroFieldProps): ReactElement {
  const { field, fieldProps } = useBoundField<string>(props);
  return (
    <>
      <Field {...fieldProps}>
        <MacroTextarea
          value={field.state.value}
          onChange={(next): void => {
            field.handleChange(next);
          }}
          onBlur={field.handleBlur}
          suggestions={props.suggestions}
          disabled={props.disabled ?? false}
          // A GHOST IS WHAT AN EMPTY FIELD SHOWS (side-eye F-3's second half). The browser never paints a
          // placeholder over a non-empty value, but the ATTRIBUTE stays in the a11y tree — so a template
          // field whose stored value happens to equal its own factory default carried the identical
          // 270-character string twice, once as the value and once as a description. Forwarding the ghost
          // only while the field is empty makes the tree say what the screen says.
          {...(props.placeholder === undefined || field.state.value !== "" ? {} : { placeholder: props.placeholder })}
          {...(props.rows === undefined ? {} : { rows: props.rows })}
          {...(props.className === undefined ? {} : { className: props.className })}
        />
      </Field>
      {props.showTokenCount === true ? (
        <Row gap="row" align="center" className="justify-end">
          <Text size="micro" tone="muted" className="font-mono">
            ~{estimateTokens(field.state.value)} tokens
          </Text>
        </Row>
      ) : null}
    </>
  );
}
