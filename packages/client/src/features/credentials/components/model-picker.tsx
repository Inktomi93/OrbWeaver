// The ModelPicker for connection authoring (inference program §5.3a Essential tier, §7.4 policy). Ported from
// the picker the inference cut-over deleted, and adapted to the connection era: `<Command shouldFilter={false}>`
// with the search through `@orb/ui/fuzzy-search` (never minisearch or cmdk's own filter — dep-cruiser
// `ui-satellite-seals`), the list sectioned by provider (`groupModelEntries`) under the device-local Recent
// MRU, the Vision/Tools chips where the catalog states capabilities, and the render cap spent across sections.
// A model joins Recent when its connection is SAVED (`pushRecentModel` in the dialogs), never on a pick, so
// picking a row neither reorders the list nor shows the row twice; a Recent row is left out of its section.
//
// WHAT CHANGED IN THE PORT. The catalog is an INPUT with four states (`model-picker-model.ts`), not a
// per-source query this file owns, so the saved-key path, the endpoint draft and any later draft read feed one
// control. The list is INLINE in the dialog rather than behind a popover: the dialog's whole job at this step
// is picking the model, and a popover inside a modal is a second focus trap. The typed id follows the
// provider's catalog policy (`typedModelAllowed`) and is a BUTTON beside the list, never a row the provider
// did not list.
//
// ENTER NEVER SAVES A LOOSE MATCH. The fuzzy search keeps showing near misses — a typo still finds its model —
// but the highlight follows cmdk only once the user moves through the list, or for the result whose id or
// name IS what was typed (`isExactMatch`). With none, nothing is highlighted and Enter takes the typed option,
// which is never offered for a term with a space in it (a multi-word search, not an id).
//
// A RETRY KEEPS ITS BUTTON. "Try the list again" stays mounted and busy while the list reloads, so focus
// stays on it; the list replaces it only once it lands.
//
// THE PICKED VALUE IS SPOKEN BELOW THE LIST, NOT BY THE ROW. cmdk's `aria-selected` is its roving highlight,
// not the chosen value; the chosen row carries a badge and the status line names the pick in words (with
// §5.3a's `modelListed: false` sentence when the pick is typed).

import type { ModelCatalogEntry } from "@orb/contracts/inference";
import { Button } from "@orb/ui/button";
import {
  Command,
  CommandAuxiliaryButton,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
  CommandStatus,
} from "@orb/ui/command";
import { Field } from "@orb/ui/field";
import { useFuzzySearch } from "@orb/ui/fuzzy-search";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { KeyboardEvent, PointerEvent, ReactElement } from "react";
import { useDeferredValue, useEffect, useId, useRef, useState } from "react";
import { useRecentModels } from "#state";
import type { isListedModel, ModelPickerView, PickerEntry } from "../lib/model-picker-model.ts";
import {
  filterByChips,
  groupModelEntries,
  hasMultiModelVendor,
  isExactMatch,
  modelPickerView,
  offersCapabilityChips,
  pickerEntryOf,
  resolveRecentEntries,
  TOOLS_CHIP,
  typedOption,
  unlistedModelSentence,
  VISION_CHIP,
} from "../lib/model-picker-model.ts";
import { ModelPickerRow } from "./model-picker-row.tsx";

const SKELETON_ROW_KEYS = ["first", "second", "third"] as const;
/** The keys that move cmdk's highlight — the user's first one hands the highlight to cmdk. */
const NAVIGATION_KEYS: ReadonlySet<string> = new Set(["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"]);
/** A Recent row repeats a listed id; cmdk needs every item value unique, so the Recent copy is prefixed. */
const RECENT_VALUE_PREFIX = "recent:";
/** Two values that name no row. cmdk re-reads a controlled `value` only when the prop CHANGES, and moves its
 *  own selection to the first row on every search; alternating these re-asserts "nothing highlighted". */
const NO_ROW_VALUES = ["orb:no-row:0", "orb:no-row:1"] as const;
/** No list yet: one array, so the search index keyed on its identity is not rebuilt per render. */
const NO_MODELS: readonly ModelCatalogEntry[] = [];

/** The model id a highlight names (a Recent row's value carries a prefix). */
function modelIdOf(highlight: string): string {
  return highlight.startsWith(RECENT_VALUE_PREFIX) ? highlight.slice(RECENT_VALUE_PREFIX.length) : highlight;
}

