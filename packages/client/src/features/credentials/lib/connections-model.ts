// The Connections settings pane's pure model: role-slot descriptors, source labels, and the
// embedding-dimension mismatch warning. Consumed by connections-settings-surface.tsx.

import type { ChatApi, RoutingRoleKey } from "@orb/contracts/connection";
import { ROUTING_ROLE_KEYS } from "@orb/contracts/connection";
import type { CredentialProvider, CredentialSource } from "@orb/contracts/credentials";
import type { UserSettings } from "@orb/contracts/settings";
import { INFERENCE_SOURCES, SUMMARIZE_SOURCES } from "@orb/contracts/settings";

const PROVIDER_LABEL_PAIRS: readonly (readonly [CredentialProvider, string])[] = [
  ["openrouter", "OpenRouter"],
  ["anthropic", "Anthropic"],
  ["openai", "OpenAI"],
  ["custom_openai", "Custom OpenAI-compatible"],
] as const;

/** The human label for each storable provider (the add-dialog picker). */
export const PROVIDER_LABELS: Record<CredentialProvider, string> = Object.fromEntries(PROVIDER_LABEL_PAIRS) as Record<CredentialProvider, string>;

/** The full storable-provider order. */
const PROVIDERS_ORDERED: readonly CredentialProvider[] = PROVIDER_LABEL_PAIRS.map(([provider]) => provider);

/** The add-key dialog's provider options — every storable provider is user-addable. */
export const ADD_KEY_PROVIDERS_ORDERED: readonly CredentialProvider[] = PROVIDERS_ORDERED;

const SOURCE_LABEL_PAIRS: readonly (readonly [CredentialSource, string])[] = [
  ["openrouter", "OpenRouter"],
  ["max-pro-sub", "Claude subscription (host)"],
  ["vllm", "Local vLLM (GPU)"],
  ["local-light", "Local light (in-process)"],
  ["custom_openai", "Custom OpenAI-compatible"],
] as const;

/** The human label for each provider-source (the picker option text). */
export const SOURCE_LABELS: Record<CredentialSource, string> = Object.fromEntries(SOURCE_LABEL_PAIRS) as Record<CredentialSource, string>;

const SOURCE_ORDER: readonly CredentialSource[] = SOURCE_LABEL_PAIRS.map(([source]) => source);

/** One typed inference-role slot's descriptor (the compact-row config the surface renders). */
export interface RoleSlot {
  readonly role: RoutingRoleKey;
  readonly label: string;
  readonly description: string;
  readonly sources: readonly CredentialSource[];
  readonly optional: boolean;
  readonly carriesChatKnobs: boolean;
  readonly modelPlaceholder: string;
  /** `true` for a slot with no editable persistence home — rendered read-only, skipped by the projection. */
  readonly readOnly: boolean;
}

/** The per-role slot descriptors, in render order. Keyed on `ROUTING_ROLE_KEYS` so a new role is a `tsc` error until it has a slot. */
export const ROLE_SLOTS: Record<RoutingRoleKey, RoleSlot> = {
  chat: {
    role: "chat",
    label: "Chat",
    description: "The main conversation model.",
    sources: SOURCE_ORDER,
    optional: false,
    carriesChatKnobs: true,
    modelPlaceholder: "e.g. anthropic/claude-opus-4-8",
    readOnly: false,
  },

  embed: {
    role: "embed",
    label: "Text embedding",
    description: "Vectorizes text for semantic search and memory. Feeds the shared 1024-dim space.",
    sources: INFERENCE_SOURCES,
    optional: false,
    carriesChatKnobs: false,
    modelPlaceholder: "e.g. text-embedding-3-large",
    readOnly: false,
  },
  rerank: {
    role: "rerank",
    label: "Rerank",
    description: "Reorders retrieved results by relevance.",
    sources: INFERENCE_SOURCES,
    optional: false,
    carriesChatKnobs: false,
    modelPlaceholder: "e.g. rerank-v3.5",
    readOnly: false,
  },
  imageEmbed: {
    role: "imageEmbed",
    label: "Image embedding",
    description: "Optional — set a multimodal/CLIP embedder to search images directly. Empty falls back to the captioned-text lens.",
    sources: INFERENCE_SOURCES,
    optional: true,
    carriesChatKnobs: false,
    modelPlaceholder: "e.g. clip-vit-large (leave empty for captioned-text)",
    readOnly: false,
  },
  summarize: {
    role: "summarize",
    label: "Summarize",
    description: "Condenses long context for memory.",
    sources: SUMMARIZE_SOURCES,
    optional: false,
    carriesChatKnobs: false,
    modelPlaceholder: "e.g. anthropic/claude-haiku-4-5",
    readOnly: false,
  },
  generateImage: {
    role: "generateImage",
    label: "Image generation",
    description: "Renders pictures from prompts (the /imagine surface).",
    sources: ["openrouter"],
    optional: false,
    carriesChatKnobs: false,
    modelPlaceholder: "e.g. black-forest-labs/flux-1.1-pro",
    readOnly: false,
  },
};

