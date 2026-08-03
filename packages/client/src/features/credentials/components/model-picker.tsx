// The ModelPicker (Settings → Connections → Model roles — the source-driven model cell). A feature
// component, not an @orb/ui primitive: <Popover><Command shouldFilter={false}> with manual filtering via
// @orb/ui/fuzzy-search (never minisearch/cmdk directly — dep-cruiser ui-satellite-seals). The surface owns
// the tRPC getModelsForSource query and passes the result down, so this stays a controlled component.
//
// The list is sectioned by PROVIDER (`groupModelEntries` — the vendor prefix of an OR id; slash-less ids
// get the source's own heading) under the device-local Recent MRU; search still runs across the whole pool
// before grouping, and the render cap is a budget spent across sections. When the server serves its curated
// cold-cache shortlist instead of a real catalog (`origin: "curated"`), the popover says so — a silently
// different menu run-to-run is the exact no-silent-degrade smell we don't ship.

import type { CredentialSource } from "@orb/contracts/credentials";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandLoading } from "@orb/ui/command";
import { useFuzzySearch } from "@orb/ui/fuzzy-search";
import { AlertTriangle, ChevronDown, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useDeferredValue, useState } from "react";
import type { Trpc } from "#data";
import { testId } from "#lib";
import { pushRecentModel, useRecentModels } from "#state";
import type { ModelGroup } from "../lib/model-picker-model.ts";
import {
  CURATED_FALLBACK_NOTICE,
  filterByChips,
  footerSyncedLabel,
  formatContextLength,
  formatPromptPrice,
  groupModelEntries,
  hasTools,
  hasVision,
  isCuratedFallback,
  resolveRecentEntries,
} from "../lib/model-picker-model.ts";

type SourceModelsResult = inferOutput<Trpc["connection"]["getModelsForSource"]>;
type SourceModelEntry = SourceModelsResult["models"][number];

export interface ModelPickerProps {
  readonly source: CredentialSource;
  readonly ariaLabel: string;
  /** The form's current model ("" = unset — the trigger ghosts the resolver default via `ghostLabel`). */
  readonly value: string;
  readonly onValueChange: (id: string) => void;
  /** The facade read (the surface owns the query so the status dot shares it). */
  readonly result: SourceModelsResult | undefined;
  readonly isLoading: boolean;
  readonly ghostLabel: string;
  /** custom_openai only: the endpoint `/models` ids. */
  readonly customModels?: readonly string[] | undefined;
  readonly customModelsPending?: boolean | undefined;
  /** Fires once when the popover opens — the custom_openai arm uses it to lazily probe the endpoint. */
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
  // Device-local recent-models MRU — never synced routing truth.
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
          <Button intent="secondary" size="sm" aria-label={ariaLabel} className="min-w-0 flex-1 justify-start">
            <Text as="span" className={value === "" ? "truncate text-muted-foreground" : "truncate text-foreground"}>
              {triggerLabel}
            </Text>
            <Icon icon={ChevronDown} size="sm" className="ms-auto shrink-0" />
          </Button>
        }
      />
      <PopoverPopup align="start" className="p-0">
        <Command shouldFilter={false} onEscape={(): void => setOpen(false)} label={ariaLabel}>
          <CommandInput aria-label={ariaLabel} placeholder="Search models…" value={query} onValueChange={setQuery} />

          {view.showChips ? (
            <Row gap="field" align="center" className="border-b border-border px-block py-field">
              <ToggleGroup aria-label="Filter models" multiple={true} value={chips} onValueChange={setChips}>
                <Toggle value={VISION_CHIP} size="sm">
                  Vision
                </Toggle>
                <Toggle value={TOOLS_CHIP} size="sm">
                  Tools
                </Toggle>
              </ToggleGroup>
            </Row>
          ) : null}

          {view.curatedFallback ? (
            <Row gap="field" align="center" className="border-b border-border px-block py-field" data-testid={testId("modelPickerCuratedNotice")}>
              <Icon icon={AlertTriangle} size="xs" className="shrink-0 text-muted-foreground" />
              <Text voice="gloss">{CURATED_FALLBACK_NOTICE}</Text>
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
                  <ModelItem key={`recent-${entry.id}`} entry={entry} active={entry.id === value} onSelect={commit} />
                ))}
              </CommandGroup>
            ) : null}

            {view.groups.map((group) => (
              <CommandGroup key={group.key} heading={group.heading}>
                {group.entries.map((entry) => (
                  <ModelItem key={entry.id} entry={entry} active={entry.id === value} onSelect={commit} />
                ))}
              </CommandGroup>
            ))}

            {view.overflow > 0 ? (
              <Row align="center" className="px-block py-field">
                <Text voice="gloss">{`+${view.overflow} more — keep typing to narrow`}</Text>
              </Row>
            ) : null}

            {view.allowsFreeText ? (
              <CommandItem value={`__free-text__${query}`} keywords={[query]} disabled={query.trim() === ""} onSelect={(): void => commit(query)}>
                <Text>{query.trim() === "" ? "Type a model id to use it" : `Use “${query.trim()}” as typed`}</Text>
              </CommandItem>
            ) : null}
          </CommandList>

          <Row gap="field" align="center" justify="between" className="border-t border-border px-block py-field">
            <Text voice="gloss">{footerSyncedLabel(result?.fetchedAt ?? null, view.allowsFreeText, view.curatedFallback)}</Text>
            <Text voice="gloss">{`${view.pool.length} model${view.pool.length === 1 ? "" : "s"}`}</Text>
          </Row>
        </Command>
      </PopoverPopup>
    </Popover>
  );
}

