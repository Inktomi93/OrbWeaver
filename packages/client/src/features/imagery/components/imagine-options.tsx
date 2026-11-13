import type { SizePresetName } from "@orb/contracts/imagery";
import { MAX_IMAGE_COUNT, MAX_NEGATIVE_CHARS, MIN_IMAGE_COUNT, SIZE_PRESET_NAMES } from "@orb/contracts/imagery";
import { sentenceCase } from "@orb/kit/strings";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement } from "react";
import { useId } from "react";
import { CappedFieldCounter } from "#forms/editor";
import { IMAGE_SIZE_LABELS, IMAGE_SIZE_MODE_DEFAULT } from "#lib";
import { IMAGINE_COUNT_NAME, IMAGINE_MORE_OPTIONS_NAME, IMAGINE_NEGATIVE_NAME, IMAGINE_SIZE_NAME, imagineCountSpendText } from "../lib/imagine-names.ts";

const IMAGE_COUNTS = Array.from({ length: MAX_IMAGE_COUNT - MIN_IMAGE_COUNT + 1 }, (_, index) => String(MIN_IMAGE_COUNT + index));
// The default sends no size, so the server keeps choosing the shape each mode's composition assumes.
const DEFAULT_SIZE = "default";
const SIZE_CHOICES = [DEFAULT_SIZE, ...SIZE_PRESET_NAMES] as const;
type SizeChoice = (typeof SIZE_CHOICES)[number];
const SIZE_LABELS: Record<SizeChoice, string> = { default: sentenceCase(IMAGE_SIZE_MODE_DEFAULT), ...IMAGE_SIZE_LABELS };
const NEGATIVE_ROWS = 2;
const NEGATIVE_MAX_ROWS = 6;

export interface ImagineOptionsProps {
  readonly busy: boolean;
  /** A room member's picture runs on the host's connection and bill (D298). */
  /** `undefined` until the room read says who the viewer is: no payer is named before then. */
  readonly hostPays: boolean | undefined;
  readonly count: number;
  readonly onCount: (count: number) => void;
  readonly size: SizePresetName | undefined;
  readonly onSize: (size: SizePresetName | undefined) => void;
  readonly negative: string;
  readonly onNegative: (negative: string) => void;
}

/** The imagine modal's advanced image controls, collapsed by default. Disabled mid-spend like the mode strip:
 *  the in-flight request already carries the old values. */
export function ImagineOptions({ busy, hostPays, count, onCount, size, onSize, negative, onNegative }: ImagineOptionsProps): ReactElement {
  const countLabelId = useId();
  const sizeLabelId = useId();
  return (
    <Collapsible>
      <CollapsibleTrigger>{IMAGINE_MORE_OPTIONS_NAME}</CollapsibleTrigger>
      <CollapsiblePanel holds="controls">
        <Stack paddingBlockStart="row" gap="block">
          <Stack gap="field">
            <Text as="span" id={countLabelId} voice="label">
              {IMAGINE_COUNT_NAME}
            </Text>
            {/* Filled cells share the dialog's width, so a single digit still meets the touch floor on a phone. */}
            <ToggleGroup
              aria-labelledby={countLabelId}
              disabled={busy}
              fill={true}
              onValueChange={(next): void => {
                if (next[0] !== undefined) {
                  onCount(Number(next[0]));
                }
              }}
              value={[String(count)]}
            >
              {IMAGE_COUNTS.map((value) => (
                <Toggle variant="outline" key={value} size="chip" value={value}>
                  {value}
                </Toggle>
              ))}
            </ToggleGroup>
          </Stack>
          <Stack gap="field">
            <Text as="span" id={sizeLabelId} voice="label">
              {IMAGINE_SIZE_NAME}
            </Text>
            <ToggleGroup
              aria-labelledby={sizeLabelId}
              disabled={busy}
              onValueChange={(next): void => {
                const picked = SIZE_CHOICES.find((id) => id === next[0]);
                if (picked !== undefined) {
                  onSize(picked === DEFAULT_SIZE ? undefined : picked);
                }
              }}
              value={[size ?? DEFAULT_SIZE]}
            >
              {SIZE_CHOICES.map((id) => (
                <Toggle variant="outline" key={id} size="sm" value={id}>
                  {SIZE_LABELS[id]}
                </Toggle>
              ))}
            </ToggleGroup>
          </Stack>
          <Stack gap="field">
            <Text as="span" voice="label">
              {IMAGINE_NEGATIVE_NAME}
            </Text>
            <Textarea
              aria-label={IMAGINE_NEGATIVE_NAME}
              disabled={busy}
              maxLength={MAX_NEGATIVE_CHARS}
              maxRows={NEGATIVE_MAX_ROWS}
              onValueChange={(value): void => onNegative(value)}
              placeholder="What to keep out of the image"
              rows={NEGATIVE_ROWS}
              value={negative}
            />
            <CappedFieldCounter length={negative.length} max={MAX_NEGATIVE_CHARS} />
          </Stack>
          {/* Last in the panel, beside the Generate it prices: a line that appears above the size and the negative would
              move the control the finger is on. Mounted before it has words, so a screen reader announces the spend the
              moment a count above one is picked. */}
          <Stack aria-live="polite" role="status">
            {count > MIN_IMAGE_COUNT && hostPays !== undefined ? (
              <Text cap="prose" data-slot="imagine-count-spend" voice="reading">
                {imagineCountSpendText(count, hostPays)}
              </Text>
            ) : null}
          </Stack>
        </Stack>
      </CollapsiblePanel>
    </Collapsible>
  );
}
