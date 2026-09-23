// The provider-dependent fields of "Add a connection" — URL and/or key, the model picker, the api control
// only when the row lists more than one, label and the background switch — split out of
// add-connection-dialog.tsx (which composes this) to keep that file under the component-size cap.

import type { ProviderDef } from "@orb/contracts/inference";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Invalidation, Trpc } from "#data";
import { touchedFieldError } from "#forms/editor";
import type { useAddConnectionForm } from "../hooks/use-add-connection-form.ts";
import { acceptsKey, CONNECTION_FORM_COPY, listsOnDemand, modelIdExample, needsBaseUrl, needsKey, savedKeyName } from "../lib/add-connection-form-model.ts";
import { CHAT_API_LABELS, connectionHost, showsApiControl } from "../lib/connections-model.ts";
import { typedModelAllowed } from "../lib/model-picker-model.ts";
import type { DraftListing } from "./draft-models-check.tsx";
import { DraftModelsCheck } from "./draft-models-check.tsx";
import type { ModelPickerProps } from "./model-picker.tsx";
import { ModelPicker } from "./model-picker.tsx";
import { SetupTokenCommand } from "./setup-token-command.tsx";

type ModelCatalogSource = ModelPickerProps["source"];
type AddConnectionForm = ReturnType<typeof useAddConnectionForm>["form"];

/** The key this dialog minted, and its name as the user gave it: `null` when the label was left blank, even
 *  though the server then files the row under a default label. */
export interface HeldKey {
  readonly credential: inferOutput<Trpc["credentials"]["add"]>;
  readonly name: string | null;
}

export interface ProviderFieldsProps {
  readonly form: AddConnectionForm;
  readonly provider: ProviderDef;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
  readonly held: HeldKey | null;
  readonly modelSource: ModelCatalogSource;
  readonly onListing: (listing: DraftListing) => void;
  readonly onUrlRefusal: (message: string | undefined) => void;
}

/** The fields that depend on the PICKED provider's auth kind: URL and/or key, the model, the api control only
 *  when the row lists more than one, label and the background switch. */
export function ProviderFields({ form, provider, trpc, invalidation, held, modelSource, onListing, onUrlRefusal }: ProviderFieldsProps): ReactElement {
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
      {listsOnDemand(provider) ? (
        <form.Subscribe selector={(state): { readonly baseUrl: string; readonly key: string } => ({ baseUrl: state.values.baseUrl, key: state.values.key })}>
          {(draft): ReactElement => (
            <DraftModelsCheck
              providerId={provider.id}
              baseUrl={needsBaseUrl(provider) ? draft.baseUrl : null}
              heldCredentialId={held?.credential.id ?? null}
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
  readonly held: HeldKey | null;
}): ReactElement | null {
  if (held !== null) {
    return (
      <Text data-slot="add-connection-key-held" prose={true} voice="gloss">
        {savedKeyName(held.name)}. It won't be shown again.
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
