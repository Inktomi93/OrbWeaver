// The ModelPicker (Settings → Connections → Model roles — the source-driven model cell;
// CONNECTIONS-BUILD-SPEC §3). The ONE net-new client component of this build — a FEATURE component, NOT an
// @orb/ui primitive (the Command seal's own header directs overlay composition to the client layer,
// command.tsx §"A future omni-bar composes <Popover><Command>"). Composition:
//
//   <Popover> → <PopoverTrigger render={the model cell}/> → <PopoverPopup>
//     <Command shouldFilter={false} onEscape={close}>   (manual filtering — useFuzzySearch, not cmdk's)
//       <CommandInput/> · [Vision/Tools ToggleGroup chips — openrouter only]
//       <CommandList>  [Recent group] [All models — capped] [+N more] [free-text row — custom only]
//       [footer: synced {relative} · {n} models]
//
// The SURFACE owns the tRPC `getModelsForSource` query (shared with the status dot) and passes the result
// down, so this stays a controlled dumb-ish component. Manual filtering (`shouldFilter={false}`) because the
// approved fuzzy engine is `@orb/ui/fuzzy-search` (minisearch, sealed) — cmdk's own filter is NOT used
// (never import minisearch/cmdk here — dep-cruiser ui-satellite-seals).

import type { CredentialSource } from "@orb/contracts/credentials";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
} from "@orb/ui/command";
import { useFuzzySearch } from "@orb/ui/fuzzy-search";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve Icon/ChevronDown fine (the tag-settings-surface.tsx precedent).
import { ChevronDown, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useDeferredValue, useMemo, useState } from "react";
import type { Trpc } from "#data";
import { pushRecentModel, useRecentModels } from "#state";
import {
  filterByChips,
  footerSyncedLabel,
  formatContextLength,
  formatPromptPrice,
  hasTools,
  hasVision,
  MODEL_PICKER_RENDER_CAP,
  resolveRecentEntries,
} from "../lib/model-picker-model";

/** The facade result as the client receives it (tRPC inference — the `CredentialView` pattern; kept LOCAL,
 *  never an exported feature `type`, per no-inline-types.grit §7.4). */
type SourceModelsResult = inferOutput<Trpc["connection"]["getModelsForSource"]>;
type SourceModelEntry = SourceModelsResult["models"][number];

export interface ModelPickerProps {
  /** The picker's source (drives the per-source affordances — chips, free-text, footer). */
  readonly source: CredentialSource;
  /** The row's aria-label — the slot label plus "model" (the trigger + input naming). */
  readonly ariaLabel: string;
  /** The form's current model ("" = unset — the trigger ghosts the resolver default via `ghostLabel`). */
  readonly value: string;
  /** Writes the form field. */
  readonly onValueChange: (id: string) => void;
  /** The facade read (the surface owns the query so the status dot shares it). */
  readonly result: SourceModelsResult | undefined;
  readonly isLoading: boolean;
  /** The muted label shown on the trigger when `value` is "" (the resolver-default ghost). */
  readonly ghostLabel: string;
  /** custom_openai only: the endpoint `/models` ids (the caller fires `credentials.fetchModels` on open). */
  readonly customModels?: readonly string[] | undefined;
  readonly customModelsPending?: boolean | undefined;
  /** Fires once when the popover OPENS — the custom_openai arm uses it to lazily probe the endpoint's
   *  `/models` (the fetch is a mutation, kept off the picker; a `[]` result leaves free-text usable). */
  readonly onOpen?: (() => void) | undefined;
}

const VISION_CHIP = "vision";
const TOOLS_CHIP = "tools";

