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
// a refusal of the Server URL itself lands on that field instead, and a private host the deployment does not admit
// offers the box owner the editor's owner-only Admit control under it. The statement takes focus when it appears
// (the submit may go disabled under the caret, and on a phone the statement is below the fold), and it is
// withdrawn at the first edit, because it describes the draft that was submitted, not the one being typed.
//
// THE FIRST CONNECTION THAT CAN CHAT OPENS THE FIRST-MODEL STEP (`first-model-setup.tsx`) instead of closing: it
// becomes the Chat model, and the step asks for the Utility model, which may be a second connection added here.

import type { ModelCheck, ProviderDef } from "@orb/contracts/inference";
import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import { Button } from "@orb/ui/button";
import { DialogClose } from "@orb/ui/dialog";
import { Row, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { WebSpinner } from "@orb/ui/spinner";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useEffect, useId, useState } from "react";
import { FormDialog, QueryBoundary, useSetBinding } from "#components";
import type { Invalidation, Trpc } from "#data";
import { ADD_CONNECTION_DOOR, CHAT_ROLE_DOOR, trpcErrorReason } from "#lib";
import { configSettingControlId, openConfigTo, pushRecentModel } from "#state";
import { useAddConnectionForm } from "../hooks/use-add-connection-form.ts";
import { useAddCredentialOwned, useCreateConnection, useDraftCatalogModels } from "../hooks/use-connections-mutations.ts";
import { useSignInCheckAfterSave } from "../hooks/use-sign-in-check.ts";
import type { AddConnectionFormValues } from "../lib/add-connection-form-model.ts";
import {
  ADD_DIALOG_COPY,
  acceptsKey,
  CONNECTION_FORM_COPY,
  draftModelReason,
  keyStorageBlocks,
  listingKeyFor,
  listsInDialog,
  needsBaseUrl,
  sameFormValues,
  submitFailureSentence,
  URL_REFUSAL_CODES,
} from "../lib/add-connection-form-model.ts";
import { endpointAuthorityOf } from "../lib/connection-editor-model.ts";
import { providerPickerItems } from "../lib/connections-model.ts";
import { failedCatalogSource, modelCheckOf, modelListSource } from "../lib/model-picker-model.ts";
import { AddConnectionFailure } from "./add-connection-failure.tsx";
import type { HeldKey } from "./add-connection-provider-fields.tsx";
import { ProviderFields } from "./add-connection-provider-fields.tsx";
import type { DraftListing } from "./draft-models-check.tsx";
import { FirstModelSetup } from "./first-model-setup.tsx";
import type { ModelPickerProps } from "./model-picker.tsx";

type CredentialView = inferOutput<Trpc["credentials"]["add"]>;
type ModelCatalogSource = ModelPickerProps["source"];

export interface AddConnectionDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

type ConnectionView = inferOutput<Trpc["connection"]["create"]>;

/** What the dialog is doing: adding a connection, the first-model step, or adding the Utility model that step asked for. */
type AddStep =
  | { readonly kind: "add" }
  | { readonly kind: "setup"; readonly chat: ConnectionView; readonly picked: ConnectionView["id"] | null; readonly chatBinding: Promise<string | null> }
  | { readonly kind: "add-utility"; readonly chat: ConnectionView; readonly chatBinding: Promise<string | null> };

const ADD_STEP: AddStep = { kind: "add" };

