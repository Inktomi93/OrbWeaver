// The MODEL PICKER for connection authoring (inference program §5.3a Essential tier, §7.4 policy): a searchable
// list over whatever catalog its caller read, with skeleton rows while it loads, an empty and an error arm,
// and the explicit typed-id option where the provider's policy permits it. CONTROLLED: the caller owns the
// value (a form field) and the source (`model-catalog-model.ts`), so the same control serves the add dialog's
// endpoint draft, the saved-key "Add another model on this key" path, and any later draft read.
//
// INLINE, NOT A POPOVER. It lives inside a dialog whose whole job at this step is picking the model, so the
// list is the surface: focus lands in the search box, arrows rove the rows (cmdk), Enter picks. A popover
// inside a modal would add a second focus trap for no gain.
//
// THE TYPED ID IS A BUTTON, NOT AN OPTION. As a list row it would be announced as a model the provider
// lists, and cmdk's first-match selection would let Enter in the search box pick it over a real partial
// match. Beside the list it is one Tab away and says exactly what it writes.
//
// THE PICKED VALUE IS SPOKEN BELOW THE LIST, NOT BY THE ROW. cmdk's `aria-selected` is its roving highlight,
// not the chosen value, so a row cannot say "this is the one you picked" through it. The chosen row carries a
// visible badge, and the status line under the list names the pick in words (with §5.3a's `modelListed:
// false` sentence when the pick is typed).

import type { ModelCatalogEntry } from "@orb/contracts/inference";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Command, CommandAuxiliaryButton, CommandEmpty, CommandInput, CommandItem, CommandList, CommandLoading, CommandStatus } from "@orb/ui/command";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId, useState } from "react";
import type { isListedModel, ModelPickerView } from "../lib/model-catalog-model.ts";
import { modelEntryLabel, modelPickerView, showsModelId, typedOption, unlistedModelSentence } from "../lib/model-catalog-model.ts";

const SKELETON_ROW_KEYS = ["first", "second", "third"] as const;

/** The source shape, derived from the lib that owns it (a feature `lib/` exports no type aliases). */
type ModelCatalogSource = Parameters<typeof isListedModel>[0];

export interface ModelCatalogPickerProps {
  readonly source: ModelCatalogSource;
  /** The picked model id (`""` = none yet). */
  readonly value: string;
  readonly onValueChange: (modelId: string) => void;
  /** §7.4: whether an id the list does not carry may be saved (`typedModelAllowed`). */
  readonly typedAllowed: boolean;
  /** Whose list this is, in the user's words — a provider label, or an endpoint's host. */
  readonly listOwner: string;
  /** The form's validation message for the field, when it has one to show. */
  readonly error: string | null;
}

export function ModelCatalogPicker(props: ModelCatalogPickerProps): ReactElement {
  const view = modelPickerView(props.source, { listOwner: props.listOwner, typedAllowed: props.typedAllowed });
  return view.notice === null ? <ListedPicker {...props} models={view.models} /> : <TypedModelField {...props} notice={view.notice} view={view} />;
}

/** The searchable list. `models: null` is the loading arm: the same frame with skeleton rows in it, so the
 *  dialog does not jump when the catalog lands. */
function ListedPicker({
  value,
  onValueChange,
  typedAllowed,
  listOwner,
  error,
  models,
}: ModelCatalogPickerProps & { readonly models: readonly ModelCatalogEntry[] | null }): ReactElement {
  const labelId = useId();
  // cmdk labels its input with the root's `label` through `aria-labelledby`, which outranks the input's own
  // `aria-label`, so the search box's name is spelled here.
  const searchName = `Search ${listOwner} models`;
  const [term, setTerm] = useState("");
  const typed = models === null ? null : typedOption({ term, models, allowed: typedAllowed });

  return (
    <Stack gap="tight">
      <Text as="span" id={labelId} voice="label">
        Model
      </Text>
      <Command aria-labelledby={labelId} label={searchName}>
        <CommandInput aria-label={searchName} disabled={models === null} onValueChange={setTerm} placeholder="Search models…" value={term} />
        <CommandList listSize="compact">
          {models === null ? (
            <CommandLoading label={`Loading ${listOwner} models…`}>
              <Stack className="w-full" gap="field" padding="row">
                {SKELETON_ROW_KEYS.map((key) => (
                  <Skeleton className="h-control-sm w-full" key={key} />
                ))}
              </Stack>
            </CommandLoading>
          ) : (
            <>
              {/* Only in this branch: cmdk's Empty renders on a zero count, and a loading list has zero rows. */}
              <CommandEmpty>No listed model matches “{term.trim()}”.</CommandEmpty>
              {models.map((entry) => (
                <CommandItem key={entry.id} keywords={[modelEntryLabel(entry)]} onSelect={(): void => onValueChange(entry.id)} value={entry.id}>
                  <ModelRow entry={entry} picked={entry.id === value} />
                </CommandItem>
              ))}
            </>
          )}
        </CommandList>
        <CommandStatus />
        {typed === null ? null : (
          <Row gap="field" padding="row">
            <CommandAuxiliaryButton intent="secondary" onClick={(): void => onValueChange(typed)} size="sm">
              Use “{typed}” as typed
            </CommandAuxiliaryButton>
          </Row>
        )}
      </Command>
      <PickedLine error={error} listOwner={listOwner} models={models} value={value} />
    </Stack>
  );
}

