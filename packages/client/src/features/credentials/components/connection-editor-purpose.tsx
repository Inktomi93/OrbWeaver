// The PURPOSE tier's two readings (inference program §5.3a · the step-3b mock `editor.html` Board A): the
// inferred-kind verdict and the servable-role rail. Apart from `connection-editor.tsx`;
// the tier's third row (the background switch) stays with the editor, because it is a
// plain field rather than a derived reading.

import type { DeclaredCapability, ModelKind } from "@orb/contracts/inference";
import { Badge } from "@orb/ui/badge";
import { Check, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useId } from "react";
import type { ServableRole } from "../lib/connection-editor-model.ts";
import { KIND_VERDICT_ITEMS, KIND_VERDICT_LABELS } from "../lib/connection-editor-model.ts";

/** The INFERRED-KIND VERDICT — a sentence with an inline change control, never a bare select. A "what is
 *  this model for?" combobox asks the user a question the system already has an opinion about, and the three
 *  options are unguessable before you see the guess. */
export function KindVerdict({
  kind,
  declared,
  busy,
  onChange,
}: {
  readonly kind: ModelKind;
  readonly declared: DeclaredCapability | null;
  readonly busy: boolean;
  readonly onChange: (kind: ModelKind) => void;
}): ReactElement {
  const labelId = useId();
  return (
    <Stack data-slot="connection-kind-verdict" gap="tight">
      <Row align="center" wrap={true} gap="field">
        <Text id={labelId} voice="label">
          This looks like a {KIND_VERDICT_LABELS[kind]} model:
        </Text>
        <Select
          aria-label="Change what this model is for"
          disabled={busy}
          items={KIND_VERDICT_ITEMS.map((item) => ({ label: item.label, value: item.value }))}
          onValueChange={(next): void => onChange(String(next) as ModelKind)}
          renderValue={(): ReactNode => "change"}
          value={declared?.kind ?? kind}
        />
      </Row>
      <Text voice="gloss">From the model id and what the server reported. Change it if it's wrong. Nothing else on this page depends on the guess.</Text>
    </Stack>
  );
}

/** The Purpose tier's notes (`purposeNotes`): each says what an unstated or guessed fact costs and where to
 *  state it. Nothing renders when the fold has nothing to say. */
export function PurposeNotes({ notes }: { readonly notes: readonly string[] }): ReactElement | null {
  if (notes.length === 0) {
    return null;
  }
  return (
    <Stack data-slot="connection-purpose-notes" gap="tight">
      {notes.map((note) => (
        <Text tone="warning" cap="prose" key={note} prose={true} voice="gloss">
          {note}
        </Text>
      ))}
    </Stack>
  );
}

/** The servable-role rail: one badge per Model-roles slot this connection can serve, and nothing for a slot it
 *  cannot. A chat model that cannot embed is not broken, so the rail does not say so; the verdict above
 *  already names what the model is for. A connection that serves no slot says that in a line, because an
 *  empty rail would read as a missing section. */
export function CapabilityRail({ roles }: { readonly roles: readonly ServableRole[] }): ReactElement {
  return (
    <Stack data-slot="connection-capability-rail" gap="tight">
      {roles.length === 0 ? (
        <Text voice="gloss">No role can use this connection as it is set up.</Text>
      ) : (
        <Row wrap={true} gap="field">
          {roles.map((role) => (
            <Badge key={role.task} size="sm" tone="success" variant="soft">
              <Icon icon={Check} size="sm" />
              {role.label}
            </Badge>
          ))}
        </Row>
      )}
    </Stack>
  );
}
