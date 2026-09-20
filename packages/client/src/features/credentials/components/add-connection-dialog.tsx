// The "Add a connection" dialog (inference program §5.3a, the Essential tier): provider (grouped picker from
// `providers.available`) · key pasted inline or the server URL · model (listed from the endpoint's
// `/v1/models` server-side, typed fallback with its copy) · the `api` control only when the provider lists
// more than one · the background switch. The key is minted into a credential row FIRST (label = the
// connection's), then the connection row references it; `credentials.add` seals it at rest and no read ever
// echoes it. The Advanced/Diagnostics tiers (declared · features · extras · transport) are step 9's.

import type { ProviderDef } from "@orb/contracts/inference";
import { Button } from "@orb/ui/button";
import { DialogClose } from "@orb/ui/dialog";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, LockOpen } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { WebSpinner } from "@orb/ui/spinner";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialog, QueryBoundary } from "#components";
import type { Invalidation, Trpc } from "#data";
import { notify } from "#lib";
import { useAddConnectionForm } from "../hooks/use-add-connection-form.ts";
import { useAddCredential, useCreateConnection, useListEndpointModels } from "../hooks/use-connections-mutations.ts";
import type { AddConnectionFormValues } from "../lib/add-connection-form-model.ts";
import { acceptsKey, needsBaseUrl, needsKey } from "../lib/add-connection-form-model.ts";
import { CHAT_API_LABELS, providerPickerItems, showsApiControl } from "../lib/connections-model.ts";

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

function AddConnectionFormBody({ trpc, invalidation, onDone, pickerItems, providerOf }: FormBodyProps): ReactElement {
  const deps = { trpc, invalidation };
  const addCredential = useAddCredential(deps);
  const createConnection = useCreateConnection(deps);

  const save = async (values: AddConnectionFormValues): Promise<AddConnectionFormValues> => {
    const provider = providerOf(values.providerId);
    if (provider === undefined) {
      return values;
    }
    const label = values.label.trim();
    const key = values.key.trim();
    // The credential row is minted BEHIND the connection with the connection's label (§5.3a Essential tier).
    const credential =
      key !== "" && acceptsKey(provider) ? await addCredential.mutateAsync({ provider: provider.id, key, ...(label !== "" ? { label } : {}) }) : null;
    await createConnection.mutateAsync({
      providerId: provider.id,
      credentialId: credential?.id ?? null,
      baseUrl: needsBaseUrl(provider) ? values.baseUrl.trim() : null,
      model: values.model.trim(),
      ...(label !== "" ? { label } : {}),
      ...(values.api === "auto" ? {} : { api: values.api as ProviderDef["apis"][number] }),
      allowBackground: values.allowBackground,
      modelListed: listedModels.some((entry) => entry.value === values.model.trim()),
    });
    onDone();
    return values;
  };

  const [listedModels, setListedModels] = useState<readonly ListedModel[]>([]);
  const { form } = useAddConnectionForm({ entityId: "add-connection", serverValues: undefined, save });

  return (
    <form.AppForm>
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          event.stopPropagation();
          form.handleSubmit().catch(() => notify.error("Couldn't submit the connection."));
        }}
      >
        <Stack gap="block">
          <form.AppField
            name="providerId"
            // The validator reads the auth KIND off the values (module scope, no registry in reach): derive it here.
            listeners={{ onChange: ({ value }): void => form.setFieldValue("auth", providerOf(value)?.auth ?? "") }}
          >
            {(field): ReactElement => <field.SelectField label="Provider" items={pickerItems} placeholder="Pick a provider" />}
          </form.AppField>

          <form.Subscribe selector={(state): string => state.values.providerId}>
            {(providerId): ReactElement | null => {
              const provider = providerOf(providerId);
              return provider === undefined ? null : (
                <ProviderFields
                  form={form}
                  provider={provider}
                  trpc={trpc}
                  invalidation={invalidation}
                  listedModels={listedModels}
                  onListed={setListedModels}
                />
              );
            }}
          </form.Subscribe>

          <Text voice="gloss">Stored securely on this deployment; the key is sent only to the provider you chose.</Text>

          <Row gap="field" justify="end">
            <DialogClose render={<Button intent="ghost">Cancel</Button>} />
            <form.SubmitButton>Add connection</form.SubmitButton>
          </Row>
        </Stack>
      </form>
    </form.AppForm>
  );
}

type AddConnectionForm = ReturnType<typeof useAddConnectionForm>["form"];
interface ListedModel {
  readonly label: string;
  readonly value: string;
}

interface ProviderFieldsProps {
  readonly form: AddConnectionForm;
  readonly provider: ProviderDef;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
  readonly listedModels: readonly ListedModel[];
  readonly onListed: (models: readonly ListedModel[]) => void;
}

/** The fields that depend on the PICKED provider's auth kind: URL and/or key, the model (listed or typed),
 *  the api control only when the row lists more than one, label and the background switch. */
