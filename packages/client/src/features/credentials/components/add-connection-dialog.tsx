// The "Add a connection" dialog (inference program §5.3a, the Essential tier): provider (grouped picker from
// `providers.available`) · key pasted inline or the server URL · model (the model picker; an endpoint lists
// its `/v1/models` server-side, a hosted or built-in draft has no catalog read and types the id) · the `api`
// control only when the provider lists more than one · the background switch. The key is minted into a
// credential row FIRST (label = the connection's), then the connection row references it; `credentials.add`
// seals it at rest and no read ever echoes it. The Advanced/Diagnostics tiers live in the editor.
//
// A PARTIAL FAILURE IS STATED, AND THE RETRY DOES NOT MINT AGAIN. When the key is saved and the connection
// write then fails, the credential row exists and the dialog says so in words: where the key went, what failed,
// and what cancelling leaves behind. The pasted secret is cleared from the form the moment its row exists, the
// provider is locked to that row's provider, and the next submit writes only the connection.
//
// EVERY SUBMIT FAILURE IS STATED ONCE, INLINE (`AddConnectionFailure`). The dialog's mutations carry no toast;
// a refusal of the Server URL itself lands on that field instead.

import type { ProviderDef } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import { Button } from "@orb/ui/button";
import { DialogClose } from "@orb/ui/dialog";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, LockOpen } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { WebSpinner } from "@orb/ui/spinner";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialog, QueryBoundary } from "#components";
import type { Invalidation, Trpc } from "#data";
import { touchedFieldError } from "#forms/editor";
import { trpcErrorReason } from "#lib";
import { useAddConnectionForm } from "../hooks/use-add-connection-form.ts";
import { useAddCredentialOwned, useCreateConnectionOwned } from "../hooks/use-connections-mutations.ts";
import type { AddConnectionFormValues } from "../lib/add-connection-form-model.ts";
import {
  acceptsKey,
  CONNECTION_FORM_COPY,
  draftKeyOf,
  draftModelReason,
  modelIdExample,
  needsBaseUrl,
  needsKey,
  savedKeyName,
  submitFailureSentence,
  URL_REFUSAL_CODES,
} from "../lib/add-connection-form-model.ts";
import { CHAT_API_LABELS, connectionHost, providerPickerItems, showsApiControl } from "../lib/connections-model.ts";
import { isListedModel, typedModelAllowed } from "../lib/model-picker-model.ts";
import { AddConnectionFailure } from "./add-connection-failure.tsx";
import type { EndpointListing } from "./endpoint-models-check.tsx";
import { EndpointModelsCheck } from "./endpoint-models-check.tsx";
import type { ModelPickerProps } from "./model-picker.tsx";
import { ModelPicker } from "./model-picker.tsx";
import { SetupTokenCommand } from "./setup-token-command.tsx";

type CredentialView = inferOutput<Trpc["credentials"]["add"]>;
type ModelCatalogSource = ModelPickerProps["source"];

export interface AddConnectionDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

export function AddConnectionDialog({ open, onOpenChange, trpc, invalidation }: AddConnectionDialogProps): ReactElement {
  return (
    <FormDialog
      description="One provider, one model. Keys are encrypted at rest and never shown again."
      onOpenChange={onOpenChange}
      open={open}
      title="Add a connection"
    >
      {/* DELIBERATELY UNRESERVED (#1098): a dialog body sizes itself around its content. */}
      <QueryBoundary fallback={<WebSpinner label="Checking key storage…" />}>
        <AddConnectionGate trpc={trpc} invalidation={invalidation} onDone={(): void => onOpenChange(false)} />
      </QueryBoundary>
    </FormDialog>
  );
}

/** CREDENTIAL-STORAGE-SILENT-FAIL — ASK BEFORE COLLECTING: the deployment's SecretBox capability is read
 *  first and the INPUT refused, never the save, so nobody types a live key into a form that cannot keep it. */
