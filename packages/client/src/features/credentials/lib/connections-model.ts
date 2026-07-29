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

function toRoleConfig(slot: RoleSlotForm): { source?: string; model?: string | null } | undefined {
  const source = orUndefined(slot.source);
  const model = orUndefined(slot.model);
  if (source === undefined && model === undefined) {
    return;
  }
  return {
    ...(source !== undefined ? { source } : {}),
    // An empty model on a LIVE slot (one that still carries a source) emits an explicit `null` — the
    // deepMergePlain clear signal — not an omitted key. Omitting is a no-op merge, so a provider switch
    // (source changes ⇒ model reset to "") would otherwise leave the previous provider's model id pinned
    // and mis-route the turn. `null` on an already-empty field is a harmless no-op clear.
    model: model ?? null,
  };
}

function toChatConfig(slot: ChatSlotForm): Record<string, string | null> | undefined {
  const base = toRoleConfig(slot) ?? {};
  const api = orUndefined(slot.api);
  const config: Record<string, string | null> = {
    ...base,
    ...(api !== undefined ? { api } : {}),
  };
  return Object.keys(config).length === 0 ? undefined : config;
}

/**
 * Project the flat form back into the sparse `routing` section written by `updateUserSettingsSection`.
 * A fully-empty slot collapses to an omitted key (unset means "no preference"). A slot that still
 * carries a source but has an empty model emits an explicit `model: null` clear (deepMergePlain
 * null=clear), so switching provider drops the previous provider's stale model id.
 */
export function toRoutingSection(form: RoutingForm): { roleDefaults: Record<string, unknown> } {
  const roleDefaults: Record<string, unknown> = {};
  const chat = toChatConfig(form.chat);
  if (chat !== undefined) {
    roleDefaults["chat"] = chat;
  }
  const nonChat: readonly [Exclude<RoutingRoleKey, "chat">, RoleSlotForm][] = [
    ["embed", form.embed],
    ["rerank", form.rerank],
    ["imageEmbed", form.imageEmbed],
    ["summarize", form.summarize],
    ["generateImage", form.generateImage],
  ];
  for (const [role, slot] of nonChat) {
    const config = toRoleConfig(slot);
    if (config !== undefined) {
      roleDefaults[role] = config;
    }
  }
  return { roleDefaults };
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

/** The legal chat `api` protocols for a given source (mirrors the server's `assertCoherent`). */
export function chatApisForSource(source: string): readonly ChatApi[] {
  if (source === "") {
    return CHAT_APIS_ORDERED;
  }
  return CHAT_APIS_BY_SOURCE[source as CredentialSource] ?? CHAT_APIS_ORDERED;
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
