// The connection editor's Prompt caching tier body: an autosave form (D78) whose save writes the whole settings
// document, so changes inside one save window land as one write. The depth field commits on blur or Enter, never
// per keystroke. App controls and provider-managed implicit caching remain distinct.

import type { CachePolicy, GenerationCapability, PromptCacheSettings, PromptCacheTtl } from "@orb/contracts/inference";
import { effectivePromptCache } from "@orb/contracts/inference";
import type { UserConnectionId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { NumberField } from "@orb/ui/number-field";
import { RadioGroup, RadioGroupItem } from "@orb/ui/radio-group";
import { Select } from "@orb/ui/select";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useId, useState } from "react";
import type { AutosaveSession } from "#forms/editor";
import { PromptCacheAutosaveForm } from "../hooks/use-prompt-cache-form.ts";
import {
  PROMPT_CACHE_DEPTH_BOUNDS,
  PROMPT_CACHE_TTL_OPTIONS,
  promptCacheDepthOf,
  promptCacheRetentionOf,
  promptCacheTtlOf,
} from "../lib/prompt-cache-model.ts";

export interface ConnectionPromptCacheProps {
  readonly generation: GenerationCapability | null;
  readonly policy: CachePolicy;
  readonly warnings: readonly string[];
  readonly connectionId: UserConnectionId;
  /** The row's stored settings; `null` is the shipped behavior. */
  readonly stored: PromptCacheSettings | null;
  /** The connection's label, for the controls' accessible names. */
  readonly connectionLabel: string;
  readonly busy: boolean;
  readonly fixedTtl?: PromptCacheTtl | undefined;
  readonly defaultEnabled?: boolean | undefined;
  /** Persist the whole document; the autosave session calls it once per save window. */
  readonly save: (next: PromptCacheSettings) => Promise<unknown>;
  /** Write `null`, so the connection goes back to the shipped behavior. */
  readonly onReset: () => void;
}

export function ConnectionPromptCache({ connectionId, stored, save, defaultEnabled, fixedTtl, ...body }: ConnectionPromptCacheProps): ReactElement {
  return (
    <PromptCacheAutosaveForm entityId={connectionId} save={save} serverValues={effectivePromptCache(stored, defaultEnabled, fixedTtl)}>
      {(session): ReactElement => (
        <PromptCacheBody {...body} defaultEnabled={defaultEnabled} fixedTtl={fixedTtl} hasStored={stored !== null} session={session} />
      )}
    </PromptCacheAutosaveForm>
  );
}

interface PromptCacheBodyProps {
  readonly generation: GenerationCapability | null;
  readonly policy: CachePolicy;
  readonly warnings: readonly string[];
  readonly session: AutosaveSession<PromptCacheSettings>;
  readonly hasStored: boolean;
  readonly connectionLabel: string;
  readonly busy: boolean;
  readonly fixedTtl?: PromptCacheTtl | undefined;
  readonly defaultEnabled?: boolean | undefined;
  readonly onReset: () => void;
}

function PromptCacheBody(props: PromptCacheBodyProps): ReactElement {
  const { session, hasStored, busy, onReset, defaultEnabled, fixedTtl, generation, policy, warnings } = props;
  const controllable = generation?.turns?.explicitPromptCache === true || generation?.turns?.requestAutomaticPromptCache === true;
  const reset = (): void => {
    session.reseed(effectivePromptCache(null, defaultEnabled, fixedTtl));
    onReset();
  };
  return (
    <Stack data-slot="connection-prompt-cache" gap="row">
      <CacheFacts policy={policy} warnings={warnings} />
      {controllable ? <PrefixControls {...props} /> : null}
      <ProviderControls {...props} />
      {hasStored ? (
        <Row justify="start">
          <Button disabled={busy} intent="secondary" onClick={reset} size="sm">
            Use the defaults
          </Button>
        </Row>
      ) : null}
    </Stack>
  );
}

type ControlProps = Pick<PromptCacheBodyProps, "session" | "connectionLabel" | "busy" | "fixedTtl" | "generation" | "policy">;