function AddConnectionGate({
  trpc,
  invalidation,
  onDone,
}: {
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
  readonly onDone: () => void;
}): ReactElement {
  const { data: storage } = useSuspenseQuery(trpc.credentials.storageStatus.queryOptions());
  const { data: available } = useSuspenseQuery(trpc.connection.providersAvailable.queryOptions());
  if (!storage.enabled) {
    return (
      <EmptyState
        action={<DialogClose render={<Button intent="secondary">Close</Button>} />}
        icon={<Icon icon={LockOpen} size="md" />}
        title="Key storage is turned off on this server"
        description="No encryption key is configured, so a provider key saved here could not be stored. Set CREDENTIALS_KEY in the server environment (or CREDENTIALS_KEY_AUTO to have the server generate and persist one), restart, and add the connection then."
      />
    );
  }
  const providers = new Map(available.map((row) => [row.provider.id as string, row.provider]));
  return (
    <AddConnectionFormBody
      trpc={trpc}
      invalidation={invalidation}
      onDone={onDone}
      pickerItems={providerPickerItems(available)}
      providerOf={(id): ProviderDef | undefined => providers.get(id)}
    />
  );
}

interface FormBodyProps {
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
  readonly onDone: () => void;
  readonly pickerItems: SelectItems<string>;
  readonly providerOf: (id: string) => ProviderDef | undefined;
}

type CreateConnectionInput = inferInput<Trpc["connection"]["create"]>;

/** The `connection.create` input for a submitted draft. No secret rides it: the key is referenced by id. */
function connectionInput(args: {
  readonly provider: ProviderDef;
  readonly values: AddConnectionFormValues;
  readonly credentialId: CredentialView["id"] | null;
  readonly modelListed: boolean;
}): CreateConnectionInput {
  const { provider, values } = args;
  const label = values.label.trim();
  return {
    providerId: provider.id,
    credentialId: args.credentialId,
    baseUrl: needsBaseUrl(provider) ? values.baseUrl.trim() : null,
    model: values.model.trim(),
    ...(label !== "" ? { label } : {}),
    ...(values.api === "auto" ? {} : { api: values.api as ProviderDef["apis"][number] }),
    allowBackground: values.allowBackground,
    modelListed: args.modelListed,
  };
}