/** The source-driven model cell: a trigger button opening a searchable per-source model popover. */
export function ModelPicker(props: ModelPickerProps): ReactElement {
  const { source, ariaLabel, value, onValueChange, result, ghostLabel, onOpen } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [chips, setChips] = useState<readonly string[]>([]);
  // The Recent MRU is device-local (the persisted recent-models store) — never synced routing truth. Reading
  // it via the store hook keeps the group live across picks without a manual re-read on open.
  const recentIds = useRecentModels(source);

  const view = usePickerView(props, query, chips, recentIds);

  const commit = (id: string): void => {
    const trimmed = id.trim();
    if (trimmed === "") {
      return;
    }
    onValueChange(trimmed);
    pushRecentModel(source, trimmed);
    setOpen(false);
    setQuery("");
  };

  const triggerLabel = value === "" ? ghostLabel : (view.poolById.get(value)?.label ?? value);

  return (
    <Popover
      open={open}
      onOpenChange={(next): void => {
        setOpen(next);
        if (next) {
          onOpen?.();
        } else {
          setQuery("");
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            intent="secondary"
            size="sm"
            aria-label={ariaLabel}
            className="min-w-0 flex-1 justify-start"
          >
            <Text
              as="span"
              size="body"
              tone={value === "" ? "muted" : "default"}
              className="truncate"
            >
              {triggerLabel}
            </Text>
            <Icon icon={ChevronDown} size="sm" className="ms-auto shrink-0" />
          </Button>
        }
      />
      <PopoverPopup align="start" className="p-0">
        <Command shouldFilter={false} onEscape={(): void => setOpen(false)} label={ariaLabel}>
          <CommandInput
            aria-label={ariaLabel}
            placeholder="Search models…"
            value={query}
            onValueChange={setQuery}
          />

          {view.showChips ? (
            <Row gap="field" align="center" className="border-b border-border px-block py-field">
              <ToggleGroup
                aria-label="Filter models"
                multiple={true}
                value={chips}
                onValueChange={setChips}
              >
                <Toggle value={VISION_CHIP} size="sm">
                  Vision
                </Toggle>
                <Toggle value={TOOLS_CHIP} size="sm">
                  Tools
                </Toggle>
              </ToggleGroup>
            </Row>
          ) : null}

          <CommandList className="max-h-64">
            {view.loadingCustom ? (
              <CommandLoading label="Fetching models…">
                <Stack gap="field" className="p-field">
                  <Skeleton className="h-control-sm w-full" />
                  <Skeleton className="h-control-sm w-full" />
                </Stack>
              </CommandLoading>
            ) : null}

            <CommandEmpty>No models match.</CommandEmpty>

            {view.recentEntries.length > 0 ? (
              <CommandGroup heading="Recent">
                {view.recentEntries.map((entry) => (
                  <ModelItem
                    key={`recent-${entry.id}`}
                    entry={entry}
                    active={entry.id === value}
                    onSelect={commit}
                  />
                ))}
              </CommandGroup>
            ) : null}

            <CommandGroup heading="All models">
              {view.capped.map((entry) => (
                <ModelItem
                  key={entry.id}
                  entry={entry}
                  active={entry.id === value}
                  onSelect={commit}
                />
              ))}
            </CommandGroup>

            {view.overflow > 0 ? (
              <Row align="center" className="px-block py-field">
                <Text size="micro" tone="muted">
                  {`+${view.overflow} more — keep typing to narrow`}
                </Text>
              </Row>
            ) : null}

            {view.allowsFreeText ? (
              <CommandItem
                value={`__free-text__${query}`}
                keywords={[query]}
                disabled={query.trim() === ""}
                onSelect={(): void => commit(query)}
              >
                <Text size="body">
                  {query.trim() === ""
                    ? "Type a model id to use it"
                    : `Use “${query.trim()}” as typed`}
                </Text>
              </CommandItem>
            ) : null}
          </CommandList>

          <Row
            gap="field"
            align="center"
            justify="between"
            className="border-t border-border px-block py-field"
          >
            <Text size="micro" tone="muted">
              {footerSyncedLabel(result?.fetchedAt ?? null, view.allowsFreeText)}
            </Text>
            <Text size="micro" tone="muted">
              {`${view.pool.length} model${view.pool.length === 1 ? "" : "s"}`}
            </Text>
          </Row>
        </Command>
      </PopoverPopup>
    </Popover>
  );
}

/** The picker's derived render view — pool → chip-filter → fuzzy-search → cap, plus the Recent group. Split
 *  out of the component body so the render stays a flat compose (the cognitive-complexity gate) and the one
 *  `useFuzzySearch` call site stays UNCONDITIONAL (useHookAtTopLevel — hooks run every render). */
function usePickerView(
  props: ModelPickerProps,
  query: string,
  chips: readonly string[],
  recentIds: readonly string[],
): {
  readonly pool: readonly SourceModelEntry[];
  readonly poolById: ReadonlyMap<string, SourceModelEntry>;
  readonly capped: readonly SourceModelEntry[];
  readonly overflow: number;
  readonly recentEntries: readonly SourceModelEntry[];
  readonly showChips: boolean;
  readonly allowsFreeText: boolean;
  readonly loadingCustom: boolean;
} {
  const { source, result, customModels, customModelsPending } = props;
  const showChips = source === "openrouter";
  const allowsFreeText = result?.allowsFreeText ?? false;

  // custom_openai: the fetched /models ids arrive as bare strings — lift them to entries so the one render
  // path covers every source (the facade returns [] for custom; the endpoint probe fills the list).
  const pool = useMemo<readonly SourceModelEntry[]>(
    () =>
      allowsFreeText
        ? (customModels ?? []).map(
            (id) => ({ id, label: id, origin: "catalog" }) as SourceModelEntry,
          )
        : (result?.models ?? []),
    [allowsFreeText, customModels, result?.models],
  );
  const poolById = useMemo(() => new Map(pool.map((entry) => [entry.id, entry] as const)), [pool]);

  const chipFiltered = showChips ? filterByChips(pool, chips) : pool;
  // useDeferredValue keeps the input responsive while the filtered list lags a frame (§13.2). The hook runs
  // every render (unconditional); when the query is empty we ignore its result and show the chip-filtered
  // pool directly, so an empty search shows everything (minisearch returns nothing for "").
  const deferredQuery = useDeferredValue(query);
  const matched = useFuzzySearch(chipFiltered, deferredQuery, { fields: ["label", "id"] });
  const searched = deferredQuery.trim() === "" ? chipFiltered : matched;

  const capped = searched.slice(0, MODEL_PICKER_RENDER_CAP);
  return {
    pool,
    poolById,
    capped,
    overflow: searched.length - capped.length,
    recentEntries: resolveRecentEntries(recentIds, poolById, query.trim() === ""),
    showChips,
    allowsFreeText,
    loadingCustom: customModelsPending === true,
  };
}

/** One model row inside the popover list (mockup .pitem): name + chips over the mono id · context/price
 *  meta. An id-based `value` with `keywords` so cmdk's activedescendant roving keeps identity even though
 *  filtering is manual (the CommandItem footgun note). */
function ModelItem({
  entry,
  active,
  onSelect,
}: {
  readonly entry: SourceModelEntry;
  readonly active: boolean;
  readonly onSelect: (id: string) => void;
}): ReactElement {
  const context = formatContextLength(entry.contextLength ?? undefined);
  const price = formatPromptPrice(entry.promptPrice ?? undefined);
  return (
    <CommandItem
      value={entry.id}
      keywords={[entry.label]}
      data-active={active ? true : undefined}
      onSelect={(): void => onSelect(entry.id)}
    >
      <Stack gap="field" className="min-w-0 flex-1">
        <Row gap="field" align="center" className="min-w-0">
          <Text as="span" size="body" weight="medium" className="truncate">
            {entry.label}
          </Text>
          {hasVision(entry) ? (
            <Badge intent="info" size="sm">
              vision
            </Badge>
          ) : null}
          {hasTools(entry) ? (
            <Badge intent="neutral" size="sm">
              tools
            </Badge>
          ) : null}
        </Row>
        {entry.detail !== undefined ? (
          <Text as="span" size="micro" tone="muted" className="truncate">
            {entry.detail}
          </Text>
        ) : (
          <Text as="span" size="micro" tone="muted" className="truncate font-mono">
            {entry.id}
          </Text>
        )}
      </Stack>
      {context !== null || price !== null ? (
        <Stack gap="field" align="end" className="shrink-0">
          {context !== null ? (
            <Text as="span" size="micro" tone="muted" className="font-mono">
              {context}
            </Text>
          ) : null}
          {price !== null ? (
            <Text as="span" size="micro" tone="muted" className="font-mono">
              {price}
            </Text>
          ) : null}
        </Stack>
      ) : null}
    </CommandItem>
  );
}
