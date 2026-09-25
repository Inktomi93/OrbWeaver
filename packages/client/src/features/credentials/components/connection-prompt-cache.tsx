// The connection editor's Prompt caching tier body. Each control autosaves the whole settings document (D66 A4);
// the depth field commits on blur or Enter, never per keystroke. With caching off the dependent controls stay
// rendered and disabled, and their gloss says why.

import type { PromptCacheSettings } from "@orb/contracts/inference";
import { effectivePromptCache } from "@orb/contracts/inference";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { NumberField } from "@orb/ui/number-field";
import { RadioGroup, RadioGroupItem } from "@orb/ui/radio-group";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useId, useState } from "react";
import { PROMPT_CACHE_DEPTH_BOUNDS, PROMPT_CACHE_TTL_OPTIONS, promptCacheDepthOf, promptCacheTtlOf, withPromptCache } from "../lib/prompt-cache-model.ts";

export interface ConnectionPromptCacheProps {
  /** The row's stored settings; `null` is the shipped behavior. */
  readonly stored: PromptCacheSettings | null;
  /** The connection's label, for the controls' accessible names. */
  readonly connectionLabel: string;
  readonly busy: boolean;
  /** Write the whole document, or `null` to go back to the shipped behavior. */
  readonly onCommit: (next: PromptCacheSettings | null) => void;
}

export function ConnectionPromptCache({ stored, connectionLabel, busy, onCommit }: ConnectionPromptCacheProps): ReactElement {
  const settings = effectivePromptCache(stored);
  const off = !settings.enabled;
  const depthLabelId = useId();
  const ttlLabelId = useId();
  const commit = (change: Partial<PromptCacheSettings>): void => onCommit(withPromptCache(stored, change));
  // The depth field's IN-PROGRESS edit, boxed because a cleared field (`null`) is an edit; `null` = not editing.
  const [depthDraft, setDepthDraft] = useState<{ readonly value: number | null } | null>(null);

  return (
    <Stack data-slot="connection-prompt-cache" gap="row">
      <SettingLine
        gloss="The provider keeps the unchanged start of each request for a while, so the next turn re-reads it at a tenth of the input price instead of paying for it again."
        label="Cache prompts"
      >
        <Switch
          aria-label={`Cache prompts on ${connectionLabel}`}
          checked={settings.enabled}
          className="shrink-0"
          disabled={busy}
          onCheckedChange={(checked): void => commit({ enabled: checked })}
        />
      </SettingLine>
      <SettingLine
        gloss={off ? "Turn caching on to choose this." : "The fixed part of the system prompt. Turn it off if you'd rather not have it stored between turns."}
        label="Cache the system prompt"
      >
        <Switch
          aria-label={`Cache the system prompt on ${connectionLabel}`}
          checked={settings.cacheSystem}
          className="shrink-0"
          disabled={busy || off}
          onCheckedChange={(checked): void => commit({ cacheSystem: checked })}
        />
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
            if (historyDepth !== undefined && historyDepth !== settings.historyDepth) {
              commit({ historyDepth });
            }
          }}
          placeholder="automatic"
          value={depthDraft === null ? settings.historyDepth : depthDraft.value}
        />
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
        <RadioGroup
          aria-labelledby={ttlLabelId}
          disabled={busy || off}
          onValueChange={(value): void => {
            const ttl = promptCacheTtlOf(value);
            if (ttl !== undefined && ttl !== settings.ttl) {
              commit({ ttl });
            }
          }}
          value={settings.ttl}
        >
          {PROMPT_CACHE_TTL_OPTIONS.map((option) => (
            <RadioGroupItem key={option.value} value={option.value}>
              {`${option.label} · writes cost ${option.writeCost} input`}
            </RadioGroupItem>
          ))}
        </RadioGroup>
      </Stack>
      {stored === null ? null : (
        <Row justify="start">
          <Button disabled={busy} intent="secondary" onClick={(): void => onCommit(null)} size="sm">
            Use the defaults
          </Button>
        </Row>
      )}
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
        <Text voice="gloss">{gloss}</Text>
      </Stack>
      {children}
    </Row>
  );
}