function AddConnectionFormBody({ trpc, invalidation, onDone, pickerItems, providerOf }: FormBodyProps): ReactElement {
  const deps = { trpc, invalidation };
  const addCredential = useAddCredentialOwned(deps);
  const createConnection = useCreateConnectionOwned(deps);
  const [listing, setListing] = useState<EndpointListing | null>(null);
  const [held, setHeld] = useState<CredentialView | null>(null);
  // The failed submit's error itself (a caught value), stated once inline by `AddConnectionFailure`.
  const [submitFailure, setSubmitFailure] = useState<{ readonly error: unknown } | null>(null);

  /** The model picker's source for the current draft: the endpoint's list when one was read FOR this draft,
   *  otherwise the typed arm with the provider's reason. */
  const modelSourceFor = (provider: ProviderDef, values: Pick<AddConnectionFormValues, "baseUrl" | "key">): ModelCatalogSource => {
    if (needsBaseUrl(provider) && listing !== null && listing.forDraft === draftKeyOf(values.baseUrl, values.key)) {
      return listing.source;
    }
    return { status: "unlisted", reason: draftModelReason(provider) };
  };

  /** A refusal of the Server URL itself goes on that field, where it is fixed; editing the URL clears it. */
  const markUrlRefused = (message: string | undefined): void => {
    form.setFieldMeta("baseUrl", (prev) => ({ ...prev, isTouched: true, errorMap: { ...prev.errorMap, onServer: message } }));
  };

  /** The credential for this submit: the row an earlier attempt already minted, else a fresh mint of the
   *  pasted key (with the connection's label, §5.3a Essential tier), else none. */
  const credentialFor = async (provider: ProviderDef, values: AddConnectionFormValues): Promise<CredentialView | null> => {
    const key = values.key.trim();
    if (held !== null || key === "" || !acceptsKey(provider)) {
      return held;
    }
    const label = values.label.trim();
    const credential = await addCredential.mutateAsync({ provider: provider.id, key, ...(label !== "" ? { label } : {}) });
    // From here the dialog holds the ROW, never the secret: the mutation's retained variables are dropped
    // (`clearError` is the mutation's `reset`), the form field is emptied, and an endpoint listing taken for
    // the keyed draft is re-keyed to the emptied field so the retry still judges the pick against that list.
    addCredential.clearError();
    const mintedDraft = draftKeyOf(values.baseUrl, values.key);
    setListing((current) => (current !== null && current.forDraft === mintedDraft ? { ...current, forDraft: draftKeyOf(values.baseUrl, "") } : current));
    form.setFieldValue("key", "");
    form.setFieldValue("keyHeld", true);
    setHeld(credential);
    return credential;
  };

  const save = async (values: AddConnectionFormValues): Promise<AddConnectionFormValues> => {
    const provider = providerOf(values.providerId);
    if (provider === undefined) {
      return values;
    }
    setSubmitFailure(null);
    // Read before the mint: the mint clears the key, which is half of the endpoint listing's draft key.
    const modelListed = isListedModel(modelSourceFor(provider, values), values.model);
    const credential = await credentialFor(provider, values);
    try {
      await createConnection.mutateAsync(connectionInput({ provider, values, credentialId: credential?.id ?? null, modelListed }));
    } catch (err) {
      if (URL_REFUSAL_CODES.has(trpcErrorReason(err))) {
        markUrlRefused(errorMessage(err));
      }
      throw err;
    }
    onDone();
    return values;
  };

  const { form } = useAddConnectionForm({ entityId: "add-connection", serverValues: undefined, save });

  return (
    <form.AppForm>
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          event.stopPropagation();
          form.handleSubmit().catch((err: unknown) => setSubmitFailure({ error: err }));
        }}
      >
        <Stack gap="block">
          <form.AppField
            name="providerId"
            // The validator reads the auth KIND off the values (module scope, no registry in reach): derive it here.
            listeners={{ onChange: ({ value }): void => form.setFieldValue("auth", providerOf(value)?.auth ?? "") }}
          >
            {(field): ReactElement => <field.SelectField label="Provider" items={pickerItems} placeholder="Pick a provider" disabled={held !== null} />}
          </form.AppField>

          <form.Subscribe selector={(state): AddConnectionFormValues => state.values}>
            {(values): ReactElement | null => {
              const provider = providerOf(values.providerId);
              return provider === undefined ? null : (
                <ProviderFields
                  form={form}
                  provider={provider}
                  trpc={trpc}
                  invalidation={invalidation}
                  held={held}
                  modelSource={modelSourceFor(provider, values)}
                  onListing={setListing}
                  onUrlRefusal={markUrlRefused}
                />
              );
            }}
          </form.Subscribe>

          <Text voice="gloss">Stored securely on this deployment; the key is sent only to the provider you chose.</Text>

          {submitFailure === null ? null : (
            <AddConnectionFailure
              sentence={submitFailureSentence({ heldKeyLabel: held === null ? undefined : held.label, reason: errorMessage(submitFailure.error) })}
            />
          )}

          <Row gap="field" justify="end">
            <DialogClose render={<Button intent="ghost">Cancel</Button>} />
            <form.SubmitButton>{CONNECTION_FORM_COPY.submit}</form.SubmitButton>
          </Row>
        </Stack>
      </form>
    </form.AppForm>
  );
}

type AddConnectionForm = ReturnType<typeof useAddConnectionForm>["form"];

interface ProviderFieldsProps {
  readonly form: AddConnectionForm;
  readonly provider: ProviderDef;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
  readonly held: CredentialView | null;
  readonly modelSource: ModelCatalogSource;
  readonly onListing: (listing: EndpointListing) => void;
  readonly onUrlRefusal: (message: string | undefined) => void;
}

/** The fields that depend on the PICKED provider's auth kind: URL and/or key, the model, the api control only
 *  when the row lists more than one, label and the background switch. */