function ProviderFields({ form, provider, trpc, invalidation, listedModels, onListed }: ProviderFieldsProps): ReactElement {
  return (
    <>
      {needsBaseUrl(provider) ? (
        <form.AppField name="baseUrl">
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
      {acceptsKey(provider) ? (
        <form.AppField name="key">
          {(field): ReactElement => (
            <field.TextField
              label={keyLabel(provider)}
              {...(provider.auth === "oauthToken"
                ? { description: "Run `claude setup-token` on the machine you use Claude Code on and paste the result." }
                : {})}
              placeholder={provider.auth === "oauthToken" ? "Paste the token" : "Paste your API key"}
              type="password"
              revealable={true}
              autoComplete="off"
            />
          )}
        </form.AppField>
      ) : null}
      {needsBaseUrl(provider) ? (
        <form.Subscribe selector={(state): { readonly baseUrl: string; readonly key: string } => ({ baseUrl: state.values.baseUrl, key: state.values.key })}>
          {(draft): ReactElement => (
            <EndpointModelsCheck trpc={trpc} invalidation={invalidation} baseUrl={draft.baseUrl} keyValue={draft.key} onListed={onListed} />
          )}
        </form.Subscribe>
      ) : null}
      <form.AppField name="model">
        {(field): ReactElement =>
          listedModels.length > 0 ? (
            <field.SelectField label="Model" items={listedModels} placeholder="Pick a model" />
          ) : (
            <field.TextField label="Model" hint={modelHint(provider)} placeholder="e.g. anthropic/claude-opus-5" autoComplete="off" />
          )
        }
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
          <field.TextField label="Label" hint="Optional — defaults to “provider · model”." placeholder={`${provider.label} · …`} autoComplete="off" />
        )}
      </form.AppField>
      <form.AppField name="allowBackground">
        {(field): ReactElement => (
          <field.SwitchField label="Allow background work" description="Let summaries, captions and memory digests run on this connection unattended." />
        )}
      </form.AppField>
    </>
  );
}

function keyLabel(provider: ProviderDef): string {
  if (provider.auth === "oauthToken") {
    return "Setup token";
  }
  return needsKey(provider) ? "API key" : "API key (optional)";
}

function modelHint(provider: ProviderDef): string {
  if (provider.auth === "endpoint") {
    return "Type the model id your server serves, or list them from the URL above.";
  }
  return `The model id as ${provider.label} spells it.`;
}

/** One list answer, and the draft it is an answer ABOUT (#1502: a verdict must carry the inputs it was
 *  taken for, so an edited URL retires it in the same commit). */
interface ListVerdict {
  readonly forDraft: string;
  readonly count: number;
  readonly reason: string | null;
}

function draftKeyOf(baseUrl: string, keyValue: string): string {
  return JSON.stringify([baseUrl.trim(), keyValue.trim()]);
}

/** The server-side `GET <baseUrl>/v1/models` for the draft (§7.4) — advisory, never blocks submit; an empty
 *  or failed list is the typed-id arm with its reason (`modelListed: false` on save). */
function EndpointModelsCheck({
  trpc,
  invalidation,
  baseUrl,
  keyValue,
  onListed,
}: {
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
  readonly baseUrl: string;
  readonly keyValue: string;
  readonly onListed: (models: readonly ListedModel[]) => void;
}): ReactElement {
  const list = useListEndpointModels({ trpc, invalidation });
  const [verdict, setVerdict] = useState<ListVerdict | null>(null);
  const currentDraftKey = draftKeyOf(baseUrl, keyValue);

  const runCheck = (): void => {
    const draftBaseUrl = baseUrl.trim();
    if (draftBaseUrl === "") {
      return;
    }
    const forDraft = currentDraftKey;
    const key = keyValue.trim();
    // @orb-waive caught-failure-ownership(mutateAsync): an advisory-only list — the .catch records a
    // zero-count verdict with the failure as its reason, which IS the rendered typed-id state. Ends if the
    // failure branch stops writing a distinguishable UI state.
    void list
      .mutateAsync({ baseUrl: draftBaseUrl, ...(key !== "" ? { key } : {}) })
      .then((result): void => {
        setVerdict({ forDraft, count: result.models.length, reason: result.reason });
        onListed(result.models.map((entry) => ({ label: entry.name === entry.id ? entry.id : `${entry.name} (${entry.id})`, value: entry.id })));
      })
      .catch((): void => {
        setVerdict({ forDraft, count: 0, reason: "the server refused the request" });
        onListed([]);
      });
  };

  const shown = verdict !== null && verdict.forDraft === currentDraftKey ? verdict : null;
  return (
    <Row gap="field" align="center" className="flex-wrap">
      <Button intent="secondary" size="sm" disabled={baseUrl.trim() === "" || list.isPending} onClick={runCheck}>
        List models
      </Button>
      {shown === null ? null : (
        <Text voice="gloss" className={shown.count > 0 ? "text-success" : "text-warning"} data-slot="connection-list-verdict">
          {shown.count > 0
            ? `${shown.count} model${shown.count === 1 ? "" : "s"} listed`
            : `Couldn't list models — ${shown.reason ?? "no answer"}. Type the id; it'll be sent as-is.`}
        </Text>
      )}
    </Row>
  );
}
