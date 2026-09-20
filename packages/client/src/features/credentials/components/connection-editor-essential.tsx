// The ESSENTIAL tier's two non-trivial fields (inference program §5.3a · the step-3b mock `editor.html`
// Board A): the saved-on-blur text field the URL and the auto-minted name both use, and the MODEL field with
// its listed/typed fork. Split out of `connection-editor.tsx` at the `component-size` cap.

import type { UserConnectionId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";

/** A saved text field: uncontrolled, committed on BLUR. The row is the truth; the draft only exists between
 *  a keystroke and a blur, which is the window a controlled field would have to reconcile against a
 *  bus-driven refetch. */
export function SavedTextField({
  label,
  description,
  value,
  busy,
  onCommit,
}: {
  readonly label: string;
  readonly description: string;
  readonly value: string;
  readonly busy: boolean;
  readonly onCommit: (next: string) => void;
}): ReactElement {
  return (
    <Field description={description} label={label}>
      <Input
        autoComplete="off"
        defaultValue={value}
        disabled={busy}
        key={value}
        onBlur={(event): void => {
          const next = event.target.value.trim();
          if (next !== "" && next !== value) {
            onCommit(next);
          }
        }}
      />
    </Field>
  );
}

/** The MODEL field: the provider's own list when it has one, the typed fallback when it does not — and the
 *  typed fallback carries §5.3a's sentence VERBATIM, under the field where the decision was made, with its
 *  re-check action inside the notice. It ships today only as a subtitle clause on the list row
 *  (`typed model id — sent as-is`); the full sentence had no home. */
export function ModelField({
  connectionId,
  model,
  modelListed,
  host,
  busy,
  onCommit,
}: {
  readonly connectionId: UserConnectionId;
  readonly model: string;
  readonly modelListed: boolean;
  readonly host: string;
  readonly busy: boolean;
  readonly onCommit: (next: string) => void;
}): ReactElement {
  const trpc = useTRPC();
  // NON-suspense on purpose: a catalog read DIALS the provider (or the user's own box), and a failed dial is
  // the typed-id arm, not an error boundary for the whole editor.
  const catalog = useQuery({ ...trpc.connection.catalogModels.queryOptions({ connectionId }), retry: false });
  const listed = catalog.data ?? [];

  return (
    <Stack gap="tight">
      {listed.length === 0 ? (
        <SavedTextField busy={busy} description="The model id your server serves." label="Model" onCommit={onCommit} value={model} />
      ) : (
        <Field label="Model">
          <Select
            aria-label="Model"
            disabled={busy}
            items={listed.map((entry) => ({ label: entry.id, value: entry.id }))}
            onValueChange={(next): void => onCommit(String(next))}
            value={model}
          />
        </Field>
      )}
      {modelListed ? null : (
        <Stack data-slot="connection-model-unlisted" gap="tight">
          <Text className="text-warning" voice="gloss">
            This model id wasn't in {host}'s list. It'll be sent as-is; if the server doesn't have it, turns will fail.
          </Text>
          <Row gap="field">
            <Button disabled={catalog.isFetching} intent="secondary" onClick={(): void => void catalog.refetch()} size="sm">
              Check the list again
            </Button>
          </Row>
        </Stack>
      )}
    </Stack>
  );
}