function ProviderFields({ form, provider, trpc, invalidation, held, modelSource, onListing, onUrlRefusal }: ProviderFieldsProps): ReactElement {
  return (
    <>
      {needsBaseUrl(provider) ? (
        <form.AppField name="baseUrl" listeners={{ onChange: (): void => onUrlRefusal(undefined) }}>
          {(field): ReactElement => (
            <field.TextField
              label="Server URL"
              description={`The OpenAI-compatible base URL your ${provider.label} server answers on.`}
              placeholder="http://127.0.0.1:8000/v1"
              autoComplete="off"
            />
          )}
        </form.AppField>
      ) : null}
      {provider.auth === "oauthToken" && held === null ? <SetupTokenCommand /> : null}
      <KeyField form={form} provider={provider} held={held} />
      {needsBaseUrl(provider) ? (
        <form.Subscribe selector={(state): { readonly baseUrl: string; readonly key: string } => ({ baseUrl: state.values.baseUrl, key: state.values.key })}>
          {(draft): ReactElement => (
            <EndpointModelsCheck
              baseUrl={draft.baseUrl}
              heldCredentialId={held?.id ?? null}
              invalidation={invalidation}
              keyValue={draft.key}
              onListing={onListing}
              onUrlRefusal={onUrlRefusal}
              trpc={trpc}
            />
          )}
        </form.Subscribe>
      ) : null}
      <form.AppField name="model">
        {(field): ReactElement => (
          <ModelPicker
            error={touchedFieldError(field.state.meta)}
            listOwner={listOwnerOf(provider, form.state.values.baseUrl)}
            onValueChange={field.handleChange}
            placeholder={modelIdExample(provider)}
            recentKey={provider.id}
            source={modelSource}
            typedAllowed={typedModelAllowed(provider)}
            value={field.state.value}
          />
        )}
      </form.AppField>
      {showsApiControl(provider) ? (
        <form.AppField name="api">
          {(field): ReactElement => (
            <field.SelectField
              label="Protocol"
              items={[{ label: "Auto", value: "auto" }, ...provider.apis.map((api) => ({ label: CHAT_API_LABELS[api], value: api }))]}
            />
          )}
        </form.AppField>
      ) : null}
      <form.AppField name="label">
        {(field): ReactElement => (
          <field.TextField label="Label" hint={CONNECTION_FORM_COPY.labelHint} placeholder={`${provider.label} · …`} autoComplete="off" />
        )}
      </form.AppField>
      <form.AppField name="allowBackground">
        {(field): ReactElement => <field.SwitchField label={CONNECTION_FORM_COPY.backgroundLabel} description={CONNECTION_FORM_COPY.backgroundDescription} />}
      </form.AppField>
    </>
  );
}

/** The key step: the paste field, or — once this dialog saved the key — a line naming the saved row. */
function KeyField({
  form,
  provider,
  held,
}: {
  readonly form: AddConnectionForm;
  readonly provider: ProviderDef;
  readonly held: CredentialView | null;
}): ReactElement | null {
  if (held !== null) {
    return (
      <Text data-slot="add-connection-key-held" prose={true} voice="gloss">
        {savedKeyName(held.label)}. It won't be shown again.
      </Text>
    );
  }
  if (!acceptsKey(provider)) {
    return null;
  }
  return (
    <form.AppField name="key">
      {(field): ReactElement => (
        <field.TextField
          label={keyLabel(provider)}
          placeholder={provider.auth === "oauthToken" ? "Paste the token" : "Paste your API key"}
          type="password"
          revealable={true}
          autoComplete="off"
        />
      )}
    </form.AppField>
  );
}

function keyLabel(provider: ProviderDef): string {
  if (provider.auth === "oauthToken") {
    return "Setup token";
  }
  return needsKey(provider) ? "API key" : "API key (optional)";
}

/** Whose list the picker reads, in the user's words: an endpoint's host once a URL is typed, else the
 *  provider's label. */
function listOwnerOf(provider: ProviderDef, baseUrl: string): string {
  return (needsBaseUrl(provider) ? connectionHost(baseUrl.trim() === "" ? null : baseUrl.trim()) : null) ?? provider.label;
}
