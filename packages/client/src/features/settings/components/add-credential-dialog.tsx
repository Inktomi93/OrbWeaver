// The "Add a provider key" dialog (Settings → Connections → Saved keys). A COMPONENT so the Dialog root is
// legal (client-structure rule 7). The form is the §13.4 factory (`useAddCredentialForm` — ≥3 fields +
// validation), button-gated: "Add key" runs `form.handleSubmit()` whose `save` fires the `credentials.add`
// mutation and closes on success; a failure keeps the dialog open (the mutation's errorToast is the failure
// surface, and the sticky mutation error renders inline). Base UI unmounts the popup content while closed,
// so every open mounts a FRESH form — a reopened dialog never shows the previous attempt's values.
//
// SECURITY: the key is entered here and sent to `credentials.add` (which encrypts it at rest, AES-256-GCM),
// but it is NEVER read back — `credentials.list` returns the redacted view (05-observability §5). The input
// is a plain (unmasked) field so the user can verify the paste before saving; it is transient (cleared on
// close by the per-open remount), never persisted client-side, and never echoed by any read.

import type { CredentialProvider } from "@orb/contracts/credentials";
import { Button } from "@orb/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Invalidation, Trpc } from "#data";
import { useAddCredentialForm } from "../hooks/use-add-credential-form";
import { useAddCredential, useFetchModels } from "../hooks/use-connections-mutations";
import type { AddCredentialFormValues } from "../lib/add-credential-form-model";
import { isCustomProvider, PROVIDER_ITEMS } from "../lib/add-credential-form-model";

export interface AddCredentialDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

/** The add-a-key dialog shell — the form body mounts fresh per open (Base UI unmounts closed popups). */
export function AddCredentialDialog({
  open,
  onOpenChange,
  trpc,
  invalidation,
}: AddCredentialDialogProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <Stack gap="block">
          <DialogTitle>Add a provider key</DialogTitle>
          <DialogDescription>
            The key is encrypted at rest and never shown again — only its provider and label appear
            in the list.
          </DialogDescription>
          <AddCredentialFormBody
            trpc={trpc}
            invalidation={invalidation}
            onDone={(): void => onOpenChange(false)}
          />
        </Stack>
      </DialogPopup>
    </Dialog>
  );
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
    const baseUrl = values.baseUrl.trim();
    const model = values.model.trim();
    await add.mutateAsync({
      provider,
      key: values.key.trim(),
      ...(label !== "" ? { label } : {}),
      ...(isCustomProvider(values.provider)
        ? {
            metadata: {
              kind: "custom_openai" as const,
              baseUrl,
              ...(model !== "" ? { model } : {}),
            },
          }
        : {}),
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
      {/* A real <form> so `form.SubmitButton` (type="submit") actually runs `handleSubmit` — without an
          enclosing form the submit button is inert (no validation, no field-error, `canSubmit` never flips),
          so an empty-key click was a silent no-op. The raw <form> carries no className (compose-only). */}
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <Stack gap="block">
          <form.AppField name="provider">
            {(field): ReactElement => <field.SelectField label="Provider" items={PROVIDER_ITEMS} />}
          </form.AppField>

          <form.AppField name="label">
            {(field): ReactElement => (
              <field.TextField
                label="Label"
                hint="A name to tell this key apart (optional)."
                placeholder="default"
                autoComplete="off"
              />
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
                </>
              ) : null
            }
          </form.Subscribe>

          <form.AppField name="key">
            {(field): ReactElement => (
              <field.TextField label="Key" placeholder="Paste your API key" autoComplete="off" />
            )}
          </form.AppField>

          {/* The custom-endpoint draft "Fetch models" check — advisory, never blocks submit (§5.4). */}
          <form.Subscribe
            selector={(
              state,
            ): { readonly provider: string; readonly baseUrl: string; readonly key: string } => ({
              provider: state.values.provider,
              baseUrl: state.values.baseUrl,
              key: state.values.key,
            })}
          >
            {(draft): ReactElement | null =>
              isCustomProvider(draft.provider) ? (
                <DraftFetchModelsCheck
                  trpc={trpc}
                  invalidation={invalidation}
                  baseUrl={draft.baseUrl}
                  keyValue={draft.key}
                />
              ) : null
            }
          </form.Subscribe>

          <Text size="micro" tone="muted">
            Stored securely on this deployment; it is sent only to the provider you chose.
          </Text>

          <Row gap="field" justify="end">
            <DialogClose render={<Button intent="ghost">Cancel</Button>} />
            <form.SubmitButton>Add key</form.SubmitButton>
          </Row>
        </Stack>
      </form>
    </form.AppForm>
  );
}

/** The pre-save custom-endpoint reachability check — fires the draft `credentials.fetchModels` (draft-wins
 *  arm) against the typed baseUrl/key and renders the count / failure inline. Purely advisory (§5.4): it
 *  NEVER blocks submit. The result is SESSION-EPHEMERAL local state. */
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
    const draft =
      keyValue.trim() === ""
        ? { baseUrl: draftBaseUrl }
        : { baseUrl: draftBaseUrl, key: keyValue.trim() };
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
      <Button
        intent="secondary"
        size="sm"
        disabled={baseUrl.trim() === "" || fetchModels.isPending}
        onClick={runCheck}
      >
        Fetch models
      </Button>
      {checked ? (
        <Text size="micro" tone={count !== null && count > 0 ? "success" : "warning"}>
          {count !== null && count > 0
            ? `reachable — ${count} model${count === 1 ? "" : "s"}`
            : "unreachable or no /models"}
        </Text>
      ) : null}
    </Row>
  );
}
