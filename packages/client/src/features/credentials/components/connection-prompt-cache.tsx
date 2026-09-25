// The connection editor's Prompt caching tier body: an autosave form (D78) whose save writes the whole settings
// document, so changes inside one save window land as one write. The depth field commits on blur or Enter, never
// per keystroke. With caching off the dependent controls stay rendered and disabled, and their gloss says why.

import type { PromptCacheSettings } from "@orb/contracts/inference";
import { effectivePromptCache, SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import type { UserConnectionId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { NumberField } from "@orb/ui/number-field";
import { RadioGroup, RadioGroupItem } from "@orb/ui/radio-group";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useId, useState } from "react";
import type { AutosaveSession } from "#forms/editor";
import { PromptCacheAutosaveForm } from "../hooks/use-prompt-cache-form.ts";
import { PROMPT_CACHE_DEPTH_BOUNDS, PROMPT_CACHE_TTL_OPTIONS, promptCacheDepthOf, promptCacheTtlOf } from "../lib/prompt-cache-model.ts";

export interface ConnectionPromptCacheProps {
  readonly connectionId: UserConnectionId;
  /** The row's stored settings; `null` is the shipped behavior. */
  readonly stored: PromptCacheSettings | null;
  /** The connection's label, for the controls' accessible names. */
  readonly connectionLabel: string;
  readonly busy: boolean;
  /** Persist the whole document; the autosave session calls it once per save window. */
  readonly save: (next: PromptCacheSettings) => Promise<unknown>;
  /** Write `null`, so the connection goes back to the shipped behavior. */
  readonly onReset: () => void;
}

export function ConnectionPromptCache({ connectionId, stored, save, ...body }: ConnectionPromptCacheProps): ReactElement {
  return (
    <PromptCacheAutosaveForm entityId={connectionId} save={save} serverValues={effectivePromptCache(stored)}>
      {(session): ReactElement => <PromptCacheBody {...body} hasStored={stored !== null} session={session} />}
    </PromptCacheAutosaveForm>
  );
}

interface PromptCacheBodyProps {
  readonly session: AutosaveSession<PromptCacheSettings>;
  readonly hasStored: boolean;
  readonly connectionLabel: string;
  readonly busy: boolean;
  readonly onReset: () => void;
}

function PromptCacheBody({ session, hasStored, connectionLabel, busy, onReset }: PromptCacheBodyProps): ReactElement {
  const { form, reseed } = session;
  const depthLabelId = useId();
  const ttlLabelId = useId();
  // The depth field's IN-PROGRESS edit, boxed because a cleared field (`null`) is an edit; `null` = not editing.
  const [depthDraft, setDepthDraft] = useState<{ readonly value: number | null } | null>(null);
  // The reset drops any edit still inside the save window before it writes NULL, so the edit cannot land after it.
  const resetToDefaults = (): void => {
    reseed(SHIPPED_PROMPT_CACHE);
    onReset();
  };

  return (
    <form.Subscribe selector={(state): boolean => !state.values.enabled}>
      {(off): ReactElement => (
        <Stack data-slot="connection-prompt-cache" gap="row">
          <SettingLine
            gloss="The provider keeps the unchanged start of each request for a while, so the next turn re-reads it at a tenth of the input price instead of paying for it again."
            label="Cache prompts"
          >
            <form.Field name="enabled">
              {(field): ReactElement => (
                <Switch
                  aria-label={`Cache prompts on ${connectionLabel}`}
                  checked={field.state.value}
                  className="shrink-0"
                  disabled={busy}
                  onCheckedChange={(checked): void => field.handleChange(checked)}
                />
              )}
            </form.Field>
          </SettingLine>
          <SettingLine
            gloss={
              off ? "Turn caching on to choose this." : "The fixed part of the system prompt. Turn it off if you'd rather not have it stored between turns."
            }
            label="Cache the system prompt"
          >
            <form.Field name="cacheSystem">
              {(field): ReactElement => (
                <Switch
                  aria-label={`Cache the system prompt on ${connectionLabel}`}
                  checked={field.state.value}
                  className="shrink-0"
                  disabled={busy || off}
                  onCheckedChange={(checked): void => field.handleChange(checked)}
                />
              )}
            </form.Field>
          </SettingLine>
          <SettingLine
            gloss={
              off
                ? "Turn caching on to choose this."
                : "How many of the newest exchanges stay outside the cache. Empty follows each chat on its own; a number only ever moves it further back, never past the administrator's minimum."
            }
            label="History cache depth"
            labelId={depthLabelId}
          >
            <form.Field name="historyDepth">
              {(field): ReactElement => (
                <NumberField
                  aria-labelledby={depthLabelId}
                  disabled={busy || off}
                  max={PROMPT_CACHE_DEPTH_BOUNDS.max}
                  min={PROMPT_CACHE_DEPTH_BOUNDS.min}
                  onKeyDown={(event): void => {
                    // Enter is a NAVIGATE key for Base UI's NumberField and does not commit; blur routes it through
                    // the one commit path.
                    if (event.key === "Enter" && event.target instanceof HTMLElement) {
                      event.target.blur();
                    }
                  }}
                  onValueChange={(next): void => setDepthDraft({ value: next })}
                  onValueCommitted={(next): void => {
                    setDepthDraft(null);
                    const historyDepth = promptCacheDepthOf(next);
                    if (historyDepth !== undefined && historyDepth !== field.state.value) {
                      field.handleChange(historyDepth);
                    }
                  }}
                  placeholder="automatic"
                  value={depthDraft === null ? field.state.value : depthDraft.value}
                />
              )}
            </form.Field>
          </SettingLine>
          <Stack gap="tight">
            <Text id={ttlLabelId} voice="label">
              Keep the cache for
            </Text>
            <Text voice="gloss">
              {off
                ? "Turn caching on to choose this."
                : "Writing to the cache costs more than plain input. The longer time pays off when you pause for more than five minutes between turns."}
            </Text>
            <form.Field name="ttl">
              {(field): ReactElement => (
                <RadioGroup
                  aria-labelledby={ttlLabelId}
                  disabled={busy || off}
                  onValueChange={(value): void => {
                    const ttl = promptCacheTtlOf(value);
                    if (ttl !== undefined && ttl !== field.state.value) {
                      field.handleChange(ttl);
                    }
                  }}
                  value={field.state.value}
                >
                  {PROMPT_CACHE_TTL_OPTIONS.map((option) => (
                    <RadioGroupItem key={option.value} value={option.value}>
                      {`${option.label} · writes cost ${option.writeCost} input`}
                    </RadioGroupItem>
                  ))}
                </RadioGroup>
              )}
            </form.Field>
          </Stack>
          {hasStored ? (
            <Row justify="start">
              <Button disabled={busy} intent="secondary" onClick={resetToDefaults} size="sm">
                Use the defaults
              </Button>
            </Row>
          ) : null}
        </Stack>
      )}
    </form.Subscribe>
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
        <Text voice="gloss">{gloss}</Text>
      </Stack>
      {children}
    </Row>
  );
}