/** The role slots in render order (a new role auto-appears once it has a `ROLE_SLOTS` entry). */
export const ROLE_SLOTS_ORDERED: readonly RoleSlot[] = ROUTING_ROLE_KEYS.map((role) => ROLE_SLOTS[role]);

/** A minimal (source, model) selection — the two fields a role slot persists. */
export interface RoleSelection {
  readonly source?: string | null | undefined;
  readonly model?: string | null | undefined;
}

/** `true` when a role selection is genuinely configured (non-empty source AND model). */
export function isConfigured(selection: RoleSelection | undefined): boolean {
  return (
    selection !== undefined &&
    typeof selection.source === "string" &&
    selection.source.trim() !== "" &&
    typeof selection.model === "string" &&
    selection.model.trim() !== ""
  );
}

/**
 * The embedding-dimension mismatch advisory: returns a warning string when the text-embed and
 * image-embed slots are both configured to different embedders, else `null`.
 */
export function embedDimensionWarning(embed: RoleSelection | undefined, imageEmbed: RoleSelection | undefined): string | null {
  const bothConfigured = isConfigured(embed) && isConfigured(imageEmbed);
  if (!bothConfigured) {
    return null;
  }
  const sameSource = embed?.source === imageEmbed?.source;
  const sameModel = embed?.model?.trim() === imageEmbed?.model?.trim();
  if (sameSource && sameModel) {
    return null;
  }
  return "Text and image embedders differ — confirm both output 1024-dimension vectors, or cross-modal image search may break (both feed one shared vector space).";
}

/** One slot's flat form value — `""` for an unset source/model (the picker's empty state). */
interface RoleSlotForm {
  readonly source: string;
  readonly model: string;
}

/** The chat slot additionally carries the protocol `api` knob. */
interface ChatSlotForm extends RoleSlotForm {
  readonly api: string;
}

/** The whole flat routing form — one entry per persistable role; no `agent` (informational read-only row, not a form field). */
export interface RoutingForm {
  readonly chat: ChatSlotForm;
  readonly embed: RoleSlotForm;
  readonly rerank: RoleSlotForm;
  readonly imageEmbed: RoleSlotForm;
  readonly summarize: RoleSlotForm;
  readonly generateImage: RoleSlotForm;
}

type RoutingSection = UserSettings["routing"];

interface StoredRoleConfig {
  readonly source?: string | undefined;
  readonly model?: string | null | undefined;
}

function projectSlot(config: StoredRoleConfig | undefined): RoleSlotForm {
  return {
    source: config?.source ?? "",
    model: config?.model ?? "",
  };
}

/** Project the stored `routing` section into the fully-populated flat form (mount seed). */
export function projectRoutingForm(routing: RoutingSection): RoutingForm {
  const roleDefaults = routing.roleDefaults;
  const chat = roleDefaults.chat;
  return {
    chat: {
      ...projectSlot(chat),
      api: chat?.api ?? "",
    },
    embed: projectSlot(roleDefaults.embed),
    rerank: projectSlot(roleDefaults.rerank),
    imageEmbed: projectSlot(roleDefaults.imageEmbed),
    summarize: projectSlot(roleDefaults.summarize),
    generateImage: projectSlot(roleDefaults.generateImage),
  };
}

function orUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function toRoleConfig(slot: RoleSlotForm): { source: string | null; model: string | null } {
  return {
    // EVERY leaf is written EXPLICITLY, `null` for an emptied field — never an omitted key. The write
    // path is `deepMergePlain(stored, patch)`, where an omitted key is a NO-OP: omitting the emptied
    // fields left the previous selection pinned server-side while the pane rendered the cleared row, so
    // "Clear" (and a provider switch, which resets the model) silently did nothing to what a turn
    // resolves. `null` is the clear signal the lenient parser heals — `source` is `.catch(undefined)` (a
    // null lands as unset) and `model` is `.nullable()` (a null IS the stored empty).
    source: orUndefined(slot.source) ?? null,
    model: orUndefined(slot.model) ?? null,
  };
}

function toChatConfig(slot: ChatSlotForm): Record<string, string | null> {
  return { ...toRoleConfig(slot), api: orUndefined(slot.api) ?? null };
}

/**
 * Project the flat form back into the `routing` section written by `updateUserSettingsSection`. Every
 * role's every leaf is named: a set field carries its value, an emptied one carries an explicit `null`
 * clear. Nothing is omitted — an omitted key is a deepMergePlain no-op, i.e. a clear that never lands.
 * The role objects themselves stay non-null (`roleDefaults.chat: null` would fail the non-nullable role
 * schema); clearing a role = clearing its leaves.
 */
export function toRoutingSection(form: RoutingForm): { roleDefaults: Record<string, unknown> } {
  const roleDefaults: Record<string, unknown> = { chat: toChatConfig(form.chat) };
  const nonChat: readonly [Exclude<RoutingRoleKey, "chat">, RoleSlotForm][] = [
    ["embed", form.embed],
    ["rerank", form.rerank],
    ["imageEmbed", form.imageEmbed],
    ["summarize", form.summarize],
    ["generateImage", form.generateImage],
  ];
  for (const [role, slot] of nonChat) {
    roleDefaults[role] = toRoleConfig(slot);
  }
  return { roleDefaults };
}

// ── LIVE vs DRAFT ──────────────────────────────────────────────────────────────────────────────────
// The pane is autosaved, so what it renders is FORM state — which is the user's draft until a save lands.
// On 2026-08-01 that cost a live debugging session: the owner's `roleDefaults` was NULL for two hours
// while the pane showed a full "OpenRouter · Claude Sonnet · Protocol Auto" row under a "Saved" chip, and
// turns quietly resolved the owner fallback (resolve-role.ts). A row must therefore say which of the two
// it is showing, per row, against the PERSISTED projection.

/** A persistable role of the flat form (excludes the read-only `agent` mirror, which has no form entry).
 *  NOT exported — `no-inline-types` keeps exported type aliases out of a feature's lib; consumers spell
 *  `keyof RoutingForm` (the same derivation) against the exported form interface. */
type RoutingFormRole = keyof RoutingForm;

/** `true` when this row's live selection is NOT what the server has persisted (i.e. not what a turn resolves). */
export function roleRowDrifted(live: RoutingForm, persisted: RoutingForm, role: RoutingFormRole): boolean {
  const a = live[role];
  const b = persisted[role];
  if (a.source !== b.source || a.model !== b.model) {
    return true;
  }
  return role === "chat" && live.chat.api !== persisted.chat.api;
}

/** `true` when ANY row drifts — the pane-level "this pane is showing a draft" signal. Iterates the CONTRACT's
 *  role keys (never a re-spelled list): a role the form stops carrying is a `tsc` error here, not a silent gap. */
export function routingFormDrifted(live: RoutingForm, persisted: RoutingForm): boolean {
  return ROUTING_ROLE_KEYS.some((role) => roleRowDrifted(live, persisted, role));
}

/** The chip copy per DRAFTING state — and, as its key set, the ONE home of those states (the row derives
 *  `keyof typeof` from it; a matching row has no state here because it discloses nothing). The save-phase →
 *  state dispatch lives in the row component: mapping it here would need `AutosaveSaveState` from `#forms`,
 *  and this module is imported by node-lane tests that must not drag the DOM form barrel into their program. */
export const ROLE_ROW_SYNC_LABELS = {
  pending: "Unsaved",
  saving: "Saving…",
  failed: "Not saved",
} as const;

/** What a turn resolves for this row TODAY — the PERSISTED selection in plain words (the honest answer to
 *  "is this my live connection?"). An unset row names the app default rather than pretending to a value. */