/** The source shape, derived from the lib that owns it (a feature `lib/` exports no type aliases). */
type ModelCatalogSource = Parameters<typeof isListedModel>[0];

export interface ModelPickerProps {
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
  /** An example id in the provider's own spelling, for the typed field (`modelIdExample`). */
  readonly placeholder: string;
  /** The device-local Recent MRU's key — the provider id, so each provider keeps its own recent picks. */
  readonly recentKey: string;
  /** A model already on a saved connection this picker adds beside — marked in the list, still pickable. */
  readonly currentModel?: string | null;
}

export function ModelPicker(props: ModelPickerProps): ReactElement {
  const view = modelPickerView(props.source, { listOwner: props.listOwner, typedAllowed: props.typedAllowed });
  // The failed arm a retry was pressed on, held until the reload it started has answered. A caller may move
  // the source to "loading" a render after the press (a query refetch notifies on its own schedule), so the
  // hold ends only once a load was seen and is over.
  const [retrying, setRetrying] = useState<{ readonly view: ModelPickerView; readonly loadSeen: boolean } | null>(null);
  const loading = props.source.status === "loading";
  if (retrying !== null && loading && !retrying.loadSeen) {
    setRetrying({ view: retrying.view, loadSeen: true });
  }
  if (retrying !== null && !loading && retrying.loadSeen) {
    setRetrying(null);
  }
  if (retrying !== null && retrying.view.notice !== null && (loading || !retrying.loadSeen)) {
    return <TypedModelField {...props} busy={true} notice={retrying.view.notice} onRetry={null} view={retrying.view} />;
  }
  const retry = view.retry;
  const onRetry =
    retry === null
      ? null
      : (): void => {
          setRetrying({ view, loadSeen: false });
          retry();
        };
  return view.notice === null ? (
    <ListedPicker {...props} models={view.models} />
  ) : (
    <TypedModelField {...props} busy={false} notice={view.notice} onRetry={onRetry} view={view} />
  );
}

/** The searchable list. `models: null` is the loading arm: the same frame with skeleton rows in it, so the
 *  dialog does not jump when the catalog lands. */
