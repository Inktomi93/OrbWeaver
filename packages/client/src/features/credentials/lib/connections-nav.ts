// The Connections group's nav entries — the ONE home for both ends of the anchor wiring (the
// `workloads-jobs-nav.ts` precedent): each contribution def spells its `nav` from these, each section body
// stamps `configAnchorId("connections", …)` from the same constant, and the roles section's "fix the key"
// action scrolls to the keys anchor through it. The group is a `sections` skimmer (config-revamp-design.md
// §6.8) — these three ARE its rows.

import type { ConfigSubcategory } from "#state";

export const CONNECTIONS_ROLES_SUBCATEGORY: ConfigSubcategory = {
  id: "model-roles",
  label: "Model roles",
  keywords: ["chat", "agent", "embed", "rerank", "summarize", "image", "model", "provider"],
  teach: {
    summary: "Which connection each role resolves to by default: chat, embedding, image-embedding and the rest. A room or preset can override any role.",
    affects: ["the default model for every role, on this account"],
  },
  settings: [
    {
      id: "chat-model",
      label: "Chat model",
      keywords: ["chat", "conversation", "source", "provider", "role-handling"],
      teach: {
        summary: "The connection every conversation resolves to by default \u2014 a room's own connection or a preset's routing can pick differently.",
        affects: ["every new turn that does not name its own connection"],
        related: [{ group: "connections", sub: "saved-keys", setting: "active-key" }],
      },
    },
    {
      id: "embed-model",
      label: "Text embedding model",
      keywords: ["embed", "vector", "search", "memory", "dimension"],
      teach: {
        summary: "The model that turns text into vectors \u2014 memory recall, search and the corpus analyses all read from what it wrote.",
        affects: ["memory recall, search and corpus analysis quality", "the whole index: changing it means re-embedding"],
      },
    },
    {
      id: "image-embed-model",
      label: "Image embedding model",
      keywords: ["image", "clip", "multimodal", "caption", "cross-modal"],
      teach: { summary: "The model that embeds images for visual similarity and gallery search.", affects: ["image search and similarity browsing"] },
    },
  ],
};

export const CONNECTIONS_HOST_CLAUDE_SUBCATEGORY: ConfigSubcategory = {
  id: "host-claude",
  label: "Host Claude",
  keywords: ["claude", "subscription", "max", "pro", "auth", "health", "probe", "owner"],
  teach: {
    summary: "The host's Claude subscription status and health probe. The owner authenticates here; members ride the subscription when allowed.",
    affects: ["Claude-subscription availability for the whole deployment"],
  },
};

export const CONNECTIONS_KEYS_SUBCATEGORY: ConfigSubcategory = {
  id: "saved-keys",
  label: "Saved keys",
  keywords: ["credential", "api key", "provider", "openrouter", "anthropic", "openai"],
  teach: {
    summary: "Provider API keys stored once and resolved by every connection to that provider. Add, test and switch the active credential per provider here.",
    affects: ["every connection that uses a provider whose key is stored here"],
  },
  settings: [
    {
      id: "add-key",
      label: "Add a provider key",
      keywords: ["credential", "api key", "add", "openrouter", "anthropic", "openai"],
      teach: {
        summary: "Store a provider API key once; every connection to that provider resolves its credential from here.",
        affects: ["every connection to that provider"],
      },
    },
    {
      id: "active-key",
      label: "Active credential per provider",
      keywords: ["active", "default", "credential", "switch", "test", "health", "remove"],
      teach: { summary: "Which stored credential a provider uses when it holds more than one.", affects: ["every connection to that provider"] },
    },
  ],
};
