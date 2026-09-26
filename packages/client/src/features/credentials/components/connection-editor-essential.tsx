// The ESSENTIAL tier's two non-trivial fields (inference program §5.3a · the step-3b mock `editor.html`
// Board A): the saved-on-blur text field the URL and the auto-minted name both use, and the MODEL field over
// the shared ModelPicker. Split out of `connection-editor.tsx` at the `component-size` cap.

import type { ModelCheck, ProviderDef } from "@orb/contracts/inference";
import type { UserConnectionId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "#data";
import { modelIdExample } from "../lib/add-connection-form-model.ts";
import { failedCatalogSource, modelCheckOf, modelListSource, typedModelAllowed } from "../lib/model-picker-model.ts";
import type { ModelPickerProps } from "./model-picker.tsx";
import { ModelPicker } from "./model-picker.tsx";

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

/** The MODEL field: the shared {@link ModelPicker} over this row's own list (`connection.catalogModels`). A list
 *  pick saves at once; a typed id saves when focus leaves the field, never per keystroke. `modelCheck` is
 *  what the list says about the saved id, so once the list has answered a stored check it contradicts is
 *  corrected, and a failed read corrects nothing: it is not a check. */
export function ModelField({
  connectionId,
  model,
  modelCheck,
  listOwner,
  provider,
  busy,
  onCommit,
}: {
  readonly connectionId: UserConnectionId;
  readonly model: string;
  readonly modelCheck: ModelCheck;
  /** Whose list this is, in the user's words — an endpoint's host, or the provider's label. */
  readonly listOwner: string;
  readonly provider: ProviderDef | undefined;
  readonly busy: boolean;
  readonly onCommit: (next: string, check: ModelCheck) => void;
}): ReactElement {
  const trpc = useTRPC();
  // NON-suspense on purpose: a catalog read DIALS the provider (or the user's own box), and a failed dial is
  // the typed-id arm, not an error boundary for the whole editor.
  const catalog = useQuery({ ...trpc.connection.catalogModels.queryOptions({ connectionId }), retry: false });
  const recheck = (): void => {
    catalog.refetch().catch(() => undefined); // the query's own error state carries the failure
  };
  const source = catalogSource(catalog, recheck);
  const checkNow = modelCheckOf(source, model);
  // The searchable list is on screen; an empty answer renders the typed field instead.
  const listShown = source.status === "listed" && source.models.length > 0;

  // The draft follows the saved row: an outside save (another tab, a list pick here) replaces it.
  const [draft, setDraft] = useState(model);
  const [savedSeen, setSavedSeen] = useState(model);
  if (model !== savedSeen) {
    setSavedSeen(model);
    setDraft(model);
  }

  const commit = (next: string): void => {
    const id = next.trim();
    if (id !== "" && id !== model) {
      onCommit(id, modelCheckOf(source, id));
    }
  };

  // One correction per list answer: a save that comes back unchanged must not write again.
  const correctedFor = useRef<number | null>(null);
  const answeredAt = catalog.dataUpdatedAt;
  useEffect(() => {
    if (checkNow !== "unchecked" && !busy && checkNow !== modelCheck && correctedFor.current !== answeredAt) {
      correctedFor.current = answeredAt;
      onCommit(model, checkNow);
    }
  }, [busy, checkNow, modelCheck, model, onCommit, answeredAt]);

  return (
    <Stack
      gap="tight"
      onBlur={(event): void => {
        // Focus leaving the whole field is the typed id's save; moving inside it is not.
        if (!event.currentTarget.contains(event.relatedTarget)) {
          commit(draft);
        }
      }}
    >
      <ModelPicker
        error={null}
        focusOnList={false}
        listOwner={listOwner}
        onValueChange={(next): void => {
          setDraft(next);
          // A list pick (a row, Enter, or "use as typed") is one deliberate choice: save it now.
          if (listShown) {
            commit(next);
          }
        }}
        placeholder={provider === undefined ? "" : modelIdExample(provider)}
        recentKey={provider?.id ?? ""}
        source={source}
        typedAllowed={provider === undefined || typedModelAllowed(provider)}
        value={draft}
      />
      {checkNow === "unlisted" ? (
        <Row gap="field">
          <Button disabled={catalog.isFetching} intent="secondary" onClick={recheck} size="sm">
            Check the list again
          </Button>
        </Row>
      ) : null}
    </Stack>
  );
}

/** The saved row's list read as the picker's source. */
function catalogSource(
  catalog: { readonly isError: boolean; readonly error: unknown; readonly data: Parameters<typeof modelListSource>[0] | undefined },
  retry: () => void,
): ModelPickerProps["source"] {
  if (catalog.isError) {
    return failedCatalogSource(catalog.error, retry);
  }
  return catalog.data === undefined ? { status: "loading" } : modelListSource(catalog.data, retry);
}
