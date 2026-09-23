// The "Add a connection" dialog (inference program §5.3a, the Essential tier): provider (grouped picker from
// `providers.available`) · key pasted inline or the server URL · model (the model picker; an endpoint lists
// its `/v1/models` server-side on "List models", a hosted provider lists under its pasted API key the same way,
// and the built-in provider lists what this device runs the moment it is picked, all through
// `connection.draftCatalogModels`) · the `api` control only when the provider lists more than one · the
// background switch. The key is minted into a credential row FIRST (label = the connection's), then the
// connection row references it; `credentials.add` seals it at rest and no read ever echoes it. The
// Advanced/Diagnostics tiers live in the editor.
//
// A PARTIAL FAILURE IS STATED, AND THE RETRY DOES NOT MINT AGAIN. When the key is saved and the connection
// write then fails, the credential row exists and the dialog says so in words: where the key went, what failed,
// and what cancelling leaves behind. The pasted secret is cleared from the form the moment its row exists, the
// provider is locked to that row's provider, and the next submit writes only the connection.
//
// EVERY SUBMIT FAILURE IS STATED ONCE, INLINE (`AddConnectionFailure`). The dialog's mutations carry no toast;
// a refusal of the Server URL itself lands on that field instead. The statement takes focus when it appears
// (the submit may go disabled under the caret, and on a phone the statement is below the fold), and it is
// withdrawn at the first edit, because it describes the draft that was submitted, not the one being typed.

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
import { useEffect, useId, useState } from "react";
import { FormDialog, QueryBoundary } from "#components";
import type { Invalidation, Trpc } from "#data";
import { trpcErrorReason } from "#lib";
import { pushRecentModel } from "#state";
import { useAddConnectionForm } from "../hooks/use-add-connection-form.ts";
import { useAddCredentialOwned, useCreateConnectionOwned, useDraftCatalogModels } from "../hooks/use-connections-mutations.ts";
import type { AddConnectionFormValues } from "../lib/add-connection-form-model.ts";
import {
  acceptsKey,
  CONNECTION_FORM_COPY,
  draftKeyOf,
  draftModelReason,
  listsOnDemand,
  needsBaseUrl,
  sameFormValues,
  submitFailureSentence,
  URL_REFUSAL_CODES,
} from "../lib/add-connection-form-model.ts";
import { providerPickerItems } from "../lib/connections-model.ts";
import { failedCatalogSource, isListedModel, modelListSource } from "../lib/model-picker-model.ts";
import { AddConnectionFailure } from "./add-connection-failure.tsx";
import type { HeldKey } from "./add-connection-provider-fields.tsx";
import { ProviderFields } from "./add-connection-provider-fields.tsx";
import type { DraftListing } from "./draft-models-check.tsx";
import type { ModelPickerProps } from "./model-picker.tsx";

type CredentialView = inferOutput<Trpc["credentials"]["add"]>;
type ModelCatalogSource = ModelPickerProps["source"];

/** Whether the dialog itself reads this provider's list: an endpoint or a keyed hosted draft on "List models",
 *  and a built-in provider, whose catalog is closed, as soon as it is picked. */
function listsInDialog(provider: ProviderDef): boolean {
  return listsOnDemand(provider) || provider.catalog === "builtin";
}

/** The draft a list answer is about: the provider, plus the URL where the draft names one and the key where the
 *  list is read under it. A built-in list depends on the provider alone. */
