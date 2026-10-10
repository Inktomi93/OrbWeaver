// Button-gated connection authoring; selected saved keys stay metadata-only and catalog answers name their exact draft.

import type { CredentialView } from "@orb/contracts/credentials";
import type { ModelCheck, ProviderDef } from "@orb/contracts/inference";
import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import { Button } from "@orb/ui/button";
import { DialogClose } from "@orb/ui/dialog";
import { Row, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useEffect, useId, useState } from "react";
import type { Invalidation, Trpc } from "#data";
import { trpcErrorReason } from "#lib";
import { pushRecentModel } from "#state";
import { useAddConnectionForm } from "../hooks/use-add-connection-form.ts";
import { useAddCredentialOwned, useCreateConnection, useDraftCatalogModels } from "../hooks/use-connections-mutations.ts";
import { useSignInCheckAfterSave } from "../hooks/use-sign-in-check.ts";
import type { AddConnectionFormValues } from "../lib/add-connection-form-model.ts";
import {
  acceptsKey,
  CONNECTION_FORM_COPY,
  draftModelReason,
  keyStorageBlocks,
  listingKeyFor,
  listsInDialog,
  needsBaseUrl,
  SAVED_KEY_UNAVAILABLE,
  sameFormValues,
  submitFailureSentence,
  URL_REFUSAL_CODES,
} from "../lib/add-connection-form-model.ts";
import { endpointAuthorityOf } from "../lib/connection-editor-model.ts";
import { failedCatalogSource, modelCheckOf, modelListSource } from "../lib/model-picker-model.ts";
import { AddConnectionFailure } from "./add-connection-failure.tsx";
import type { HeldKey } from "./add-connection-provider-fields.tsx";
import { ProviderFields } from "./add-connection-provider-fields.tsx";
import type { DraftListing } from "./draft-models-check.tsx";
import type { ModelPickerProps } from "./model-picker.tsx";

type ModelCatalogSource = ModelPickerProps["source"];
type ConnectionView = inferOutput<Trpc["connection"]["create"]>;
const UTILITY_BACKGROUND_NOTE = "Allow background work is on for this connection, so it can run your summaries, captions and extraction.";

/** Metadata-only credential choices and the dialog's composition dependencies. */
export interface AddConnectionFormBodyProps {
  readonly credentials: readonly CredentialView[];
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
  readonly purpose: "connection" | "utility";
  readonly onSaved: (created: ConnectionView) => void;
  readonly onCancel: (() => void) | undefined;
  /** The deployment can store a secret; off ⇒ a provider that needs one cannot be added. */
  readonly keyStorage: boolean;
  readonly pickerItems: SelectItems<string>;
  readonly providerOf: (id: string) => ProviderDef | undefined;
}

type CreateConnectionInput = inferInput<Trpc["connection"]["create"]>;

/** The `connection.create` input for a submitted draft. No secret rides it: the key is referenced by id. */
function connectionInput(args: {
  readonly provider: ProviderDef;
  readonly values: AddConnectionFormValues;
  readonly credentialId: CredentialView["id"] | null;
  readonly modelCheck: ModelCheck;
  readonly purpose: AddConnectionFormBodyProps["purpose"];
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
    allowBackground: args.purpose === "utility" || values.allowBackground,
    modelCheck: args.modelCheck,
  };
}

