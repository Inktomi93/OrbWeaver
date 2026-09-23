// The ModelPicker's pure model (inference program §5.3a Essential tier: "model (listed; typed fallback with its
// copy)", §7.4 for the policy). Ported from the picker the inference cut-over deleted: the render cap spent
// across provider groups, price and context formatting, the Vision/Tools chip filter and the Recent-pool
// resolve. Beside those, the picker's INPUT: it never reads a catalog itself — its caller hands it a
// `ModelCatalogSource` (loading · listed · failed · unlisted), so the saved-key path (`connection.catalogModels`),
// the endpoint draft (`connection.listEndpointModels`) and any later draft read feed one control through one
// shape. The device-local Recent MRU's persistence lives in `state/recent-models-store.ts`.
//
// THE TYPED-ID POLICY IS THE PROVIDER'S CATALOG STRATEGY (§7.4). A `url` catalog is a fetched list that can lag
// the provider, so a typed id is always offered beside it and saved `modelListed: false`. A `builtin` catalog
// IS the set the in-process runtime can run, so a typed id there names a model nothing can load.

import type { ModelCatalogEntry, ProviderDef } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";

/** Where the picker's models come from, as the caller last saw it. `unlisted` is a source with no list to
 *  offer (nothing fetched yet, or no catalog door for this draft); `failed` is a list read that errored.
 *  NOT an exported alias: a feature's `lib/` is not a type home (`no-inline-types`), so every reader derives
 *  it from `ModelPickerProps["source"]`, and a new arm is a `tsc` error at each of them. */
type ModelCatalogSource =
  | { readonly status: "loading" }
  | { readonly status: "listed"; readonly models: readonly ModelCatalogEntry[] }
  | { readonly status: "failed"; readonly reason: string; readonly retry: (() => void) | null }
  | { readonly status: "unlisted"; readonly reason: string };

// ── the picker's rows ─────────────────────────────────────────────────────────────────────────────────

/** One row as the picker searches, groups and renders it: the catalog entry plus its display label. */
export interface PickerEntry {
  readonly id: string;
  readonly label: string;
  readonly contextLength: number | null;
  readonly promptPrice: number | null;
  readonly inputModalities: readonly string[];
  readonly supportedParameters: readonly string[];
}

/** A catalog row's display name. Most `/v1/models` lists carry no name, so theirs is the id. */
export function modelEntryLabel(entry: Pick<ModelCatalogEntry, "id" | "name">): string {
  return entry.name.trim() === "" ? entry.id : entry.name;
}

/** A catalog entry as a picker row. */
export function pickerEntryOf(entry: ModelCatalogEntry): PickerEntry {
  return {
    id: entry.id,
    label: modelEntryLabel(entry),
    contextLength: entry.contextLength,
    promptPrice: entry.promptPrice,
    inputModalities: entry.inputModalities,
    supportedParameters: entry.supportedParameters,
  };
}

/** The render cap across ALL provider groups together — a large catalog is sliced so the list never mounts
 *  hundreds of rows. */
export const MODEL_PICKER_RENDER_CAP = 50;

const MILLION = 1_000_000;
const THOUSAND = 1000;
const PRICE_FRACTION_DIGITS = 2;

/** Format a context length as a compact human string (200000 → "200K", 1_000_000 → "1M"). */
export function formatContextLength(contextLength: number | null): string | null {
  if (contextLength === null || contextLength <= 0) {
    return null;
  }
  if (contextLength >= MILLION) {
    return `${trimZeros(contextLength / MILLION)}M`;
  }
  if (contextLength >= THOUSAND) {
    return `${trimZeros(contextLength / THOUSAND)}K`;
  }
  return String(contextLength);
}

/** Format the per-token USD price as a $/M string ($/M = price × 1e6). Absent/zero price ⇒ `null`. */
export function formatPromptPrice(promptPrice: number | null): string | null {
  if (promptPrice === null || promptPrice <= 0) {
    return null;
  }
  return `$${trimZeros(promptPrice * MILLION, PRICE_FRACTION_DIGITS)}/M`;
}

/** Trim trailing zeros off a fixed-decimal number (15.00 → "15", 2.50 → "2.5"). */
function trimZeros(value: number, maxFractionDigits = 1): string {
  return String(Number(value.toFixed(maxFractionDigits)));
}

