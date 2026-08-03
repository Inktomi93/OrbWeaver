// The "Add a provider key" dialog. Button-gated: "Add key" runs form.handleSubmit(), whose save fires the
// credentials.add mutation and closes on success. Base UI unmounts the popup content while closed, so
// every open mounts a fresh form.
//
// Security: the key is sent to credentials.add (encrypted at rest) but never read back — credentials.list
// returns the redacted view. The input is unmasked so the user can verify the paste; it is transient,
// never persisted client-side, and never echoed by any read.

import type { CredentialProvider, ProviderMetadata } from "@orb/contracts/credentials";
import { Button } from "@orb/ui/button";
import { DialogClose } from "@orb/ui/dialog";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialog } from "#components";
import type { Invalidation, Trpc } from "#data";
import { useAddCredentialForm } from "../hooks/use-add-credential-form.ts";
import { useAddCredential, useFetchModels } from "../hooks/use-connections-mutations.ts";
import type { AddCredentialFormValues } from "../lib/add-credential-form-model.ts";
import { isCustomProvider, PROVIDER_ITEMS, parseJsonObject, parseKeyList, parseResponseMap } from "../lib/add-credential-form-model.ts";

export interface AddCredentialDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

export function AddCredentialDialog({ open, onOpenChange, trpc, invalidation }: AddCredentialDialogProps): ReactElement {
  return (
    <FormDialog
      description="The key is encrypted at rest and never shown again — only its provider and label appear in the list."
      onOpenChange={onOpenChange}
      open={open}
      title="Add a provider key"
    >
      <AddCredentialFormBody trpc={trpc} invalidation={invalidation} onDone={(): void => onOpenChange(false)} />
    </FormDialog>
  );
}

/** Build the `custom_openai` metadata blob from the form values — the three transforms are parsed from
 *  free text (the validator already rejected an invalid JSON object) and omitted when empty. */
function customEndpointMetadata(values: AddCredentialFormValues): Extract<ProviderMetadata, { readonly kind: "custom_openai" }> {
  const model = values.model.trim();
  const includeBody = parseJsonObject(values.includeBody);
  const excludeBody = parseKeyList(values.excludeBody);
  const responseMap = parseResponseMap(values.responseMap);
  return {
    kind: "custom_openai" as const,
    baseUrl: values.baseUrl.trim(),
    ...(model !== "" ? { model } : {}),
    ...(includeBody !== null ? { includeBody } : {}),
    ...(excludeBody.length > 0 ? { excludeBody } : {}),
    ...(responseMap !== null ? { responseMap } : {}),
  };
}

