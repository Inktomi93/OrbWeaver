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
  settings: [
    {
      id: "chat-model",
      label: "Chat model",
      keywords: ["chat", "conversation", "source", "provider", "role-handling"],
    },
    {
      id: "embed-model",
      label: "Text embedding model",
      keywords: ["embed", "vector", "search", "memory", "dimension"],
    },
    {
      id: "image-embed-model",
      label: "Image embedding model",
      keywords: ["image", "clip", "multimodal", "caption", "cross-modal"],
    },
  ],
};

export const CONNECTIONS_HOST_CLAUDE_SUBCATEGORY: ConfigSubcategory = {
  id: "host-claude",
  label: "Host Claude",
  keywords: ["claude", "subscription", "max", "pro", "auth", "health", "probe", "owner"],
};

export const CONNECTIONS_KEYS_SUBCATEGORY: ConfigSubcategory = {
  id: "saved-keys",
  label: "Saved keys",
  keywords: ["credential", "api key", "provider", "openrouter", "anthropic", "openai"],
  settings: [
    {
      id: "add-key",
      label: "Add a provider key",
      keywords: ["credential", "api key", "add", "openrouter", "anthropic", "openai"],
    },
    {
      id: "active-key",
      label: "Active credential per provider",
      keywords: ["active", "default", "credential", "switch", "test", "health", "remove"],
    },
  ],
};
