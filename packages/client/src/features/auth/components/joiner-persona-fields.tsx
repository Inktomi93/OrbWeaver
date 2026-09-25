// D259 — the persona a sign-up joiner names before their account and seat exist. Both signup doors (the local
// form and the OIDC pending-join card) render these fields, and the server creates the persona in the same batch
// that seats the account as it, so the joiner's first message never goes out without a name.

import { JOINER_PERSONA_DESCRIPTION_MAX } from "@orb/contracts/persona";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement } from "react";
import { testId } from "#lib";

export interface JoinerPersonaFieldsProps {
  readonly name: string;
  /** The name's error, once the form has shown its errors; null while there is none to show. */
  readonly nameError?: string | null;
  readonly description: string;
  readonly onNameChange: (name: string) => void;
  readonly onDescriptionChange: (description: string) => void;
}

/** The persona name and its optional description. */
export function JoinerPersonaFields({ name, nameError = null, description, onNameChange, onDescriptionChange }: JoinerPersonaFieldsProps): ReactElement {
  return (
    <Stack gap="block" data-testid={testId("joinerPersona")}>
      <Field label="Your name in the story" description="Characters see and address you by this name. You can change it later." error={nameError}>
        <Input autoComplete="off" required={true} value={name} onValueChange={onNameChange} data-testid={testId("joinerPersonaName")} />
      </Field>
      <Field label="Description" description="Optional: how characters should picture you.">
        <Textarea value={description} maxLength={JOINER_PERSONA_DESCRIPTION_MAX} onChange={(event): void => onDescriptionChange(event.target.value)} />
      </Field>
    </Stack>
  );
}
