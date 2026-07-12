// The CONNECTIONS settings pane's pure MODEL (W10 Panel 1 — the neo role-slot + key-library port;
// capability-turn-shaping/04 §W10). Split out of the surface (UI-Arch §2.1 component-size gate) since
// this is data + mapping, not JSX: the 7 typed ROLE-slot descriptors (allowed sources per role · label ·
// optional flag · which slot carries the chat api knob) + the source labels + the pure
// embedding-dimension mismatch warning the panel surfaces. Consumed by connections-settings-surface.tsx.
//
// WHY the role slots persist to `UserSettings.routing.roleDefaults` (NOT a new "connections" store): the
// server already homes per-role provider assignments there (`routing.roleDefaults.{chat,embed,rerank,…}`,
// contracts/settings), and `connection.resolveRole` reads them at turn time — the client never calls the
// internal resolver, it edits the settings blob the resolver consumes (the no-config-bound-to-chats +
// AppSettings-over-ENV precedent). So the role section is a settings-section autosave form over `routing`;
// the key library is the credentials CRUD (`trpc.credentials.*`), a separate mutation-driven list.
//
// The ALLOWED SOURCES per role MIRROR the settings-schema constraints (contracts/settings roleDefaults):
// chat = every CredentialSource; embed/rerank/imageEmbed = the three inference tiers; summarize adds
// max-pro-sub; generateImage = openrouter only. A stricter-than-schema list here would hide a legal
// choice; a looser one heals to "no preference" server-side (per-field `.catch`), so the two are kept in
// lockstep — the schema re-validates at the transport, this is the UX affordance layer.

import type { ChatApi, RoutingRoleKey } from "@orb/contracts/connection";
import { ROUTING_ROLE_KEYS } from "@orb/contracts/connection";
import type { CredentialProvider, CredentialSource } from "@orb/contracts/credentials";
import type { UserSettings } from "@orb/contracts/settings";
import { INFERENCE_SOURCES, SUMMARIZE_SOURCES } from "@orb/contracts/settings";

// The `(provider, label)` pairs for the add-key dialog's STORAGE-axis picker (the broader set a row may be
// saved under; distinct from the SOURCE axis above). A tuple ARRAY (`google_vertex`/`custom_openai` are
// safe as keys, but the tuple form matches the source pattern + keeps the ordered list one home).
const PROVIDER_LABEL_PAIRS: readonly (readonly [CredentialProvider, string])[] = [
  ["openrouter", "OpenRouter"],
  ["anthropic", "Anthropic"],
  ["openai", "OpenAI"],
  ["google_vertex", "Google Vertex"],
  ["custom_openai", "Custom OpenAI-compatible"],
  // The storage-axis GIF-search key (Tenor/Giphy) — not a MODEL source, but a stored provider credential,
  // so it groups in the saved-keys library with its own header (spec §5.1 "gif-search last if present").
  ["gif-search", "GIF search"],
] as const;

/** The human label for each storable provider (the add-dialog picker). Derived from the pairs (one home). */
export const PROVIDER_LABELS: Record<CredentialProvider, string> = Object.fromEntries(
  PROVIDER_LABEL_PAIRS,
) as Record<CredentialProvider, string>;

/** The full storable-provider order (the saved-keys GROUPING order — includes `gif-search`, the storage-axis
 *  member the library groups but no role sources; spec §5.1). */
export const PROVIDERS_ORDERED: readonly CredentialProvider[] = PROVIDER_LABEL_PAIRS.map(
  ([provider]) => provider,
);

/** The ADD-KEY dialog's provider options — the model-source providers only (`gif-search` keys are minted by
 *  the GIF search feature, not this dialog). A subset of `PROVIDERS_ORDERED`, one home. */
export const ADD_KEY_PROVIDERS_ORDERED: readonly CredentialProvider[] = PROVIDERS_ORDERED.filter(
  (provider) => provider !== "gif-search",
);

// The `(source, label)` pairs, ordered for the pickers. A tuple ARRAY (not an object literal) because the
// `CredentialSource` union has hyphenated members (`max-pro-sub`/`local-light`) that a quoted object-key
// literal trips `useNamingConvention` on; the `Record` lookup is DERIVED from this one home below, keeping
// both exhaustiveness (the tuple's element type is `[CredentialSource, string]`) and the stable order.
const SOURCE_LABEL_PAIRS: readonly (readonly [CredentialSource, string])[] = [
  ["openrouter", "OpenRouter"],
  ["max-pro-sub", "Claude subscription (host)"],
  ["vllm", "Local vLLM (GPU)"],
  ["local-light", "Local light (in-process)"],
  ["custom_openai", "Custom OpenAI-compatible"],
] as const;