/** `true` when an entry advertises image input (the Vision chip / filter). */
export function hasVision(entry: Pick<PickerEntry, "inputModalities">): boolean {
  return entry.inputModalities.includes("image");
}

/** `true` when an entry advertises tool use (the Tools chip / filter). */
export function hasTools(entry: Pick<PickerEntry, "supportedParameters">): boolean {
  return entry.supportedParameters.includes("tools");
}

/** The chips are offered only for a catalog that states capabilities (OpenRouter's enriched list): a plain
 *  `/v1/models` list states none, and a chip that could only ever empty the list is a trap. */
export function offersCapabilityChips(entries: readonly PickerEntry[]): boolean {
  return entries.some((entry) => entry.inputModalities.length > 0 || entry.supportedParameters.length > 0);
}

/** The chip values, and the filter they apply. */
export const VISION_CHIP = "vision";
export const TOOLS_CHIP = "tools";

/** Apply the Vision/Tools chip filter (AND across active chips) before the render cap. An empty chip set is a
 *  pass-through. */
export function filterByChips<T extends PickerEntry>(entries: readonly T[], chips: readonly string[]): readonly T[] {
  if (chips.length === 0) {
    return entries;
  }
  const wantVision = chips.includes(VISION_CHIP);
  const wantTools = chips.includes(TOOLS_CHIP);
  return entries.filter((entry) => (!wantVision || hasVision(entry)) && (!wantTools || hasTools(entry)));
}

// ── provider grouping (the section plan) ──────────────────────────────────────────────────────────────

/** One provider/vendor section of the picker list. */
export interface ModelGroup<T> {
  /** The bucket key: an id's vendor prefix (lowercased), or `""` for a slash-less id. */
  readonly key: string;
  readonly heading: string;
  readonly entries: readonly T[];
}

/** The grouped render plan: the sections to draw, plus how many pool entries the cap left unrendered. */
export interface GroupedModels<T> {
  readonly groups: readonly ModelGroup<T>[];
  readonly overflow: number;
}

/** The bucket key for a slash-less id (agent-sdk aliases, a hosted provider's bare ids, an endpoint's names). */
const UNPREFIXED_GROUP_KEY = "";

/** The floor of rows a rendered group gets, so a many-vendor catalog still shows a readable slice of many. */
const MIN_GROUP_ROWS = 3;

/** Vendor slugs whose display name isn't their title-cased slug (measured against the live OR catalog). */
const VENDOR_LABELS: Record<string, string> = {
  ai21: "AI21",
  deepseek: "DeepSeek",
  inclusionai: "InclusionAI",
  "meta-llama": "Meta",
  minimax: "MiniMax",
  mistralai: "Mistral AI",
  moonshotai: "Moonshot AI",
  nvidia: "NVIDIA",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  "x-ai": "xAI",
  "z-ai": "Z.AI",
};

/** Vendors that lead the section order — the majors by catalog weight, Anthropic first. */
const VENDOR_PRIORITY: readonly string[] = ["anthropic", "openai", "google", "x-ai", "deepseek", "qwen", "mistralai", "meta-llama"];

const SLUG_SEPARATORS = /[-_]/;

/** The vendor bucket an id belongs to — the prefix before the first "/", else the unprefixed bucket. */
function vendorKeyOf(id: string): string {
  const slash = id.indexOf("/");
  return slash > 0 ? id.slice(0, slash).toLowerCase() : UNPREFIXED_GROUP_KEY;
}

function titleCaseSlug(slug: string): string {
  return slug
    .split(SLUG_SEPARATORS)
    .map((word) => (word === "" ? word : `${word.charAt(0).toUpperCase()}${word.slice(1)}`))
    .join(" ");
}

function headingFor(key: string, unprefixedHeading: string): string {
  if (key === UNPREFIXED_GROUP_KEY) {
    return unprefixedHeading;
  }
  return VENDOR_LABELS[key] ?? titleCaseSlug(key);
}

function priorityOf(key: string): number {
  const index = VENDOR_PRIORITY.indexOf(key);
  return index === -1 ? VENDOR_PRIORITY.length : index;
}

/** An entry the user typed verbatim — it must survive the cap, whichever group it lands in. */
function isExactMatch(entry: PickerEntry, needle: string): boolean {
  return needle !== "" && (entry.id.toLowerCase() === needle || entry.label.toLowerCase() === needle);
}