function listingKeyFor(provider: ProviderDef, values: Pick<AddConnectionFormValues, "baseUrl" | "key">): string {
  return draftKeyOf({
    providerId: provider.id,
    baseUrl: needsBaseUrl(provider) ? values.baseUrl : "",
    key: provider.catalog === "builtin" ? "" : values.key,
  });
}

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
  const draftModels = useDraftCatalogModels(deps);
  const [listing, setListing] = useState<DraftListing | null>(null);
  const [held, setHeld] = useState<HeldKey | null>(null);
  // The failed submit's error itself (a caught value) and the draft it failed for, stated once inline by
  // `AddConnectionFailure` while the draft is unchanged.
  const [submitFailure, setSubmitFailure] = useState<{ readonly error: unknown; readonly values: AddConnectionFormValues } | null>(null);
  const failureId = useId();

  useEffect(() => {
    if (submitFailure !== null) {
      document.getElementById(failureId)?.focus();
    }
  }, [submitFailure, failureId]);

  /** The model picker's source for the current draft: the list read FOR this draft, otherwise the typed arm
   *  with the provider's reason. */
  const modelSourceFor = (provider: ProviderDef, values: Pick<AddConnectionFormValues, "baseUrl" | "key">): ModelCatalogSource => {
    if (listsInDialog(provider) && listing !== null && listing.forDraft === listingKeyFor(provider, values)) {
      return listing.source;
    }
    return { status: "unlisted", reason: draftModelReason(provider) };
  };

  /** A built-in provider's list, read keyless the moment it is picked. A late answer never replaces the listing
   *  of a draft picked after it. */
  const listBuiltin = (provider: ProviderDef): void => {
    const forDraft = listingKeyFor(provider, { baseUrl: "", key: "" });
    const answer = (source: ModelCatalogSource): void =>
      setListing((current) => (current === null || current.forDraft === forDraft ? { forDraft, source } : current));
    const retry = (): void => listBuiltin(provider);
    setListing({ forDraft, source: { status: "loading" } });
    void draftModels
      .mutateAsync({ providerId: provider.id })
      .then((result): void => answer(modelListSource(result, retry)))
      .catch((err: unknown): void => answer(failedCatalogSource(err, retry)));
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
      return held?.credential ?? null;
    }
    const label = values.label.trim();
    // Whatever the mint's outcome, its retained variables (the plaintext key) are dropped — `clearError` is the
    // mutation's `reset`. A failed mint leaves the key in the form field alone, for the user to correct.
    const credential = await addCredential.mutateAsync({ provider: provider.id, key, ...(label !== "" ? { label } : {}) }).finally(addCredential.clearError);
    // From here the dialog holds the ROW, never the secret: the form field is emptied, and an endpoint listing
    // taken for the keyed draft is re-keyed to the emptied field so the retry still judges against that list.
    const mintedDraft = listingKeyFor(provider, values);
    setListing((current) =>
      current !== null && current.forDraft === mintedDraft ? { ...current, forDraft: listingKeyFor(provider, { baseUrl: values.baseUrl, key: "" }) } : current,
    );
    form.setFieldValue("key", "");
    form.setFieldValue("keyHeld", true);
    setHeld({ credential, name: label === "" ? null : credential.label });
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
    // Recent holds models a connection was SAVED with, from the list; a pick alone never reorders the list.
    if (modelListed) {
      pushRecentModel(provider.id, values.model.trim());
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
          form.handleSubmit().catch((err: unknown) => setSubmitFailure({ error: err, values: form.state.values }));
        }}
      >
        <Stack gap="block">
          <form.AppField
            name="providerId"
            // The validator reads the auth KIND off the values (module scope, no registry in reach): derive it here.
            listeners={{
              onChange: ({ value }): void => {
                const provider = providerOf(value);
                form.setFieldValue("auth", provider?.auth ?? "");
                // A key or URL typed for one provider is never carried to the next: it would be saved under, and
                // sent to, a vendor it was not meant for.
                form.resetField("key");
                form.resetField("baseUrl");
                if (provider?.catalog === "builtin") {
                  listBuiltin(provider);
                }
              },
            }}
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

          <form.Subscribe selector={(state): AddConnectionFormValues => state.values}>
            {(values): ReactElement | null =>
              submitFailure === null || !sameFormValues(values, submitFailure.values) ? null : (
                <AddConnectionFailure
                  id={failureId}
                  sentence={submitFailureSentence({ heldKeyLabel: held === null ? undefined : held.name, reason: errorMessage(submitFailure.error) })}
                />
              )
            }
          </form.Subscribe>

          <Row gap="field" justify="end">
            <DialogClose render={<Button intent="ghost">Cancel</Button>} />
            <form.SubmitButton>{CONNECTION_FORM_COPY.submit}</form.SubmitButton>
          </Row>
        </Stack>
      </form>
    </form.AppForm>
  );
}