/** The human label for each provider-source (the picker option text). Derived from `SOURCE_LABEL_PAIRS`
 *  (one home) — a lookup keyed by the `CredentialSource` union. */
export const SOURCE_LABELS: Record<CredentialSource, string> = Object.fromEntries(
  SOURCE_LABEL_PAIRS,
) as Record<CredentialSource, string>;

/** The provider-source axis, ordered for the pickers (the `SOURCE_LABEL_PAIRS` declaration order). */
const SOURCE_ORDER: readonly CredentialSource[] = SOURCE_LABEL_PAIRS.map(([source]) => source);

/** One typed inference-role slot's descriptor (the compact-row config the surface renders). */
export interface RoleSlot {
  readonly role: RoutingRoleKey;
  /** The row's human label. */
  readonly label: string;
  /** A one-line description of what the role does (the row's muted subtitle). */
  readonly description: string;
  /** The sources this role may run on — a subset of `CredentialSource`, matching the settings schema. */
  readonly sources: readonly CredentialSource[];
  /** `true` for a slot commonly left empty (renders an "optional" hint) — only `imageEmbed` today. */
  readonly optional: boolean;
  /** `true` when the slot additionally carries the chat `api` + `roleHandling` knobs (only `chat`). */
  readonly carriesChatKnobs: boolean;
  /** Placeholder model text for the free-text model input (the source's typical id shape). */
  readonly modelPlaceholder: string;
  /** `true` for a slot with NO editable persistence home today — rendered as an informational read-only
   *  row. Only `agent`: `roleDefaults` has no `agent` key (resolve-role.ts — the `agent` role falls back to
   *  chat's config), and per-agent connection overrides are DEFERRED to the agent-principal build (D-ledger
   *  04 §W10). So the slot is SHOWN (the 7-slot spec) but not editable — never a control that silently
   *  drops on save. `readOnly` slots carry no `RoutingForm` entry + are skipped by the projection. */
  readonly readOnly: boolean;
}

// INFERENCE_SOURCES (embed/rerank/imageEmbed) + SUMMARIZE_SOURCES are imported from @orb/contracts/settings
// — one canonical home for each per-role source subset, derived here for the picker options (§7.5).