/**
 * Bucket the (already chip-filtered and searched) pool into provider sections and apply the render cap.
 *
 * Section order: the group holding an exact query match · the selected model's group · the
 * {@link VENDOR_PRIORITY} majors · then alphabetical. The cap is a budget spent ACROSS groups with a
 * per-group ceiling, so no single vendor eats the list; a group that gets no budget is dropped whole and
 * counts into `overflow`. Exact matches are hoisted to the front of their group AND float that group
 * first, so the row the user typed is never the row the cap hides.
 */
export function groupModelEntries<T extends PickerEntry>(
  entries: readonly T[],
  options: {
    /** The heading a slash-less id's group carries — whose list it is (a provider label or a host). */
    readonly unprefixedHeading: string;
    readonly query: string;
    /** The currently-selected model id ("" = unset) — its vendor group sorts above the priority order. */
    readonly selectedId: string;
    readonly cap?: number;
  },
): GroupedModels<T> {
  const cap = options.cap ?? MODEL_PICKER_RENDER_CAP;
  const needle = options.query.trim().toLowerCase();

  const buckets = new Map<string, T[]>();
  for (const entry of entries) {
    const key = vendorKeyOf(entry.id);
    const bucket = buckets.get(key);
    if (bucket === undefined) {
      buckets.set(key, [entry]);
    } else {
      bucket.push(entry);
    }
  }

  const selectedKey = options.selectedId === "" ? null : vendorKeyOf(options.selectedId);
  const ranked = [...buckets].map(([key, bucket]) => {
    const exact = bucket.filter((entry) => isExactMatch(entry, needle));
    const rest = bucket.filter((entry) => !isExactMatch(entry, needle));
    return { key, heading: headingFor(key, options.unprefixedHeading), ordered: [...exact, ...rest], hasExact: exact.length > 0 };
  });
  ranked.sort((a, b) => {
    if (a.hasExact !== b.hasExact) {
      return a.hasExact ? -1 : 1;
    }
    const aSelected = a.key === selectedKey;
    const bSelected = b.key === selectedKey;
    if (aSelected !== bSelected) {
      return aSelected ? -1 : 1;
    }
    const byPriority = priorityOf(a.key) - priorityOf(b.key);
    return byPriority === 0 ? a.heading.localeCompare(b.heading) : byPriority;
  });

  const perGroupCap = Math.max(MIN_GROUP_ROWS, Math.floor(cap / Math.max(1, ranked.length)));
  const groups: ModelGroup<T>[] = [];
  let budget = cap;
  for (const group of ranked) {
    if (budget <= 0) {
      break;
    }
    const take = Math.min(group.ordered.length, perGroupCap, budget);
    groups.push({ key: group.key, heading: group.heading, entries: group.ordered.slice(0, take) });
    budget -= take;
  }
  return { groups, overflow: entries.length - (cap - budget) };
}

/** Resolve the Recent-group entries: MRU ids mapped to live pool entries, only when the query is empty. */
export function resolveRecentEntries<T extends PickerEntry>(
  recentIds: readonly string[],
  poolById: ReadonlyMap<string, T>,
  queryIsEmpty: boolean,
): readonly T[] {
  if (!queryIsEmpty) {
    return [];
  }
  return recentIds.map((id) => poolById.get(id)).filter((entry): entry is T => entry !== undefined);
}

// ── Enter's floor ─────────────────────────────────────────────────────────────────────────────────────

/** Whether a search result is strong enough for Enter to commit it without the user having moved to it: its
 *  id or label CONTAINS what was typed. The fuzzy search keeps showing looser matches — a typo still finds
 *  its model — but Enter never saves one ("gpt-6" once saved an unrelated "…gptq…v0.6" row as listed). */
export function isStrongMatch(entry: Pick<PickerEntry, "id" | "label">, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle !== "" && (entry.id.toLowerCase().includes(needle) || entry.label.toLowerCase().includes(needle));
}

// ── the source, the policy and the arms ───────────────────────────────────────────────────────────────

/** A reason as the middle of a sentence: a server message may already end in a period, and the copy adds its
 *  own. */
export function clauseOf(reason: string): string {
  return reason.trim().replace(/[.\s]+$/u, "");
}