export function AddConnectionDialog({ open, onOpenChange, trpc, invalidation }: AddConnectionDialogProps): ReactElement {
  const [step, setStep] = useState<AddStep>(ADD_STEP);
  const [closeTarget, setCloseTarget] = useState({ open, chat: false });
  if (closeTarget.open !== open) {
    setCloseTarget({ open, chat: open ? false : closeTarget.chat });
  }
  const setBinding = useSetBinding({ trpc, invalidation, failureShownInline: true });
  // @orb-waive caught-failure-ownership(setBinding.mutateAsync): the returned refusal is carried to FirstModelSetup's inline failure or its late-refusal toast, never discarded; ends if either result stops reaching that component.
  const bindChat = (chat: ConnectionView): Promise<string | null> =>
    setBinding.mutateAsync({ task: "chat", connectionId: chat.id }).then(() => null, errorMessage);
  // Every close starts the next open at the add form.
  const changeOpen = (next: boolean): void => {
    if (!next) {
      setStep(ADD_STEP);
    }
    onOpenChange(next);
  };
  const onSaved = (created: ConnectionView, firstChatModel: boolean): void => {
    if (step.kind === "add-utility") {
      setStep({ kind: "setup", chat: step.chat, picked: created.id, chatBinding: step.chatBinding });
      return;
    }
    if (firstChatModel) {
      // Start before mounting setup: closing it never cancels the saved connection's Chat assignment.
      const chatBinding = bindChat(created);
      setStep({ kind: "setup", chat: created, picked: null, chatBinding });
      return;
    }
    changeOpen(false);
  };
  return (
    <FormDialog
      anchor="top"
      finalFocus={(): HTMLElement | false | null =>
        closeTarget.chat ? false : document.getElementById(configSettingControlId(ADD_CONNECTION_DOOR.group, ADD_CONNECTION_DOOR.setting))
      }
      onOpenChangeComplete={(next): void => {
        if (!next && closeTarget.chat) {
          openConfigTo(CHAT_ROLE_DOOR.group, CHAT_ROLE_DOOR.sub, CHAT_ROLE_DOOR.setting);
        }
      }}
      closeButton={true}
      description={ADD_DIALOG_COPY[step.kind].description}
      onOpenChange={changeOpen}
      open={open}
      title={ADD_DIALOG_COPY[step.kind].title}
    >
      {/* DELIBERATELY UNRESERVED (#1098): a dialog body sizes itself around its content. */}
      <QueryBoundary fallback={<WebSpinner label="Checking key storage…" />}>
        {step.kind === "setup" ? (
          <FirstModelSetup
            chat={step.chat}
            chatBinding={step.chatBinding}
            onRetryChat={(): void => setStep({ ...step, chatBinding: bindChat(step.chat) })}
            invalidation={invalidation}
            onAddUtility={(): void => setStep({ kind: "add-utility", chat: step.chat, chatBinding: step.chatBinding })}
            onDone={(): void => changeOpen(false)}
            onChangeChat={(): void => {
              // Native close owns focus until dismissal completes; the canonical leaf landing owns it next.
              setCloseTarget({ open, chat: true });
              changeOpen(false);
            }}
            picked={step.picked}
            trpc={trpc}
          />
        ) : (
          <AddConnectionGate
            invalidation={invalidation}
            key={step.kind}
            onCancel={
              step.kind === "add-utility" ? (): void => setStep({ kind: "setup", chat: step.chat, picked: null, chatBinding: step.chatBinding }) : undefined
            }
            onSaved={onSaved}
            purpose={step.kind === "add-utility" ? "utility" : "connection"}
            trpc={trpc}
          />
        )}
      </QueryBoundary>
    </FormDialog>
  );
}

/** Why the form is open: an ordinary add, or the Utility model the first-model step asked for, which is saved with
 *  background work on because that role never runs without it. */
type AddPurpose = "connection" | "utility";

/** The Utility add's stand-in for the background switch: the role needs it on, so it is stated, not offered. */
const UTILITY_BACKGROUND_NOTE = "Allow background work is on for this connection, so it can run your summaries, captions and extraction.";

interface GateProps {
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
  readonly purpose: AddPurpose;
  /** Called once the row exists; `firstChatModel` = it is the first of the user's connections that can chat. */
  readonly onSaved: (created: ConnectionView, firstChatModel: boolean) => void;
  /** Replaces the footer's Cancel close with a step back, where the form is a step inside a longer flow. */
  readonly onCancel: (() => void) | undefined;
}

/** CREDENTIAL-STORAGE-SILENT-FAIL — ASK BEFORE COLLECTING: the deployment's SecretBox capability is read
 *  first and the INPUT refused, never the save, so nobody types a live key into a form that cannot keep it.
 *  The refusal is per provider (`keyStorageBlocks`): a keyless own-server row needs no storage at all. */
function AddConnectionGate({ trpc, invalidation, purpose, onSaved, onCancel }: GateProps): ReactElement {
  const { data: storage } = useSuspenseQuery(trpc.credentials.storageStatus.queryOptions());
  const { data: available } = useSuspenseQuery(trpc.connection.providersAvailable.queryOptions());
  const { data: connections } = useSuspenseQuery(trpc.connection.list.queryOptions());
  // Read once, at open: the list refetches the moment this form's own row lands, and the question is about before.
  const [hadChatModel] = useState(() => connections.some((connection) => connection.tasks.includes("chat")));
  const providers = new Map(available.map((row) => [row.provider.id as string, row.provider]));
  return (
    <AddConnectionFormBody
      trpc={trpc}
      invalidation={invalidation}
      purpose={purpose}
      onSaved={(created): void => onSaved(created, !hadChatModel && created.tasks.includes("chat"))}
      onCancel={onCancel}
      keyStorage={storage.enabled}
      pickerItems={providerPickerItems(available)}
      providerOf={(id): ProviderDef | undefined => providers.get(id)}
    />
  );
}

interface FormBodyProps {
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
  readonly purpose: AddPurpose;
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
  readonly purpose: AddPurpose;
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

function AddConnectionFormBody({ trpc, invalidation, purpose, onSaved, onCancel, keyStorage, pickerItems, providerOf }: FormBodyProps): ReactElement {
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
                  keyStorage={keyStorage}
                  trpc={trpc}
                  invalidation={invalidation}
                  held={held}
                  modelSource={modelSourceFor(provider, values)}
                  onListing={setListing}
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