function PrefixControls(props: ControlProps): ReactElement {
  const {
    session: { form },
    connectionLabel,
    busy,
    generation,
  } = props;
  return (
    <form.Subscribe
      selector={(state): CachePolicy["prefix"]["action"] => {
        if (!state.values.enabled) {
          return "none";
        }
        return state.values.requestAutomatic === true ? "automatic-request" : "markers";
      }}
    >
      {(action): ReactElement => {
        const off = action === "none";
        return (
          <Stack gap="row">
            <SettingLine
              label="Request prefix caching"
              gloss="Request caching for reusable prompt prefixes. Provider-specific read, write and storage pricing applies. Turning this request off does not disable provider-managed implicit caching."
            >
              <form.Field name="enabled">
                {(field): ReactElement => (
                  <Switch
                    aria-label={`Request prefix caching on ${connectionLabel}`}
                    checked={field.state.value}
                    disabled={busy}
                    onCheckedChange={(on): void => field.handleChange(on)}
                  />
                )}
              </form.Field>
            </SettingLine>
            {generation?.turns?.requestAutomaticPromptCache === true ? (
              <SettingLine
                label="Automatic prefix placement"
                gloss="Opt in to request-wide automatic placement. This replaces manual system/history markers and can incur cache-write charges."
              >
                <form.Field name="requestAutomatic">
                  {(field): ReactElement => (
                    <Switch
                      aria-label={`Automatic prefix placement on ${connectionLabel}`}
                      checked={field.state.value === true}
                      disabled={busy || off}
                      onCheckedChange={(on): void => field.handleChange(on)}
                    />
                  )}
                </form.Field>
              </SettingLine>
            ) : null}
            <ManualMarkers {...props} disabled={off || action === "automatic-request"} />
            <MarkerRetention {...props} off={off} />
          </Stack>
        );
      }}
    </form.Subscribe>
  );
}

function ManualMarkers({ session: { form }, connectionLabel, busy, fixedTtl, disabled }: ControlProps & { readonly disabled: boolean }): ReactElement {
  const depthLabelId = useId();
  const [depthDraft, setDepthDraft] = useState<{ readonly value: number | null } | null>(null);
  const systemGloss =
    fixedTtl === undefined
      ? "Mark the fixed system prompt separately. History cache entries still include preceding system content."
      : "Mark a stable-only system prompt. A dynamic system tail prevents a separate marker; history entries still include the whole system prompt.";
  return (
    <Stack gap="row">
      <SettingLine label="Cache the system prompt" gloss={disabled ? "Enable manual prefix placement to choose this." : systemGloss}>
        <form.Field name="cacheSystem">
          {(field): ReactElement => (
            <Switch
              aria-label={`Cache the system prompt on ${connectionLabel}`}
              checked={field.state.value}
              disabled={busy || disabled}
              onCheckedChange={(on): void => field.handleChange(on)}
            />
          )}
        </form.Field>
      </SettingLine>
      <SettingLine
        label="History cache depth"
        labelId={depthLabelId}
        gloss={
          disabled
            ? "Enable manual prefix placement to choose this."
            : "How many of the newest exchanges stay outside the cache. Empty follows each chat; a number can move the checkpoint further back, never past the administrator's minimum."
        }
      >
        <form.Field name="historyDepth">
          {(field): ReactElement => (
            <NumberField
              aria-label="History cache depth"
              disabled={busy || disabled}
              max={PROMPT_CACHE_DEPTH_BOUNDS.max}
              min={PROMPT_CACHE_DEPTH_BOUNDS.min}
              placeholder="automatic"
              value={depthDraft === null ? field.state.value : depthDraft.value}
              onValueChange={(next): void => setDepthDraft({ value: next })}
              onValueCommitted={(next): void => {
                setDepthDraft(null);
                const depth = promptCacheDepthOf(next);
                if (depth !== undefined && depth !== field.state.value) {
                  field.handleChange(depth);
                }
              }}
              onKeyDown={(event): void => {
                // Base UI treats Enter as navigation; blur reaches the field's single commit path.
                if (event.key === "Enter" && event.target instanceof HTMLElement) {
                  event.target.blur();
                }
              }}
            />
          )}
        </form.Field>
      </SettingLine>
    </Stack>
  );
}

function MarkerRetention({ session: { form }, generation, fixedTtl, policy, busy, off }: ControlProps & { readonly off: boolean }): ReactElement {
  const ttlLabelId = useId();
  if (fixedTtl !== undefined) {
    return (
      <Stack gap="tight">
        <Text voice="label">Cache retention</Text>
        <Text className="max-w-(--reading-measure-prose)" prose={true} voice="gloss">
          {PROMPT_CACHE_TTL_OPTIONS.find((option) => option.value === fixedTtl)?.label} applied by this route. Other saved marker retention choices do not
          apply.{generation?.turns?.cacheRetentionRefresh === false ? " Cache hits do not extend retention." : null}
        </Text>
      </Stack>
    );
  }
  if (generation?.turns?.promptCacheFormat === "openai-breakpoint") {
    const minimum = policy.implicit.minimumRetentionSeconds;
    return (
      <Text className="max-w-(--reading-measure-prose)" prose={true} voice="gloss">
        {minimum === null
          ? "This route uses request-wide prefix retention options; marker TTL choices do not apply."
          : `This model requests at least ${minimum / 60} minutes of prefix retention after the latest write or reuse; the provider may retain it longer. Marker TTL choices do not apply.`}
      </Text>
    );
  }
  return (
    <Stack gap="tight">
      <Text id={ttlLabelId} voice="label">
        Keep the cache for
      </Text>
      <Text className="max-w-(--reading-measure-prose)" prose={true} voice="gloss">
        {off
          ? "Turn the prefix request on to choose this."
          : "Choose the requested marker retention. Cache-write charges and retention refresh depend on the provider and model."}
      </Text>
      <form.Field name="ttl">
        {(field): ReactElement => (
          <RadioGroup
            aria-labelledby={ttlLabelId}
            disabled={busy || off}
            value={field.state.value}
            onValueChange={(value): void => {
              const ttl = promptCacheTtlOf(value);
              if (ttl !== undefined && ttl !== field.state.value) {
                field.handleChange(ttl);
              }
            }}
          >
            {PROMPT_CACHE_TTL_OPTIONS.map((option) => (
              <RadioGroupItem key={option.value} value={option.value}>
                {option.label}
              </RadioGroupItem>
            ))}
          </RadioGroup>
        )}
      </form.Field>
    </Stack>
  );
}

