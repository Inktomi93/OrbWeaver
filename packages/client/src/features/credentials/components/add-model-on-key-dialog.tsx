// "Add another model on this key" (inference program §5.3a, the second no-defaults survivability action;
// `docs/design/mocks/connections/list.html` Board B). Opened from a saved connection's row menu, it pre-fills
// everything the new row shares with that one — provider, credential, and for an endpoint row its URL, api and
// transport — and lands on the model picker. The catalog is the saved row's own `connection.catalogModels`:
// the new row reads the same key against the same provider, so that list is exactly what the key can reach.
//
// A failed or empty catalog is the picker's typed arm, never an error boundary for the dialog: the read dials
// the provider (or the user's own box), and a model can still be named by id where policy permits it.

import type { ProviderDef } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import { Button } from "@orb/ui/button";
import { DialogClose } from "@orb/ui/dialog";
import { Row, Stack } from "@orb/ui/layout";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { FormDialog, QueryBoundary } from "#components";
import type { Invalidation, Trpc } from "#data";
import { touchedFieldError } from "#forms/editor";
import { notify } from "#lib";
import { useAddModelOnKeyForm } from "../hooks/use-add-model-on-key-form.ts";
import { useCreateConnection } from "../hooks/use-connections-mutations.ts";
import { CONNECTION_FORM_COPY, modelIdExample } from "../lib/add-connection-form-model.ts";
import type { AddModelOnKeyFormValues, addModelScope } from "../lib/add-model-on-key-form-model.ts";
import { addModelActionGloss, addModelActionLabel } from "../lib/add-model-on-key-form-model.ts";
import { connectionHost } from "../lib/connections-model.ts";
import { failedCatalogSource, isListedModel, modelListSource, typedModelAllowed } from "../lib/model-picker-model.ts";
import type { ModelPickerProps } from "./model-picker.tsx";
import { ModelPicker } from "./model-picker.tsx";

type ConnectionListItem = inferOutput<Trpc["connection"]["list"]>[number];
type AddModelScope = NonNullable<ReturnType<typeof addModelScope>>;
type ModelCatalogSource = ModelPickerProps["source"];

export interface AddModelOnKeyDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The saved row the new connection copies its provider, key and address from. */
  readonly connection: ConnectionListItem;
  readonly provider: ProviderDef;
  readonly scope: AddModelScope;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

export function AddModelOnKeyDialog({ open, onOpenChange, connection, provider, scope, trpc, invalidation }: AddModelOnKeyDialogProps): ReactElement {
  return (
    <FormDialog description={addModelActionGloss(scope, provider.label)} onOpenChange={onOpenChange} open={open} title={addModelActionLabel(scope)}>
      <AddModelOnKeyBody connection={connection} invalidation={invalidation} onDone={(): void => onOpenChange(false)} provider={provider} trpc={trpc} />
    </FormDialog>
  );
}

function AddModelOnKeyBody({
  connection,
  provider,
  trpc,
  invalidation,
  onDone,
}: {
  readonly connection: ConnectionListItem;
  readonly provider: ProviderDef;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
  readonly onDone: () => void;
}): ReactElement {
  const queryClient = useQueryClient();
  const createConnection = useCreateConnection({ trpc, invalidation });
  const catalogKey = trpc.connection.catalogModels.queryKey({ connectionId: connection.id });

  const save = async (values: AddModelOnKeyFormValues): Promise<AddModelOnKeyFormValues> => {
    const catalog = queryClient.getQueryData(catalogKey);
    const source: ModelCatalogSource = catalog === undefined ? { status: "loading" } : modelListSource(catalog, null);
    const label = values.label.trim();
    await createConnection.mutateAsync({
      providerId: connection.providerId,
      credentialId: connection.credentialId,
      baseUrl: connection.baseUrl,
      api: connection.api,
      transport: connection.transport,
      model: values.model.trim(),
      ...(label !== "" ? { label } : {}),
      allowBackground: values.allowBackground,
      modelListed: isListedModel(source, values.model),
    });
    onDone();
    return values;
  };

  const { form } = useAddModelOnKeyForm({ entityId: `add-model-on-key-${connection.id}`, serverValues: undefined, save });
  const listOwner = connectionHost(connection.baseUrl) ?? provider.label;

  return (
    <form.AppForm>
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          event.stopPropagation();
          form.handleSubmit().catch((err: unknown) => notify.error({ title: CONNECTION_FORM_COPY.submitFailed, description: errorMessage(err) }));
        }}
      >
        <Stack gap="block">
          <form.AppField name="model">
            {(field): ReactElement => {
              const picker: Omit<ModelPickerProps, "source"> = {
                currentModel: connection.model,
                error: touchedFieldError(field.state.meta),
                listOwner,
                onValueChange: field.handleChange,
                placeholder: modelIdExample(provider),
                recentKey: provider.id,
                typedAllowed: typedModelAllowed(provider),
                value: field.state.value,
              };
              return (
                <QueryBoundary
                  fallback={<ModelPicker {...picker} source={{ status: "loading" }} />}
                  renderError={(error, retry): ReactElement => <ModelPicker {...picker} source={failedCatalogSource(error, retry)} />}
                >
                  <SavedCatalogPicker connectionId={connection.id} picker={picker} trpc={trpc} />
                </QueryBoundary>
              );
            }}
          </form.AppField>
          <form.AppField name="label">
            {(field): ReactElement => (
              <field.TextField label="Label" hint={CONNECTION_FORM_COPY.labelHint} placeholder={`${provider.label} · …`} autoComplete="off" />
            )}
          </form.AppField>
          <form.AppField name="allowBackground">
            {(field): ReactElement => (
              <field.SwitchField label={CONNECTION_FORM_COPY.backgroundLabel} description={CONNECTION_FORM_COPY.backgroundDescription} />
            )}
          </form.AppField>
          <Row gap="field" justify="end">
            <DialogClose render={<Button intent="ghost">Cancel</Button>} />
            <form.SubmitButton>{CONNECTION_FORM_COPY.submit}</form.SubmitButton>
          </Row>
        </Stack>
      </form>
    </form.AppForm>
  );
}

/** The saved row's catalog, read through the one catalog door. `retry: false`: a failed or empty list is the
 *  typed arm with its own "Try the list again", not three silent re-dials behind a skeleton. */
function SavedCatalogPicker({
  connectionId,
  picker,
  trpc,
}: {
  readonly connectionId: ConnectionListItem["id"];
  readonly picker: Omit<ModelPickerProps, "source">;
  readonly trpc: Trpc;
}): ReactElement {
  const catalog = useSuspenseQuery({ ...trpc.connection.catalogModels.queryOptions({ connectionId }), retry: false });
  // `refetch` resolves with the query's own state (a failed read lands in `catalog`, not a rejection).
  const retry = (): void => void catalog.refetch();
  return <ModelPicker {...picker} source={catalog.isRefetching ? { status: "loading" } : modelListSource(catalog.data, retry)} />;
}