function AddCredentialFormBody({
  trpc,
  invalidation,
  onDone,
}: {
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
  readonly onDone: () => void;
}): ReactElement {
  const add = useAddCredential({ trpc, invalidation });

  const save = async (values: AddCredentialFormValues): Promise<AddCredentialFormValues> => {
    const provider = values.provider as CredentialProvider;
    const label = values.label.trim();
    const metadata = isCustomProvider(values.provider) ? customEndpointMetadata(values) : undefined;
    await add.mutateAsync({
      provider,
      key: values.key.trim(),
      ...(label !== "" ? { label } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
    });
    onDone();
    return values;
  };

  const { form } = useAddCredentialForm({
    entityId: "add-credential",
    serverValues: undefined,
    save,
  });

  return (
    <form.AppForm>
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <Stack gap="block">
          <form.AppField name="provider">{(field): ReactElement => <field.SelectField label="Provider" items={PROVIDER_ITEMS} />}</form.AppField>

          <form.AppField name="label">
            {(field): ReactElement => (
              <field.TextField label="Label" hint="A name to tell this key apart (optional)." placeholder="default" autoComplete="off" />
            )}
          </form.AppField>

          <form.Subscribe selector={(state): string => state.values.provider}>
            {(provider): ReactElement | null =>
              isCustomProvider(provider) ? (
                <>
                  <form.AppField name="baseUrl">
                    {(field): ReactElement => (
                      <field.TextField
                        label="Base URL"
                        description="The OpenAI-compatible endpoint this key talks to."
                        placeholder="https://…/v1"
                        autoComplete="off"
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="model">
                    {(field): ReactElement => (
                      <field.TextField
                        label="Default model"
                        hint="Optional — the model id roles on this endpoint default to."
                        placeholder="e.g. llama-3.3-70b"
                        autoComplete="off"
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="includeBody">
                    {(field): ReactElement => (
                      <field.TextareaField
                        label="Extra body fields"
                        description="Optional JSON object merged into every request body (e.g. a provider knob)."
                        placeholder="{ reasoning_effort: high }"
                        rows={2}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="excludeBody">
                    {(field): ReactElement => (
                      <field.TextField
                        label="Strip body fields"
                        hint="Optional — request-body keys to drop, comma-separated (e.g. a field the server rejects)."
                        placeholder="e.g. frequency_penalty, logit_bias"
                        autoComplete="off"
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="responseMap">
                    {(field): ReactElement => (
                      <field.TextareaField
                        label="Response map"
                        description="Optional JSON of dot-paths overriding a non-standard reply shape."
                        placeholder="{ contentPath: choices.0.message.content }"
                        rows={2}
                      />
                    )}
                  </form.AppField>
                </>
              ) : null
            }
          </form.Subscribe>

          <form.AppField name="key">
            {(field): ReactElement => <field.TextField label="Key" placeholder="Paste your API key" autoComplete="off" />}
          </form.AppField>

          <form.Subscribe
            selector={(state): { readonly provider: string; readonly baseUrl: string; readonly key: string } => ({
              provider: state.values.provider,
              baseUrl: state.values.baseUrl,
              key: state.values.key,
            })}
          >
            {(draft): ReactElement | null =>
              isCustomProvider(draft.provider) ? (
                <DraftFetchModelsCheck trpc={trpc} invalidation={invalidation} baseUrl={draft.baseUrl} keyValue={draft.key} />
              ) : null
            }
          </form.Subscribe>

          <Text voice="gloss">Stored securely on this deployment; it is sent only to the provider you chose.</Text>

          <Row gap="field" justify="end">
            <DialogClose render={<Button intent="ghost">Cancel</Button>} />
            <form.SubmitButton>Add key</form.SubmitButton>
          </Row>
        </Stack>
      </form>
    </form.AppForm>
  );
}

/** The pre-save custom-endpoint reachability check — advisory only, never blocks submit. Session-ephemeral local state. */
function DraftFetchModelsCheck({
  trpc,
  invalidation,
  baseUrl,
  keyValue,
}: {
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
  readonly baseUrl: string;
  readonly keyValue: string;
}): ReactElement {
  const fetchModels = useFetchModels({ trpc, invalidation });
  const [count, setCount] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);

  const runCheck = (): void => {
    const draftBaseUrl = baseUrl.trim();
    if (draftBaseUrl === "") {
      return;
    }
    const draft = keyValue.trim() === "" ? { baseUrl: draftBaseUrl } : { baseUrl: draftBaseUrl, key: keyValue.trim() };
    void fetchModels
      .mutateAsync({ draft })
      .then((models): void => {
        setCount(models.length);
        setChecked(true);
      })
      .catch((): void => {
        setCount(0);
        setChecked(true);
      });
  };

  return (
    <Row gap="field" align="center">
      <Button intent="secondary" size="sm" disabled={baseUrl.trim() === "" || fetchModels.isPending} onClick={runCheck}>
        Fetch models
      </Button>
      {checked ? (
        <Text voice="gloss" className={count !== null && count > 0 ? "text-success" : "text-warning"}>
          {count !== null && count > 0 ? `reachable — ${count} model${count === 1 ? "" : "s"}` : "unreachable or no /models"}
        </Text>
      ) : null}
    </Row>
  );
}