function ProviderControls({ session: { form }, generation, connectionLabel, busy }: ControlProps): ReactElement {
  const retentions = generation?.turns?.promptCacheRetentions;
  return (
    <Stack gap="row">
      {generation?.turns?.disablesImplicitPromptCache === true ? (
        <SettingLine
          label="Disable implicit breakpoints"
          gloss="Request explicit-only prefix caching. On supported models, no markers means no prompt cache writes or reuse. Configured request-body overrides remain authoritative; full-response replay is separate."
        >
          <form.Field name="disableImplicit">
            {(field): ReactElement => (
              <Switch
                aria-label={`Disable implicit breakpoints on ${connectionLabel}`}
                checked={field.state.value === true}
                disabled={busy}
                onCheckedChange={(on): void => field.handleChange(on)}
              />
            )}
          </form.Field>
        </SettingLine>
      ) : null}
      {retentions !== undefined && retentions.length > 0 ? (
        <SettingLine
          label="Provider prefix retention"
          gloss="Leave inherited to use the model and organization's retention policy. This is not a marker TTL or complete-response replay lifetime."
        >
          <form.Field name="retention">
            {(field): ReactElement => (
              <Select
                aria-label={`Provider prefix retention on ${connectionLabel}`}
                disabled={busy}
                items={[
                  { value: "provider-default", label: "Inherit provider default" },
                  ...retentions.map((value) => ({ value, label: value === "24h" ? "Up to 24 hours" : "In memory" })),
                ]}
                onValueChange={(value): void => field.handleChange(promptCacheRetentionOf(value))}
                value={field.state.value ?? "provider-default"}
              />
            )}
          </form.Field>
        </SettingLine>
      ) : null}
    </Stack>
  );
}

const PREFIX_LABELS: Readonly<Record<CachePolicy["prefix"]["action"], string>> = {
  none: "none",
  markers: "manual breakpoints",
  "automatic-request": "request-wide automatic placement",
};
function implicitSupportGloss(supported: boolean | null): string {
  if (supported === true) {
    return "Provider-managed implicit prefix caching is available; eligibility and hits are determined upstream.";
  }
  return supported === false
    ? "Provider-managed implicit prefix caching is not documented as automatic on this route."
    : "Provider-managed implicit prefix cache support is unknown for this route.";
}
function CacheFacts({ policy, warnings }: Pick<ConnectionPromptCacheProps, "policy" | "warnings">): ReactElement {
  return (
    <Stack gap="tight">
      <Text className="max-w-(--reading-measure-prose)" prose={true} voice="gloss">
        {implicitSupportGloss(policy.implicit.supported)}
      </Text>
      <Text voice="gloss">App prefix request: {PREFIX_LABELS[policy.prefix.action]}.</Text>
      {policy.replay.supported ? (
        <Text className="max-w-(--reading-measure-prose)" prose={true} voice="gloss">
          Complete-response replay: {policy.replay.enabled ? "requested by connection headers" : "off by default"}. This is separate from prefix caching;
          upstream settings can still prevent a replay hit.
        </Text>
      ) : null}
      {warnings.map((message) => (
        <Text className="max-w-(--reading-measure-prose)" key={message} prose={true} voice="gloss">
          {message}
        </Text>
      ))}
    </Stack>
  );
}

/** One labelled setting: the label and its gloss on the left, the control floored on the right. */
function SettingLine({
  label,
  labelId,
  gloss,
  children,
}: {
  readonly label: string;
  readonly labelId?: string | undefined;
  readonly gloss: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Row align="start" gap="field" justify="between">
      <Stack className="min-w-0 grow" gap="tight">
        <Text id={labelId} voice="label">
          {label}
        </Text>
        <Text className="max-w-(--reading-measure-prose)" prose={true} voice="gloss">
          {gloss}
        </Text>
      </Stack>
      {children}
    </Row>
  );
}