/** Retains minted credentials across partial-write retries instead of minting another key. */
export function AddConnectionFormBody({
  trpc,
  invalidation,
  purpose,
  onSaved,
  onCancel,
  credentials,
  keyStorage,
  pickerItems,
  providerOf,
}: AddConnectionFormBodyProps): ReactElement {
  const deps = { trpc, invalidation };
  const addCredential = useAddCredentialOwned(deps);
  const createConnection = useCreateConnection({ ...deps, failureShownInline: true });
  const checkSignIn = useSignInCheckAfterSave(deps);
  const draftModels = useDraftCatalogModels(deps);
  const [listing, setListing] = useState<DraftListing | null>(null);
  const [held, setHeld] = useState<HeldKey | null>(null);
  // The failed submit's error itself (a caught value) and the draft it failed for, stated once inline by
  // `AddConnectionFailure` while the draft is unchanged.
  const [submitFailure, setSubmitFailure] = useState<{ readonly error: unknown; readonly values: AddConnectionFormValues } | null>(null);
  const [refusedAuthority, setRefusedAuthority] = useState<string | null>(null);
  const failureId = useId();

  useEffect(() => {
    if (submitFailure !== null) {
      document.getElementById(failureId)?.focus();
    }
  }, [submitFailure, failureId]);

  /** The model picker's source for the current draft: the list read FOR this draft, otherwise the typed arm
   *  with the provider's reason. */
  const modelSourceFor = (provider: ProviderDef, values: Pick<AddConnectionFormValues, "baseUrl" | "key" | "credentialId">): ModelCatalogSource => {
    if (
      values.credentialId !== null &&
      held === null &&
      !credentials.some((row) => row.id === values.credentialId && row.provider === provider.id && row.revokedAt === null)
    ) {
      return { status: "unlisted", reason: SAVED_KEY_UNAVAILABLE };
    }
    if (listsInDialog(provider) && listing !== null && listing.forDraft === listingKeyFor(provider, values)) {
      return listing.source;
    }
    return {
      status: "unlisted",
      reason:
        values.credentialId !== null && provider.auth === "apiKey"
          ? "List the models this saved key can use, or type the model id."
          : draftModelReason(provider),
    };
  };

  /** A built-in provider's list, read keyless the moment it is picked. A late answer never replaces the listing
   *  of a draft picked after it. */
  const listBuiltin = (provider: ProviderDef): void => {
    const forDraft = listingKeyFor(provider, { baseUrl: "", key: "", credentialId: null });
    const answer = (source: ModelCatalogSource): void =>
      setListing((current) => (current === null || current.forDraft === forDraft ? { forDraft, source } : current));
    const retry = (): void => listBuiltin(provider);
    setListing({ forDraft, source: { status: "loading" } });
    void draftModels
      .mutateAsync({ providerId: provider.id })
      .then((result): void => answer(modelListSource(result, retry)))
      .catch((err: unknown): void => answer(failedCatalogSource(err, retry)));
  };

  /** A refusal of the Server URL itself goes on that field, where it is fixed; editing the URL clears it. A
   *  private host this deployment does not admit is also offered to the owner to admit, under the field. */
  const markUrlRefused = (err: unknown): void => {
    form.setFieldMeta("baseUrl", (prev) => ({ ...prev, isTouched: true, errorMap: { ...prev.errorMap, onServer: errorMessage(err) } }));
    setRefusedAuthority(trpcErrorReason(err) === CONNECTION_OP_CODES.baseUrlRefused ? endpointAuthorityOf(form.state.values.baseUrl.trim()) : null);
  };
  const clearUrlRefusal = (): void => {
    form.setFieldMeta("baseUrl", (prev) => ({ ...prev, errorMap: { ...prev.errorMap, onServer: undefined } }));
    setRefusedAuthority(null);
  };
  /** The owner admitted the host: the refusal and the failure statement describe a server answer that no longer holds. */
  const onAdmitted = (): void => {
    clearUrlRefusal();
    setSubmitFailure(null);
  };

  /** The credential for this submit: the row an earlier attempt already minted, else a fresh mint of the
   *  pasted key (with the connection's label, §5.3a Essential tier), else none. */
  const credentialFor = async (provider: ProviderDef, values: AddConnectionFormValues): Promise<CredentialView | null> => {
    if (held !== null) {
      return held.credential;
    }
    if (values.credentialId !== null) {
      const selected = credentials.find((row) => row.id === values.credentialId && row.provider === provider.id && row.revokedAt === null);
      if (selected === undefined) {
        throw new Error(SAVED_KEY_UNAVAILABLE);
      }
      return selected;
    }
    const key = values.key.trim();
    if (key === "" || !acceptsKey(provider)) {
      return null;
    }
    const label = values.label.trim();
    // Whatever the mint's outcome, its retained variables (the plaintext key) are dropped — `clearError` is the
    // mutation's `reset`. A failed mint leaves the key in the form field alone, for the user to correct.
    const credential = await addCredential.mutateAsync({ provider: provider.id, key, ...(label !== "" ? { label } : {}) }).finally(addCredential.clearError);
    // From here the dialog holds the ROW, never the secret: the form field is emptied, and an endpoint listing
    // taken for the keyed draft is re-keyed to the emptied field so the retry still judges against that list.
    const mintedDraft = listingKeyFor(provider, values);
    setListing((current) =>
      current !== null && current.forDraft === mintedDraft
        ? { ...current, forDraft: listingKeyFor(provider, { baseUrl: values.baseUrl, key: "", credentialId: credential.id }) }
        : current,
    );
    form.setFieldValue("key", "");
    form.setFieldValue("keyHeld", true);
    form.setFieldValue("credentialId", credential.id);
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
    const modelCheck = modelCheckOf(modelSourceFor(provider, values), values.model);
    const credential = await credentialFor(provider, values);
    let created: ConnectionView;
    try {
      created = await createConnection.mutateAsync(connectionInput({ provider, values, credentialId: credential?.id ?? null, modelCheck, purpose }));
      checkSignIn(provider, created.id);
    } catch (err) {
      if (URL_REFUSAL_CODES.has(trpcErrorReason(err))) {
        markUrlRefused(err);
      }
      throw err;
    }
    // Recent holds models a connection was SAVED with, from the list; a pick alone never reorders the list.
    if (modelCheck === "listed") {
      pushRecentModel(provider.id, values.model.trim());
    }
    onSaved(created);
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
                form.resetField("credentialId");
                form.resetField("model");
                form.resetField("api");
                setListing(null);
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
                  credentials={credentials}
                  provider={provider}
                  keyStorage={keyStorage}
                  trpc={trpc}
                  invalidation={invalidation}
                  held={held}
                  modelSource={modelSourceFor(provider, values)}
                  onListing={(answer): void => {
                    const current = form.state.values;
                    const currentProvider = providerOf(current.providerId);
                    if (currentProvider !== undefined && answer.forDraft === listingKeyFor(currentProvider, current)) {
                      setListing(answer);
                    }
                  }}
                  onUrlRefusal={markUrlRefused}
                  onUrlEdited={clearUrlRefusal}
                  refusedAuthority={refusedAuthority}
                  onAdmitted={onAdmitted}
                  backgroundNote={purpose === "utility" ? UTILITY_BACKGROUND_NOTE : null}
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

          <form.Subscribe selector={(state): string => state.values.providerId}>
            {(providerId): ReactElement | null => {
              const provider = providerOf(providerId);
              // A blocked pick's notice carries its own Close; this footer would only repeat it.
              return provider !== undefined && keyStorageBlocks(provider, keyStorage) ? null : (
                <Row gap="field" justify="end">
                  {onCancel === undefined ? (
                    <DialogClose render={<Button intent="ghost">Cancel</Button>} />
                  ) : (
                    <Button intent="ghost" onClick={onCancel} type="button">
                      Back
                    </Button>
                  )}
                  <form.SubmitButton>{CONNECTION_FORM_COPY.submit}</form.SubmitButton>
                </Row>
              );
            }}
          </form.Subscribe>
        </Stack>
      </form>
    </form.AppForm>
  );
}
