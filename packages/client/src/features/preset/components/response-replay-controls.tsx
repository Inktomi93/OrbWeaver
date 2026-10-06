import type { PromptConfig } from "@orb/contracts/preset";
import { RESPONSE_CACHE_TTL_BOUNDS, responseCacheTtlSchema } from "@orb/contracts/preset";
import { groupThousands } from "@orb/kit/strings";
import { Field } from "@orb/ui/field";
import { Section } from "@orb/ui/layout";
import { NumberField } from "@orb/ui/number-field";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { SettingRowGroup, SettingTrackRow } from "#components";
import type { AppFormInstance } from "#forms/editor";
import type { EffectiveProfileRow } from "../lib/effective-knobs.ts";
import { RESPONSE_REPLAY_CHOICES, RESPONSE_REPLAY_LABELS, responseReplayChoice } from "../lib/effective-knobs.ts";

type AppForm = AppFormInstance<PromptConfig>;

export function ResponseReplayCluster({ form, effective }: { readonly form: AppForm; readonly effective: EffectiveProfileRow }): ReactElement {
  const replay = effective.cache.replay;
  return (
    <Section kicker="Response replay">
      <Text className="max-w-(--reading-measure-prose)" prose={true} voice="gloss">
        Reuse an identical complete answer on OpenRouter, not just its prompt prefix. Changed turns normally miss. Fresh generation actions bypass replay. An
        upstream setting can prevent a hit even when replay is requested.
      </Text>
      <Text voice="gloss">
        {replay.supported
          ? `${replay.provenance === "connection" ? "Inherited" : "Resolved"} request: replay ${replay.enabled ? "on" : "off"} ${replay.provenance === "connection" ? "from connection headers" : "by the resolved setting"}.`
          : "Complete-response replay is unsupported on this connection's endpoint."}
      </Text>
      <SettingRowGroup>
        <SettingTrackRow>
          <form.Field name="params.responseCache">
            {(field): ReactElement => (
              <Field
                disabled={!replay.supported}
                label="Complete-response replay"
                name={field.name}
                description="Inherit preserves intentional connection-header opt-in. Off explicitly bypasses replay for this preset."
              >
                <Select
                  aria-label="Complete-response replay"
                  disabled={!replay.supported}
                  items={RESPONSE_REPLAY_CHOICES.map((value) => ({ value, label: RESPONSE_REPLAY_LABELS[value] }))}
                  value={responseReplayChoice(field.state.value)}
                  onValueChange={(value): void => {
                    const choice = RESPONSE_REPLAY_CHOICES.find((candidate) => candidate === value);
                    if (choice !== undefined) {
                      field.handleChange(choice === "inherit" ? undefined : { ...field.state.value, enabled: choice === "on" });
                    }
                  }}
                />
              </Field>
            )}
          </form.Field>
        </SettingTrackRow>
        <form.Subscribe selector={(state): boolean => state.values.params.responseCache?.enabled === true}>
          {(enabled): ReactElement => (
            <SettingTrackRow>
              <ReplayRetention disabled={!(replay.supported && enabled)} form={form} />
            </SettingTrackRow>
          )}
        </form.Subscribe>
      </SettingRowGroup>
      {effective.cacheWarnings.map((warning) => (
        <Text className="max-w-(--reading-measure-prose)" key={warning.message} prose={true} voice="gloss">
          {warning.message}
        </Text>
      ))}
    </Section>
  );
}

function ReplayRetention({ form, disabled }: { readonly form: AppForm; readonly disabled: boolean }): ReactElement {
  const [draft, setDraft] = useState<{ readonly value: number | null } | null>(null);
  const invalid = draft !== null && draft.value !== null && !responseCacheTtlSchema.safeParse(draft.value).success;
  return (
    <form.Field name="params.responseCache.ttlSeconds">
      {(field): ReactElement => (
        <Field
          disabled={disabled}
          name={field.name}
          label="Response replay lifetime (seconds)"
          description="Choose an explicit replay request before editing. Empty inherits the connection header or OpenRouter's default; it does not write a guessed lifetime."
          error={invalid ? `Enter whole seconds from ${RESPONSE_CACHE_TTL_BOUNDS.min} to ${groupThousands(RESPONSE_CACHE_TTL_BOUNDS.max)}.` : null}
        >
          <NumberField
            disabled={disabled}
            min={RESPONSE_CACHE_TTL_BOUNDS.min}
            max={RESPONSE_CACHE_TTL_BOUNDS.max}
            step={1}
            placeholder={`${RESPONSE_CACHE_TTL_BOUNDS.default} (provider default)`}
            value={draft === null ? (field.state.value ?? null) : draft.value}
            onBlur={field.handleBlur}
            onValueChange={(value): void => setDraft({ value })}
            onValueCommitted={(value): void => {
              if (value !== null && !responseCacheTtlSchema.safeParse(value).success) {
                return;
              }
              setDraft(null);
              field.handleChange(value ?? undefined);
            }}
          />
        </Field>
      )}
    </form.Field>
  );
}