function ListedPicker(props: ModelPickerProps & { readonly models: readonly ModelCatalogEntry[] | null }): ReactElement {
  const { value, onValueChange, typedAllowed, listOwner, error, recentKey, models } = props;
  const labelId = useId();
  const pickerId = useId();
  const errorId = useId();
  // cmdk labels its input with the root's `label` through `aria-labelledby`, which outranks the input's own
  // `aria-label`, so the search box's name is spelled here.
  const searchName = `Search ${listOwner} models`;
  const [term, setTerm] = useState("");
  const [chips, setChips] = useState<readonly string[]>([]);
  const [highlight, setHighlight] = useState("");
  const [navigated, setNavigated] = useState(false);
  const [reassertions, setReassertions] = useState(0);
  // The same fact for cmdk's own handlers: a navigation key's highlight move runs in the SAME event as the
  // keydown that set `navigated`, before the state is visible to this render's closures.
  const navigatingRef = useRef(false);
  const recentIds = useRecentModels(recentKey);
  const view = usePickerView({ models, term, chips, recentIds, pinnedIds: [value, props.currentModel ?? ""], listOwner });
  const typed = models === null ? null : typedOption({ term, models, allowed: typedAllowed });
  const listReady = models !== null;
  // Until the user moves through the list, the highlight is ours: the row that IS what was typed, or nothing —
  // so Enter picks that row or falls through to the typed option, never a loose or arbitrary one.
  const activeValue = navigated ? highlight : (view.groups.flatMap((group) => group.entries).find((entry) => isExactMatch(entry, term))?.id ?? "");
  const noRowValue = reassertions % 2 === 0 ? NO_ROW_VALUES[0] : NO_ROW_VALUES[1];
  const commandValue = activeValue === "" ? noRowValue : activeValue;

  // The search box takes the caret the moment there is a list to search — after "List models" answers, and
  // when a saved row's catalog lands — so focus never falls back to the document. Found through the picker's
  // own box: cmdk mints the input's id, and `CommandInput` keeps its ref for its own ARIA corrections.
  useEffect(() => {
    if (listReady) {
      document.getElementById(pickerId)?.querySelector<HTMLInputElement>("input[cmdk-input]")?.focus();
    }
  }, [listReady, pickerId]);

  // A pointer the user MOVES over the list hands it the highlight. Chromium also fires a zero-movement
  // pointermove when the list renders under a still cursor; that one is not the user choosing a row.
  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.movementX !== 0 || event.movementY !== 0) {
      navigatingRef.current = true;
      setNavigated(true);
    }
  };

  // Typing starts a new search, so the highlight is ours again until the user moves through the new results.
  const onSearch = (next: string): void => {
    setTerm(next);
    navigatingRef.current = false;
    setNavigated(false);
  };

  // cmdk proposes a highlight on every search and every move. A move the user made is taken; any other
  // proposal is refused by re-asserting our own value, so the row cmdk marks is always the row Enter picks.
  const onHighlight = (next: string): void => {
    if (navigatingRef.current) {
      setHighlight(next);
    } else if (next !== commandValue) {
      setReassertions((count) => count + 1);
    }
  };

  // Enter is ours: the highlighted row when there is one, else the typed option — never cmdk's own pick.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (NAVIGATION_KEYS.has(event.key)) {
      navigatingRef.current = true;
      setNavigated(true);
    }
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    const picked = activeValue === "" ? typed : modelIdOf(activeValue);
    if (picked !== null) {
      onValueChange(picked);
    }
  };

  return (
    <Stack gap="tight" id={pickerId}>
      <Text as="span" id={labelId} voice="label">
        Model
      </Text>
      <Command aria-labelledby={labelId} label={searchName} onKeyDown={onKeyDown} onValueChange={onHighlight} shouldFilter={false} value={commandValue}>
        <CommandInput
          aria-describedby={error === null ? undefined : errorId}
          aria-invalid={error !== null}
          aria-label={searchName}
          disabled={models === null}
          onValueChange={onSearch}
          placeholder="Search models…"
          value={term}
        />
        {view.showChips ? (
          <Row align="center" gap="field" padding="row">
            <ToggleGroup aria-label="Filter models" multiple={true} onValueChange={setChips} value={[...chips]}>
              <Toggle size="sm" value={VISION_CHIP}>
                Vision
              </Toggle>
              <Toggle size="sm" value={TOOLS_CHIP}>
                Tools
              </Toggle>
            </ToggleGroup>
          </Row>
        ) : null}
        <CommandList label={`Models on ${listOwner}`} listSize="compact" onPointerMove={onPointerMove}>
          {models === null ? (
            <CommandLoading label={`Loading ${listOwner} models…`}>
              <Stack data-slot="model-picker-skeleton" gap="field" padding="row">
                {SKELETON_ROW_KEYS.map((key) => (
                  <Skeleton className="h-control-sm w-full" key={key} />
                ))}
              </Stack>
            </CommandLoading>
          ) : (
            <>
              {/* Only in this branch: cmdk's Empty renders on a zero count, and a loading list has zero rows. */}
              <CommandEmpty>No listed model matches “{term.trim()}”.</CommandEmpty>
              {view.recentEntries.length > 0 ? (
                <CommandGroup heading="Recent">
                  {view.recentEntries.map((entry) => (
                    <CommandItem key={`recent-${entry.id}`} onSelect={(): void => onValueChange(entry.id)} value={`${RECENT_VALUE_PREFIX}${entry.id}`}>
                      <ModelPickerRow current={entry.id === props.currentModel} entry={entry} picked={entry.id === value} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {view.groups.map((group) => (
                <CommandGroup heading={group.heading ?? undefined} key={group.key}>
                  {group.entries.map((entry) => (
                    <CommandItem key={entry.id} onSelect={(): void => onValueChange(entry.id)} value={entry.id}>
                      <ModelPickerRow current={entry.id === props.currentModel} entry={entry} picked={entry.id === value} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </>
          )}
        </CommandList>
        {/* The count is news only once there is a list: while it loads it would announce "0 results". */}
        {models === null ? null : <CommandStatus />}
        {view.overflow > 0 ? (
          <Row padding="row">
            <Text voice="gloss">{`+${view.overflow} more — keep typing to narrow`}</Text>
          </Row>
        ) : null}
        {typed === null ? null : (
          <Row gap="field" padding="row">
            <CommandAuxiliaryButton intent="secondary" onClick={(): void => onValueChange(typed)} size="sm">
              Use “{typed}” as typed
            </CommandAuxiliaryButton>
          </Row>
        )}
      </Command>
      <PickedLine error={error} errorId={errorId} listOwner={listOwner} models={models} value={value} />
    </Stack>
  );
}

/** The derived render view — pool → chip-filter → fuzzy-search → provider groups + cap, plus the Recent group,
 *  whose rows are left out of their sections so no model is listed twice. */
function usePickerView(args: {
  readonly models: readonly ModelCatalogEntry[] | null;
  readonly term: string;
  readonly chips: readonly string[];
  readonly recentIds: readonly string[];
  /** The ids the cap never hides: the pick and the model already on the saved row. */
  readonly pinnedIds: readonly string[];
  readonly listOwner: string;
}): {
  readonly groups: ReturnType<typeof groupModelEntries<PickerEntry>>["groups"];
  readonly overflow: number;
  readonly recentEntries: readonly PickerEntry[];
  readonly showChips: boolean;
} {
  const models = args.models ?? NO_MODELS;
  const pool = models.map(pickerEntryOf);
  const showChips = offersCapabilityChips(pool);
  // The search runs over the SOURCE's own array, never one derived here: the index is cached on the array's
  // identity, and the React Compiler does not keep a derived pool across renders, so a derived array rebuilt the
  // index on every keystroke. The chip filter applies to the matches instead, with no result cap before it.
  const deferredQuery = useDeferredValue(args.term);
  const matched = useFuzzySearch(models, deferredQuery, { fields: ["name", "id"], limit: models.length });
  const searched = deferredQuery.trim() === "" ? pool : matched.map(pickerEntryOf);
  const chipFiltered = showChips ? filterByChips(searched, args.chips) : searched;
  const recentEntries = resolveRecentEntries(args.recentIds, new Map(pool.map((entry) => [entry.id, entry] as const)), args.term.trim() === "");
  const inRecent = new Set(recentEntries.map((entry) => entry.id));
  const grouped = groupModelEntries(
    chipFiltered.filter((entry) => !inRecent.has(entry.id)),
    { unprefixedHeading: args.listOwner, query: deferredQuery, pinnedIds: args.pinnedIds, sectioned: hasMultiModelVendor(pool) },
  );
  return { groups: grouped.groups, overflow: grouped.overflow, recentEntries, showChips };
}

/** The status line under the list: what is picked, in words, or the field's error when nothing is. */
function PickedLine({
  value,
  models,
  listOwner,
  error,
  errorId,
}: {
  readonly value: string;
  readonly models: readonly ModelCatalogEntry[] | null;
  readonly listOwner: string;
  readonly error: string | null;
  readonly errorId: string;
}): ReactElement {
  const picked = models?.find((entry) => entry.id === value.trim()) ?? null;
  if (value.trim() === "") {
    return error === null ? (
      <Text data-slot="model-picker-picked" prose={true} role="status" voice="gloss">
        No model picked yet.
      </Text>
    ) : (
      <Text className="text-destructive" data-slot="model-picker-picked" id={errorId} prose={true} role="alert" voice="gloss">
        {error}
      </Text>
    );
  }
  // While the list loads there is nothing to judge the pick against yet, so it is only named.
  if (picked !== null || models === null) {
    const entry = picked === null ? null : pickerEntryOf(picked);
    return (
      <Text data-slot="model-picker-picked" prose={true} role="status" voice="gloss">
        Picked: {entry === null ? value : entry.label}
        {entry !== null && entry.label !== entry.id ? ` (${entry.id})` : ""}
      </Text>
    );
  }
  return (
    <Text className="max-w-(--reading-measure-prose) text-warning" data-slot="model-picker-picked" prose={true} role="status" voice="gloss">
      Picked: {value} — {unlistedModelSentence(listOwner)}
    </Text>
  );
}

/** The typed arm: no list to pick from (empty, failed, or none read). When policy forbids a typed id, it
 *  says why nothing can be picked and offers only the retry, which stays mounted and `busy` while the list
 *  reloads. */
function TypedModelField({
  value,
  onValueChange,
  error,
  notice,
  view,
  placeholder,
  busy,
  onRetry,
}: ModelPickerProps & {
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
          <Input autoComplete="off" onChange={(event): void => onValueChange(event.target.value)} placeholder={placeholder} value={value} />
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