/** Whether this provider's policy permits a model id the list does not carry (§7.4). */
export function typedModelAllowed(provider: Pick<ProviderDef, "catalog">): boolean {
  return provider.catalog === "url";
}

/** Whether `modelId` came from the source's list — the connection's `modelListed` on save. */
export function isListedModel(source: ModelCatalogSource, modelId: string): boolean {
  const id = modelId.trim();
  return source.status === "listed" && id !== "" && source.models.some((entry) => entry.id === id);
}

/** The id the explicit "use as typed" option would write, or `null` when it is not offered: policy forbids
 *  it, nothing is typed, or the typed text already IS a listed id (the list row is the honest choice). */
export function typedOption(args: { readonly term: string; readonly models: readonly { readonly id: string }[]; readonly allowed: boolean }): string | null {
  const id = args.term.trim();
  if (!args.allowed || id === "" || args.models.some((entry) => entry.id === id)) {
    return null;
  }
  return id;
}

/** §5.3a's `modelListed: false` sentence, verbatim, naming whose list the id was missing from. */
export function unlistedModelSentence(listOwner: string): string {
  return `This model id wasn't in ${listOwner}'s list. It'll be sent as-is; if the server doesn't have it, turns will fail.`;
}

/** What the picker renders for a source. `notice: null` is the searchable list (`models: null` while it
 *  loads); a notice is the typed arm, which offers a text field only when `typingOffered`. */
export interface ModelPickerView {
  readonly models: readonly ModelCatalogEntry[] | null;
  readonly notice: string | null;
  /** The notice reports a list that failed or came back empty, not the caller's own "type it" reason. */
  readonly warns: boolean;
  readonly typingOffered: boolean;
  readonly retry: (() => void) | null;
}

const LIST_VIEW_LOADING: ModelPickerView = { models: null, notice: null, warns: false, typingOffered: false, retry: null };

/** The typed arm for a list that WAS read and gave nothing to pick: the consequence is spelled out, and a
 *  closed catalog says there is nothing to type instead. */
function emptyListView(notice: string, typedAllowed: boolean, retry: (() => void) | null): ModelPickerView {
  const tail = typedAllowed ? "Type the id; it'll be sent as-is." : "This provider only runs models from its list, so there is nothing to type instead.";
  return { models: null, notice: `${notice} ${tail}`, warns: true, typingOffered: typedAllowed, retry };
}

/** The picker's arm for a source. The unlisted arm follows the policy too: a closed catalog refuses a typed
 *  id even with no list in hand, because the only id it could hold is a typo (the write seam refuses it). */
export function modelPickerView(source: ModelCatalogSource, args: { readonly listOwner: string; readonly typedAllowed: boolean }): ModelPickerView {
  switch (source.status) {
    case "loading":
      return LIST_VIEW_LOADING;
    case "listed":
      return source.models.length === 0
        ? emptyListView(`${args.listOwner} listed no models.`, args.typedAllowed, null)
        : { models: source.models, notice: null, warns: false, typingOffered: false, retry: null };
    case "failed":
      return emptyListView(`Couldn't list ${args.listOwner}'s models — ${clauseOf(source.reason)}.`, args.typedAllowed, source.retry);
    case "unlisted":
      return { models: null, notice: source.reason, warns: !args.typedAllowed, typingOffered: args.typedAllowed, retry: null };
  }
}

/** A catalog read's error as a source the picker can render. */
export function failedCatalogSource(error: unknown, retry: (() => void) | null): ModelCatalogSource {
  return { status: "failed", reason: errorMessage(error), retry };
}

/** A model-list read (`catalogModels` or `listEndpointModels`) as a source. Neither verb throws for a list
 *  that failed or came back empty: each answers `listed: false` with the reason, which is the failed arm with
 *  the typed field and the retry beside it. */
export function modelListSource(
  result: { readonly listed: boolean; readonly models: readonly ModelCatalogEntry[]; readonly reason: string | null },
  retry: (() => void) | null,
): ModelCatalogSource {
  return result.listed ? { status: "listed", models: result.models } : { status: "failed", reason: result.reason ?? "no answer", retry };
}

/** The model field's required-value message, shared by every form that writes a connection's model. */
export const MODEL_REQUIRED_MESSAGE = "Pick a model or type its id.";
