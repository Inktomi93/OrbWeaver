// The Connections pane's pure model (inference program §5.3a): the Model-roles ROW descriptors (the client
// owns the render order — a contract tuple's order is not a UI decision), the grouped provider picker
// (Hosted (key) · Your own server (URL) · Subscription · Built-in — never twelve options flat), and the
// per-row readouts. Labels come from the registry rows (`ProviderDef.label`), never a hand table.

import type { ProviderAuth, ProviderAvailability, ProviderDef, RoutableTask } from "@orb/contracts/inference";
import { canFund } from "@orb/contracts/inference";
import type { SelectItems, SelectOptionGroup } from "@orb/ui/select";

/** One Model-roles row's descriptor. */
export interface RoleRow {
  readonly task: RoutableTask;
  readonly label: string;
  readonly description: string;
  /** `true` for the vector-space rows: leaving them unset means search reads nothing, not "a default". */
  readonly optional: boolean;
}

/** The rows keyed on `RoutableTask` — a new routable task is a `tsc` error here until it has a row. The
 *  Summarize slot is the UTILITY row (§5.3a): `structured` rides it, so its copy names all three consumers. */
const ROLE_ROWS: Record<RoutableTask, RoleRow> = {
  chat: { task: "chat", label: "Chat", description: "The main conversation model. Every turn you trigger runs on it.", optional: false },
  summarize: {
    task: "summarize",
    label: "Utility model",
    description: "Summaries, structured extraction and image captions. Point this at a cheap model; it needs background work allowed.",
    optional: false,
  },
  generateImage: { task: "generateImage", label: "Image generation", description: "Renders pictures from prompts (the /imagine surface).", optional: true },
  embed: {
    task: "embed",
    label: "Text embedding",
    description: "Vectorizes text for search and memory. Changing it re-embeds your whole index.",
    optional: false,
  },
  imageEmbed: {
    task: "imageEmbed",
    label: "Image embedding",
    description: "A multimodal embedder for searching images directly. Unset falls back to the captioned-text lens.",
    optional: true,
  },
  rerank: { task: "rerank", label: "Rerank", description: "Reorders retrieved results by relevance.", optional: false },
};

/** The pane's render order — the client's decision (side-eye 8 P3-1), pinned to be a permutation of the tuple. */
const ROLE_RENDER_ORDER: readonly RoutableTask[] = ["chat", "summarize", "generateImage", "embed", "imageEmbed", "rerank"];

/** The role rows in render order; a routable task missing from the order list is a `tsc`-visible gap in the test. */
export const ROLE_ROWS_ORDERED: readonly RoleRow[] = ROLE_RENDER_ORDER.map((task) => ROLE_ROWS[task]);

/** The four picker groups, keyed on the provider row's `auth` (§5.3a) — the group label is the user's word. */
const AUTH_GROUP_LABELS: Record<ProviderAuth, string> = {
  apiKey: "Hosted (key)",
  endpoint: "Your own server (URL)",
  oauthToken: "Subscription",
  none: "Built-in",
};
const AUTH_GROUP_ORDER: readonly ProviderAuth[] = ["apiKey", "endpoint", "oauthToken", "none"];

/** `providers.available` → grouped Select items. An unavailable row (`runtime-missing` / `unavailable`)
 *  renders DISABLED with its reason as the gloss, never hidden (§5.3a: "`runtime-missing` is a cause, not a
 *  sentence a person can act on" — the reason IS the sentence). */
export function providerPickerItems(available: readonly ProviderAvailability[]): SelectItems<string> {
  const groups: SelectOptionGroup<string>[] = [];
  for (const auth of AUTH_GROUP_ORDER) {
    const rows = available.filter((row) => row.provider.auth === auth);
    if (rows.length === 0) {
      continue;
    }
    groups.push({
      label: AUTH_GROUP_LABELS[auth],
      items: rows.map((row) => ({
        label: row.provider.label,
        value: row.provider.id,
        ...(row.available ? {} : { disabled: true, description: unavailableProviderCopy(row) }),
      })),
    });
  }
  return groups;
}

function unavailableProviderCopy(row: ProviderAvailability): string {
  return row.cause === "runtime-missing" ? "The Claude runtime isn't installed on this server." : "Not built on this server.";
}

/** The `api` control renders ONLY when the provider lists more than one (§5.3a — a one-option combobox can
 *  only be gotten wrong). */
export function showsApiControl(provider: ProviderDef | undefined): boolean {
  return provider !== undefined && provider.apis.length > 1;
}

const CHAT_API_LABEL_PAIRS = [
  ["chat-completions", "Chat Completions"],
  ["agent-sdk", "Agent SDK (Claude subscription)"],
  ["anthropic-messages", "Anthropic Messages"],
] as const;

/** The api-picker labels (the protocol axis), keyed on `CHAT_APIS` so a new member is a `tsc` error. */
export const CHAT_API_LABELS: Record<ProviderDef["apis"][number], string> = Object.fromEntries(CHAT_API_LABEL_PAIRS) as Record<
  ProviderDef["apis"][number],
  string
>;

/** A connection row's one-line identity — `<label> · <model>` when the label was not auto-minted from them. */
export function connectionSummary(row: { readonly label: string; readonly model: string }): string {
  return row.label.includes(row.model) ? row.label : `${row.label} · ${row.model}`;
}

/** The inline refusal a Model-roles row shows BEFORE writing a binding (§5.3a — the slot is the first
 *  enforcement point): a background task on a row with `allowBackground` off. `null` = bindable. */
export function bindRefusal(row: { readonly allowBackground: boolean }, task: RoutableTask): string | null {
  return canFund(row, task) ? null : "This connection doesn't allow background work — turn it on to use it here.";
}

/** What a turn resolves for this row TODAY, in plain words — the PERSISTED read (`listBindings`), never form
 *  state (the 2026-08-01 incident this pane's header used to record). */
export function persistedRoleLabel(view: {
  readonly resolved: { readonly model: string; readonly providerId: string } | null;
  readonly unavailableCause: string | null;
}): string {
  if (view.resolved !== null) {
    return `${view.resolved.providerId} · ${view.resolved.model}`;
  }
  return view.unavailableCause === null ? "nothing — no connection is set" : `nothing — ${view.unavailableCause}`;
}