/** The per-role slot descriptors, in render order (chat first, the generation roles last). Keyed on the
 *  canonical `ROUTING_ROLE_KEYS` tuple so a new inference role is a `tsc` error until it has a slot. */
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
  agent: {
    role: "agent",
    label: "Agent",
    // READ-ONLY today: `roleDefaults` has no `agent` key, so the agent (buddy) role resolves off the Chat
    // config; per-agent connection overrides land with the agent-principal build (D-ledger 04 §W10).
    description:
      "Tool-using companion turns (the buddy). Uses the Chat model until per-agent overrides ship.",
    sources: SOURCE_ORDER,
    optional: false,
    carriesChatKnobs: false,
    modelPlaceholder: "",
    readOnly: true,
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
    description:
      "Optional — set a multimodal/CLIP embedder to search images directly. Empty falls back to the captioned-text lens.",
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

/** The role slots in render order (a stable array over the canonical tuple, so the surface iterates one
 *  home and a new role auto-appears once it has a `ROLE_SLOTS` entry). */
export const ROLE_SLOTS_ORDERED: readonly RoleSlot[] = ROUTING_ROLE_KEYS.map(
  (role) => ROLE_SLOTS[role],
);

// --- The embedding-dimension mismatch guardrail (W10 §W10 EMBED slots) -------
// The text `embed` slot and the `imageEmbed` slot both feed ONE fixed-dim shared vector space
// (`F32_BLOB(1024)`, cosine-compared for cross-modal search). Two embedders producing DIFFERENT dims
// silently break raw cross-modal search — the coherence guard is a WARNING, not a merge (owner ruling).
// The client cannot know a model's true output dimension without a probe, so this is a SOFT advisory: it
// fires when BOTH slots are configured to a DIFFERENT (source, model) pair — the case where a dimension
// mismatch is plausible — so the user is prompted to confirm the two embedders share the 1024-dim space.
// Identical pairs (or an empty imageEmbed, the common captioned-text-fallback case) never warn.

/** A minimal (source, model) selection — the two fields a role slot persists. `source` is widened to
 *  `string` so BOTH the stored config (`CredentialSource | undefined`) and the flat form (`""` = unset)
 *  pass without a cast; an empty/whitespace source is treated as unset. */
export interface RoleSelection {
  readonly source?: string | null | undefined;
  readonly model?: string | null | undefined;
}

/** `true` when a role selection is genuinely configured (a non-empty source AND a non-empty model). An
 *  unset/blank source or a blank/whitespace model is "no preference" (falls through to the resolver). */
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
 * The embedding-dimension mismatch advisory: returns a warning string when BOTH the text-embed and the
 * image-embed slots are configured to DIFFERENT embedders (a plausible dimension mismatch across the one
 * 1024-dim shared space), else `null`. Identical embedders, or an empty image slot (the captioned-text
 * fallback), produce no warning. Pure — the surface renders the returned string in a warning row.
 */
export function embedDimensionWarning(
  embed: RoleSelection | undefined,
  imageEmbed: RoleSelection | undefined,
): string | null {
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

// --- The routing form projection (server section ⇄ flat form ⇄ save patch) ---
// The role slots persist to `UserSettings.routing.roleDefaults` (see the module header). The stored shape
// is SPARSE (every field optional — an unset field falls through the resolver layers), which TanStack Form
// binds badly (a nested `roleDefaults.chat.source` on an absent parent is undefined-path churn). So the
// surface edits a FULLY-POPULATED flat form (every slot's source/model present, `""` = unset), projected
// from the server section on mount and projected BACK to a sparse section on save — the system-settings
// project/diff precedent. Empty strings collapse to omitted keys, so an unset slot round-trips to "no
// preference" (never a pinned empty value), and the chat api/roleHandling knobs ride the chat slot only.

/** One slot's flat form value — `""` for an unset source/model (the picker's empty state). */
export interface RoleSlotForm {
  readonly source: string;
  readonly model: string;
}

/** The chat slot additionally carries the protocol `api` knob. (Adjacent-same-role handling moved to the
 *  preset — `params.advanced.roleHandling` — and is authored in the Assembly, not here; D66-C W6 REVERSED.) */
export interface ChatSlotForm extends RoleSlotForm {
  readonly api: string;
}

/** The whole flat routing form — one entry per PERSISTABLE role, chat carrying its extra knobs. Keyed by
 *  role so the surface binds `chat.source`, `embed.model`, etc. as concrete nested paths that always exist.
 *  NO `agent`: `roleDefaults` has no `agent` key (the agent role resolves off chat; per-agent overrides are
 *  deferred, see the `readOnly` slot doctrine) — the agent slot is an informational read-only row, not a
 *  form field. The 6 keys here are exactly the `roleDefaults` schema keys. */
export interface RoutingForm {
  readonly chat: ChatSlotForm;
  readonly embed: RoleSlotForm;
  readonly rerank: RoleSlotForm;
  readonly imageEmbed: RoleSlotForm;
  readonly summarize: RoleSlotForm;
  readonly generateImage: RoleSlotForm;
}

/** The `routing` section value (the autosave form's persisted section). */
type RoutingSection = UserSettings["routing"];

/** The stored per-role config shape (a lenient subset of the schema's role configs — `source` is a union
 *  member and `model` is `string | null`; both optional). */
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

/** Project the stored `routing` section into the fully-populated flat form (mount seed). Every persistable
 *  slot is present with `""` for an unset field, so TanStack Form binds every path. */
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

/** A non-empty string, or `undefined` (an empty/whitespace picker value is "no preference" — omitted so
 *  the server's per-field `.catch(undefined)` layer falls through to the next routing layer). */
function orUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Build the sparse `{ source?, model? }` for a non-chat role, omitting empties. */
function toRoleConfig(slot: RoleSlotForm): { source?: string; model?: string } | undefined {
  const source = orUndefined(slot.source);
  const model = orUndefined(slot.model);
  if (source === undefined && model === undefined) {
    return;
  }
  return {
    ...(source !== undefined ? { source } : {}),
    ...(model !== undefined ? { model } : {}),
  };
}

/** Build the sparse chat-role config (adds the protocol `api` on top of source/model). */
function toChatConfig(slot: ChatSlotForm): Record<string, string> | undefined {
  const base = toRoleConfig(slot) ?? {};
  const api = orUndefined(slot.api);
  const config: Record<string, string> = {
    ...base,
    ...(api !== undefined ? { api } : {}),
  };
  return Object.keys(config).length === 0 ? undefined : config;
}

/**
 * Project the flat form back into the sparse `routing` section written by `updateUserSettingsSection`.
 * Empty picker values collapse to omitted keys (unset ⇒ "no preference"); a whole role with no
 * configured field is omitted entirely. The result is the full `roleDefaults` object (partial per role),
 * so the section write replaces `roleDefaults` wholesale — clearing a slot genuinely releases it.
 */
export function toRoutingSection(form: RoutingForm): { roleDefaults: Record<string, unknown> } {
  const roleDefaults: Record<string, unknown> = {};
  const chat = toChatConfig(form.chat);
  if (chat !== undefined) {
    roleDefaults["chat"] = chat;
  }
  const nonChat: readonly [Exclude<RoutingRoleKey, "chat" | "agent">, RoleSlotForm][] = [
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

// The `(api, label)` pairs for the chat slot's protocol picker. A tuple ARRAY (hyphenated `ChatApi`
// members trip `useNamingConvention` as object keys); the empty "auto" option is added at the surface.
const CHAT_API_LABEL_PAIRS: readonly (readonly [ChatApi, string])[] = [
  ["agent-sdk", "Agent SDK (Claude subscription)"],
  ["chat-completions", "Chat Completions"],
  ["responses", "Responses"],
  ["anthropic-messages", "Anthropic Messages (direct)"],
] as const;

/** The api-picker labels for the chat slot (the protocol axis). Derived from `CHAT_API_LABEL_PAIRS`. */
export const CHAT_API_LABELS: Record<ChatApi, string> = Object.fromEntries(
  CHAT_API_LABEL_PAIRS,
) as Record<ChatApi, string>;

/** The chat api options in declaration order. */
export const CHAT_APIS_ORDERED: readonly ChatApi[] = CHAT_API_LABEL_PAIRS.map(([api]) => api);

// --- The source→legal-api map (mirror of the resolver's `assertCoherent`) ----
// The chat slot's protocol `api` options are FILTERED by the selected source: the server resolver's
// `assertCoherent(api, source)` (resolve-role.ts:148-166) HARD-THROWS an illegal pair, so offering one in
// the picker would let the user save a routing config that fails at turn time. This is the client mirror of
// that matrix (CONNECTIONS-BUILD-SPEC §1.2) — kept in lockstep with the resolver (cite it on any change):
//   • max-pro-sub                     → agent-sdk only
//   • openrouter                      → all four (agent-sdk · chat-completions · responses · anthropic-messages)
//   • vllm / local-light / custom     → chat-completions · responses (no sub-only agent-sdk, no OR-only direct)
// The empty "Auto" option is always offered (added at the row); an illegal STORED api (left over from a
// source flip) renders the Auto option selected — never a silently-coherent illegal pair.
// A tuple ARRAY (not an object literal) — the hyphenated `CredentialSource` members (`max-pro-sub`/
// `local-light`) trip `useNamingConvention` as quoted object keys; the `Record` is DERIVED below (the same
// one-home pattern as `SOURCE_LABEL_PAIRS`).
const CHAT_APIS_BY_SOURCE_PAIRS: readonly (readonly [CredentialSource, readonly ChatApi[]])[] = [
  ["max-pro-sub", ["agent-sdk"]],
  ["openrouter", ["agent-sdk", "chat-completions", "responses", "anthropic-messages"]],
  ["vllm", ["chat-completions", "responses"]],
  ["local-light", ["chat-completions", "responses"]],
  ["custom_openai", ["chat-completions", "responses"]],
] as const;

const CHAT_APIS_BY_SOURCE: Record<CredentialSource, readonly ChatApi[]> = Object.fromEntries(
  CHAT_APIS_BY_SOURCE_PAIRS,
) as Record<CredentialSource, readonly ChatApi[]>;

/** The legal chat `api` protocols for a given source (the `assertCoherent` mirror, §1.2). An empty/unset
 *  source ("Default") offers ALL apis — the resolver derives a coherent pair from the source default, and
 *  the Auto option (added at the row) is the honest choice until a source is picked. */
export function chatApisForSource(source: string): readonly ChatApi[] {
  if (source === "") {
    return CHAT_APIS_ORDERED;
  }
  return CHAT_APIS_BY_SOURCE[source as CredentialSource] ?? CHAT_APIS_ORDERED;
}

// --- Saved-keys grouping (Phase 4 §5.1) --------------------------------------
/** Bucket the credential list by provider, in the stable `PROVIDERS_ORDERED` order (+ any provider present
 *  but not in the ordered set appended last). Generic over the credential row shape (the surface passes its
 *  inference-typed rows — no widen/cast). Only non-empty buckets are returned (one header per present
 *  provider — the mockup `.kcluster` grouping). */
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
