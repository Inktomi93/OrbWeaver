// The ModelPicker's pure model — render-cap, price formatting, provider grouping, and Recent-pool
// resolve. The Recent MRU's device-local persistence lives in state/recent-models-store.ts.

import type { CredentialSource } from "@orb/contracts/credentials";
import { timeLib } from "#lib";

/** The minimal entry shape the pure helpers read — a structural subset of the facade's SourceModelEntry. */
interface PickerEntry {
  readonly id: string;
  readonly label: string;
  readonly contextLength?: number | undefined;
  readonly promptPrice?: number | undefined;
  readonly inputModalities?: readonly string[] | undefined;
  readonly supportedParameters?: readonly string[] | undefined;
  /** The facade's provenance tag (`catalog`/`curated`/`config`/`builtin`), widened to string — the union is the server's contract, not a client re-declaration. */
  readonly origin?: string | undefined;
}

/** The render cap across ALL provider groups together — a large catalog is sliced so the popover never mounts hundreds of rows. */
export const MODEL_PICKER_RENDER_CAP = 50;

const MILLION = 1_000_000;
const THOUSAND = 1000;
const PRICE_FRACTION_DIGITS = 2;

/** Format a context length as a compact human string (200000 → "200K", 1_000_000 → "1M"). */
export function formatContextLength(contextLength: number | undefined): string | null {
  if (contextLength === undefined || contextLength <= 0) {
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
export function formatPromptPrice(promptPrice: number | undefined): string | null {
  if (promptPrice === undefined || promptPrice <= 0) {
    return null;
  }
  return `$${trimZeros(promptPrice * MILLION, PRICE_FRACTION_DIGITS)}/M`;
}

/** Trim trailing zeros off a fixed-decimal number (15.00 → "15", 2.50 → "2.5"). */
function trimZeros(value: number, maxFractionDigits = 1): string {
  return String(Number(value.toFixed(maxFractionDigits)));
}

/** `true` when an entry advertises image input (the Vision chip / filter). */
export function hasVision(entry: PickerEntry): boolean {
  return (entry.inputModalities ?? []).includes("image");
}

/** `true` when an entry advertises tool use (the Tools chip / filter). */
export function hasTools(entry: PickerEntry): boolean {
  return (entry.supportedParameters ?? []).includes("tools");
}

/** Apply the Vision/Tools chip filter (AND across active chips) before the render cap. An empty chip set is a no-op pass-through. */
export function filterByChips<T extends PickerEntry>(entries: readonly T[], chips: readonly string[]): readonly T[] {
  if (chips.length === 0) {
    return entries;
  }
  const wantVision = chips.includes("vision");
  const wantTools = chips.includes("tools");
  return entries.filter((entry) => (!wantVision || hasVision(entry)) && (!wantTools || hasTools(entry)));
}

/** The footer's synced line — relative time when a snapshot `fetchedAt` is present, else the source's static provenance note. */
export function footerSyncedLabel(fetchedAt: number | null, allowsFreeText: boolean): string {
  if (fetchedAt !== null) {
    return `synced ${timeLib.formatRelative(fetchedAt)}`;
  }
  return allowsFreeText ? "endpoint /models" : "from config";
}

// --- Provider grouping (the picker's section plan) --------------------------------------------

/** One provider/vendor section of the picker list. */
export interface ModelGroup<T> {
  /** The bucket key: an OpenRouter id's vendor prefix (lowercased), or `""` for a slash-less id. */
  readonly key: string;
  readonly heading: string;
  readonly entries: readonly T[];
}

/** The grouped render plan: the sections to draw, plus how many pool entries the cap left unrendered. */
export interface GroupedModels<T> {
  readonly groups: readonly ModelGroup<T>[];
  readonly overflow: number;
}

/** The bucket key for a slash-less id (agent-sdk aliases, curated ids, a BYO endpoint's bare names). */
const UNPREFIXED_GROUP_KEY = "";

/** The floor of rows a rendered group gets, so a 57-vendor catalog still shows a readable slice of many vendors. */
const MIN_GROUP_ROWS = 3;

/** The heading a slash-less id's group carries, by source — those ids have no vendor prefix to read.
 *  Pairs + `fromEntries` is the house shape for a source-keyed map (`connections-model.ts` SOURCE_LABELS):
 *  the snake_case source id can't be a bare object key. */
const UNPREFIXED_GROUP_HEADING_PAIRS: readonly (readonly [CredentialSource, string])[] = [
  ["openrouter", "Other"],
  ["max-pro-sub", "Anthropic"],
  ["custom_openai", "Endpoint models"],
  ["vllm", "Engine"],
  ["local-light", "Built-in"],
] as const;

const UNPREFIXED_GROUP_HEADINGS: Record<CredentialSource, string> = Object.fromEntries(UNPREFIXED_GROUP_HEADING_PAIRS) as Record<CredentialSource, string>;

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

/** Vendors that lead the section order — the majors by catalog weight, Anthropic first (the app's own house model family). */
const VENDOR_PRIORITY: readonly string[] = ["anthropic", "openai", "google", "x-ai", "deepseek", "qwen", "mistralai", "meta-llama"];

const SLUG_SEPARATORS = /[-_]/;

/** The vendor bucket an id belongs to — the prefix before the first "/" (OR ids), else the unprefixed bucket. */
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
    readonly source: CredentialSource;
    readonly query: string;
    /** The currently-selected model id ("" = unset) — its vendor group sorts above the priority order. */
    readonly selectedId: string;
    readonly cap?: number;
  },
): GroupedModels<T> {
  const cap = options.cap ?? MODEL_PICKER_RENDER_CAP;
  const unprefixedHeading = UNPREFIXED_GROUP_HEADINGS[options.source];
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
    return {
      key,
      heading: headingFor(key, unprefixedHeading),
      ordered: [...exact, ...rest],
      hasExact: exact.length > 0,
    };
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

/** The notice the picker shows while the curated cold-cache shortlist is standing in for a real catalog. */
export const CURATED_FALLBACK_NOTICE = "curated shortlist — full catalog not loaded";

/** `true` when the served pool is entirely the server's curated fallback (`origin: "curated"` — the max-pro-sub agent-sdk snapshot was cold/empty). */
export function isCuratedFallback(entries: readonly PickerEntry[]): boolean {
  return entries.length > 0 && entries.every((entry) => entry.origin === "curated");
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