function ModelRow({ entry, picked }: { readonly entry: ModelCatalogEntry; readonly picked: boolean }): ReactElement {
  return (
    <Row align="center" className="min-w-0 flex-1" gap="row">
      <Stack className="min-w-0 flex-1" gap="tight">
        <Text as="span" className="truncate" ink="inherit">
          {modelEntryLabel(entry)}
        </Text>
        {showsModelId(entry) ? (
          <Text as="span" className="truncate" voice="datumMono">
            {entry.id}
          </Text>
        ) : null}
      </Stack>
      {picked ? (
        <Badge intent="primary" size="sm" tone="soft">
          Selected
        </Badge>
      ) : null}
    </Row>
  );
}

/** The status line under the list: what is picked, in words, or the field's error when nothing is. */
function PickedLine({
  value,
  models,
  listOwner,
  error,
}: {
  readonly value: string;
  readonly models: readonly ModelCatalogEntry[] | null;
  readonly listOwner: string;
  readonly error: string | null;
}): ReactElement {
  const picked = models?.find((entry) => entry.id === value.trim()) ?? null;
  if (value.trim() === "") {
    return error === null ? (
      <Text data-slot="model-picker-picked" role="status" voice="gloss">
        No model picked yet.
      </Text>
    ) : (
      <Text className="text-destructive" data-slot="model-picker-picked" role="alert" voice="gloss">
        {error}
      </Text>
    );
  }
  // While the list loads there is nothing to judge the pick against yet, so it is only named.
  if (picked !== null || models === null) {
    return (
      <Text data-slot="model-picker-picked" role="status" voice="gloss">
        Picked: {picked === null ? value : modelEntryLabel(picked)}
        {picked !== null && showsModelId(picked) ? ` (${picked.id})` : ""}
      </Text>
    );
  }
  return (
    <Text className="text-warning" data-slot="model-picker-picked" role="status" voice="gloss">
      Picked: {value} — {unlistedModelSentence(listOwner)}
    </Text>
  );
}

/** The typed arm: no list to pick from (empty, failed, or none read). When policy forbids a typed id after a
 *  list was read, it says why nothing can be picked and offers only the retry. */
function TypedModelField({
  value,
  onValueChange,
  error,
  notice,
  view,
}: ModelCatalogPickerProps & { readonly notice: string; readonly view: ModelPickerView }): ReactElement {
  return (
    <Stack gap="tight">
      {view.typingOffered ? (
        <Field description={notice} error={error} label="Model">
          <Input autoComplete="off" onChange={(event): void => onValueChange(event.target.value)} placeholder="e.g. anthropic/claude-opus-5" value={value} />
        </Field>
      ) : (
        <>
          <Text as="span" voice="label">
            Model
          </Text>
          <Text className={view.warns ? "text-warning" : undefined} data-slot="model-picker-notice" voice="gloss">
            {notice}
          </Text>
          {error === null ? null : (
            <Text className="text-destructive" role="alert" voice="gloss">
              {error}
            </Text>
          )}
        </>
      )}
      {view.retry === null ? null : (
        <Row gap="field">
          <Button intent="secondary" onClick={view.retry} size="sm">
            Try the list again
          </Button>
        </Row>
      )}
    </Stack>
  );
}
