// THE RENDER-HINT ROLE PICKER (#73, owner-ruled 2026-08-15). The raw JSON pane is the ONLY place a hint
// lands today (no per-node structured editor exists — the applicability fence: no new surface), so the
// picker's job is narrower than a full hint-authoring UI: it gives the author a TYPED source for the
// role STRING (autocomplete-safe, sourced from `RENDER_HINT_ROLES` the same way `FORGE_ARM_ITEMS` in the
// dialog derives from its own tuple) instead of hand-typing one of 8 magic strings into JSON, where a
// typo silently falls through to "no hint applied" (`render-plan.ts`'s own header: a malformed/unknown
// hint HEALS to no-hint, never a failure — so a typo is invisible, not refused). "Insert" writes the
// `x-orb-ui` hint OBJECT at the textarea's cursor, so the author positions inside the schema node they
// want to elevate and drops in a compiling, correctly-spelled hint rather than typing it freehand.
//
// Split out of `schema-editor-dialog.tsx` (component-size + form-factory-for-multifield gates, #73) — the
// hint-role state is self-contained here; the dialog owns only the JSON textarea ref + its setter.

import type { RenderHintRole } from "@orb/contracts/refinery";
import { RENDER_HINT_ROLES } from "@orb/contracts/refinery";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Row } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import type { Dispatch, ReactElement, RefObject, SetStateAction } from "react";
import { useState } from "react";

const RENDER_HINT_ROLE_ITEMS: SelectItems<string> = RENDER_HINT_ROLES.map((value) => ({ value, label: value }));
const RENDER_HINT_ROLE_QUESTION = "Render hint role";

/** Insert the `x-orb-ui` hint snippet for `role` at `textarea`'s cursor (or append, when unfocused —
 *  `selectionStart`/`End` default to the end of the value on an un-interacted control). Returns the new
 *  full text; the caller re-renders the textarea from it (a controlled component, never `execCommand`). */
function insertRenderHint(text: string, textarea: HTMLTextAreaElement | null, role: RenderHintRole): string {
  const snippet = `"x-orb-ui": { "role": "${role}" }`;
  if (textarea === null) {
    return `${text}${snippet}`;
  }
  return `${text.slice(0, textarea.selectionStart)}${snippet}${text.slice(textarea.selectionEnd)}`;
}

export interface RenderHintPickerProps {
  /** The JSON pane's textarea — read at insert time for the cursor position. */
  readonly schemaTextRef: RefObject<HTMLTextAreaElement | null>;
  readonly setSchemaText: Dispatch<SetStateAction<string>>;
}

export function RenderHintPicker({ schemaTextRef, setSchemaText }: RenderHintPickerProps): ReactElement {
  const [hintRole, setHintRole] = useState<RenderHintRole>(RENDER_HINT_ROLES[0]);
  return (
    <Row align="end" gap="field">
      <Field className="min-w-0 max-w-sm flex-1" label={RENDER_HINT_ROLE_QUESTION}>
        <Select
          aria-label={RENDER_HINT_ROLE_QUESTION}
          items={RENDER_HINT_ROLE_ITEMS}
          onValueChange={(value): void => {
            const next = RENDER_HINT_ROLES.find((role) => role === value);
            if (next !== undefined) {
              setHintRole(next);
            }
          }}
          value={hintRole}
        />
      </Field>
      <Button intent="secondary" onClick={(): void => setSchemaText((text) => insertRenderHint(text, schemaTextRef.current, hintRole))} size="sm">
        Insert render hint
      </Button>
    </Row>
  );
}