/** The picker's derived render view — pool → chip-filter → fuzzy-search → provider groups + cap, plus the Recent group. */
function usePickerView(
  props: ModelPickerProps,
  query: string,
  chips: readonly string[],
  recentIds: readonly string[],
): {
  readonly pool: readonly SourceModelEntry[];
  readonly poolById: ReadonlyMap<string, SourceModelEntry>;
  readonly groups: readonly ModelGroup<SourceModelEntry>[];
  readonly overflow: number;
  readonly recentEntries: readonly SourceModelEntry[];
  readonly showChips: boolean;
  readonly allowsFreeText: boolean;
  readonly loadingCustom: boolean;
  readonly curatedFallback: boolean;
} {
  const { source, result, customModels, customModelsPending } = props;
  const showChips = source === "openrouter";
  const allowsFreeText = result?.allowsFreeText ?? false;

  // custom_openai's fetched /models ids arrive as bare strings — lift them to entries so one render path covers every source.
  const pool: readonly SourceModelEntry[] = allowsFreeText
    ? (customModels ?? []).map((id) => ({ id, label: id, origin: "catalog" }) as SourceModelEntry)
    : (result?.models ?? []);
  const poolById = new Map(pool.map((entry) => [entry.id, entry] as const));

  const chipFiltered = showChips ? filterByChips(pool, chips) : pool;
  // An empty query bypasses the fuzzy result (minisearch returns nothing for "") and shows the chip-filtered pool directly.
  const deferredQuery = useDeferredValue(query);
  const matched = useFuzzySearch(chipFiltered, deferredQuery, { fields: ["label", "id"] });
  const searched = deferredQuery.trim() === "" ? chipFiltered : matched;

  const grouped = groupModelEntries(searched, { source, query: deferredQuery, selectedId: props.value });
  return {
    pool,
    poolById,
    groups: grouped.groups,
    overflow: grouped.overflow,
    recentEntries: resolveRecentEntries(recentIds, poolById, query.trim() === ""),
    showChips,
    allowsFreeText,
    loadingCustom: customModelsPending === true,
    curatedFallback: isCuratedFallback(pool),
  };
}

/** One model row inside the popover list: name + chips over the mono id, context/price meta. */
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
    <CommandItem value={entry.id} keywords={[entry.label]} data-active={active ? true : undefined} onSelect={(): void => onSelect(entry.id)}>
      <Stack gap="field" className="min-w-0 flex-1">
        <Row gap="field" align="center" className="min-w-0">
          <Text as="span" className="truncate font-medium">
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
          <Text as="span" voice="gloss" className="truncate">
            {entry.detail}
          </Text>
        ) : (
          <Text as="span" voice="gloss" className="truncate font-mono">
            {entry.id}
          </Text>
        )}
      </Stack>
      {context !== null || price !== null ? (
        <Stack gap="field" align="end" className="shrink-0">
          {context !== null ? (
            <Text as="span" voice="gloss" className="font-mono">
              {context}
            </Text>
          ) : null}
          {price !== null ? (
            <Text as="span" voice="gloss" className="font-mono">
              {price}
            </Text>
          ) : null}
        </Stack>
      ) : null}
    </CommandItem>
  );
}
