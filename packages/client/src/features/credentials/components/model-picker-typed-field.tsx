// The ModelPicker's typed-only arm: no list to pick from (empty, failed, or none read). Split out of
// model-picker.tsx to keep that file under the component-size cap.

import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId } from "react";
import type { ModelPickerView } from "../lib/model-picker-model.ts";

/** The typed arm: no list to pick from (empty, failed, or none read). When policy forbids a typed id, it
 *  says why nothing can be picked and offers only the retry, which stays mounted and `busy` while the list
 *  reloads. Takes the slice of `ModelPickerProps` it reads (not the whole interface: importing it back from
 *  model-picker.tsx, which composes this file, would be circular). */
export function TypedModelField({
  value,
  onValueChange,
  error,
  notice,
  view,
  placeholder,
  busy,
  onRetry,
}: {
  readonly value: string;
  readonly onValueChange: (modelId: ModelId) => void;
  readonly error: string | null;
  readonly placeholder: string;
  readonly notice: string;
  readonly view: ModelPickerView;
  readonly busy: boolean;
  readonly onRetry: (() => void) | null;
}): ReactElement {
  const errorId = useId();
  return (
    <Stack gap="tight">
      {view.typingOffered ? (
        <Field
          description={
            <Text as="span" className={view.warns ? "text-warning" : undefined} data-slot="model-picker-notice" prose={true} voice="gloss">
              {notice}
            </Text>
          }
          error={error}
          label="Model"
        >
          <Input autoComplete="off" onChange={(event): void => onValueChange(castId<ModelId>(event.target.value))} placeholder={placeholder} value={value} />
        </Field>
      ) : (
        <>
          <Text as="span" voice="label">
            Model
          </Text>
          <Text
            className={view.warns ? "max-w-(--reading-measure-prose) text-warning" : "max-w-(--reading-measure-prose)"}
            data-slot="model-picker-notice"
            prose={true}
            voice="gloss"
          >
            {notice}
          </Text>
          {error === null ? null : (
            <Text className="text-destructive" id={errorId} prose={true} role="alert" voice="gloss">
              {error}
            </Text>
          )}
        </>
      )}
      {view.retry === null ? null : (
        <Row gap="field">
          <Button intent="secondary" loading={busy} onClick={onRetry ?? undefined} size="sm">
            Try the list again
          </Button>
        </Row>
      )}
    </Stack>
  );
}