export function persistedRoleLabel(persisted: RoutingForm, role: RoutingFormRole): string {
  const slot = persisted[role];
  if (slot.source === "") {
    return "the app default";
  }
  // The cast is sound HERE (unlike the live form value): `persisted` is the server projection, whose
  // `source` came through the `credentialSourceSchema` enum parse — an unknown string can't reach it.
  const source = SOURCE_LABELS[slot.source as CredentialSource];
  return slot.model === "" ? `${source} · its default model` : `${source} · ${slot.model}`;
}

const CHAT_API_LABEL_PAIRS: readonly (readonly [ChatApi, string])[] = [
  ["agent-sdk", "Agent SDK (Claude subscription)"],
  ["chat-completions", "Chat Completions"],
  ["responses", "Responses"],
] as const;

/** The api-picker labels for the chat slot (the protocol axis). */
export const CHAT_API_LABELS: Record<ChatApi, string> = Object.fromEntries(CHAT_API_LABEL_PAIRS) as Record<ChatApi, string>;

/** The chat api options in declaration order. */
const CHAT_APIS_ORDERED: readonly ChatApi[] = CHAT_API_LABEL_PAIRS.map(([api]) => api);

// Mirrors the server resolver's assertCoherent(api, source) matrix — kept in lockstep with resolve-role.ts.
const CHAT_APIS_BY_SOURCE_PAIRS: readonly (readonly [CredentialSource, readonly ChatApi[]])[] = [
  ["max-pro-sub", ["agent-sdk"]],
  ["openrouter", ["agent-sdk", "chat-completions", "responses"]],
  ["vllm", ["chat-completions", "responses"]],
  ["local-light", ["chat-completions", "responses"]],
  ["custom_openai", ["chat-completions", "responses"]],
] as const;

/** `Partial` — `source` crosses a runtime boundary (an arbitrary form-field string, not yet validated as a
 *  known `CredentialSource`), so the lookup can genuinely miss. */
const CHAT_APIS_BY_SOURCE: Partial<Record<CredentialSource, readonly ChatApi[]>> = Object.fromEntries(CHAT_APIS_BY_SOURCE_PAIRS);

/**
 * The legal chat `api` protocols for a given source (mirrors the server's `assertCoherent`).
 *
 * An UNSET source has NO legal pinned protocol: the resolver falls back to `api` and `source`
 * INDEPENDENTLY (resolve-role.ts `ROLE_SELECTORS.chat`), so a pinned `api` over an unpinned source is
 * paired with whatever default the server picks — for the owner that default is `max-pro-sub`, which
 * `assertCoherent` rejects for every api but `agent-sdk`. Offering protocols here would let the pane
 * persist a pair that cannot take a turn; the only honest option over an unset source is Auto.
 */
export function chatApisForSource(source: string): readonly ChatApi[] {
  if (source === "") {
    return [];
  }
  return CHAT_APIS_BY_SOURCE[source as CredentialSource] ?? CHAT_APIS_ORDERED;
}

/**
 * The chat `api` that survives a switch to `source` — the current protocol when it stays legal, else `""`
 * (Auto, i.e. the resolver picks). The picker MUST apply this in the same patch as the source change: the
 * two fields are ONE selection server-side, where `assertCoherent` (resolve-role.ts) THROWS on an
 * incoherent pair at turn time. Leaving the stale `api` behind persisted an agent-sdk protocol against a
 * vLLM source — a pane that looked fine and a chat that could not take a turn.
 */
export function chatApiForSourceChange(api: string, nextSource: string): string {
  const legal: readonly string[] = chatApisForSource(nextSource);
  return legal.includes(api) ? api : "";
}

/** Bucket the credential list by provider, in `PROVIDERS_ORDERED` order (unlisted providers appended last). Only non-empty buckets are returned. */
export function groupCredentialsByProvider<T extends { readonly provider: CredentialProvider }>(
  credentials: readonly T[],
): readonly (readonly [CredentialProvider, readonly T[]])[] {
  const seen = new Set<CredentialProvider>();
  const ordered: CredentialProvider[] = [...PROVIDERS_ORDERED];
  for (const credential of credentials) {
    if (!ordered.includes(credential.provider)) {
      ordered.push(credential.provider);
    }
  }
  const groups: [CredentialProvider, T[]][] = [];
  for (const provider of ordered) {
    if (seen.has(provider)) {
      continue;
    }
    seen.add(provider);
    const bucket = credentials.filter((credential) => credential.provider === provider);
    if (bucket.length > 0) {
      groups.push([provider, bucket]);
    }
  }
  return groups;
}
