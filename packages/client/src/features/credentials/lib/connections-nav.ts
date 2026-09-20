// The Connections group's nav entries — the ONE home for both ends of the anchor wiring (the
// `workloads-jobs-nav.ts` precedent): each contribution def spells its `nav` from these and each section
// body stamps `configAnchorId("connections", …)` from the same constant. The group is a `sections` skimmer
// (config-revamp-design.md §6.8) — these three ARE its rows: the user's connection rows first (the unit every
// role references), Model roles, then the saved-key reuse view (inference program §5.3a).

import type { ConfigSubcategory } from "#state";

export const CONNECTIONS_LIST_SUBCATEGORY: ConfigSubcategory = {
  id: "connections",
  label: "Connections",
  keywords: ["connection", "provider", "model", "key", "url", "openrouter", "anthropic", "vllm", "ollama", "claude"],
  teach: {
    summary: "Each connection is one provider + one model, with its own key or server URL. Every turn you trigger runs on YOUR connections, in any room.",
    affects: ["which models your roles can pick from"],
  },
  settings: [
    {
      id: "add-connection",
      label: "Add a connection",
      keywords: ["add", "connection", "provider", "key", "url", "model"],
      teach: {
        summary: "Pick a provider, paste a key or a server URL, pick a model. The key is stored once and never shown again.",
        affects: ["the connections your roles can use"],
      },
    },
  ],
};

export const CONNECTIONS_ROLES_SUBCATEGORY: ConfigSubcategory = {
  id: "model-roles",
  label: "Model roles",
  keywords: ["chat", "embed", "rerank", "summarize", "utility", "image", "model", "provider"],
  teach: {
    summary:
      "Which of your connections each role uses: chat, the utility model, embeddings and the rest. Rooms never override this — a turn always runs on the connection of whoever triggered it.",
    affects: ["the connection every role resolves to, for you"],
  },
  settings: [
    {
      id: "chat-model",
      label: "Chat model",
      keywords: ["chat", "conversation", "provider"],
      teach: {
        summary: "The connection every conversation turn you trigger runs on — in your rooms and in anyone else's.",
        affects: ["every turn you send"],
        related: [{ group: "connections", sub: "connections", setting: "add-connection" }],
      },
    },
    {
      id: "utility-model",
      label: "Utility model",
      keywords: ["summarize", "structured", "caption", "memory", "digest", "background"],
      teach: {
        summary: "Summaries, structured extraction and image captions run here. It must allow background work, or those quietly skip.",
        affects: ["memory digests, captions, extraction and the turn-arbiter"],
      },
    },
    {
      id: "embed-model",
      label: "Text embedding model",
      keywords: ["embed", "vector", "search", "memory", "dimension"],
      teach: {
        summary: "The model that turns text into vectors — memory recall, search and the corpus analyses all read from what it wrote.",
        affects: ["memory recall, search and corpus analysis quality", "the whole index: changing it means re-embedding"],
      },
    },
  ],
};

export const CONNECTIONS_KEYS_SUBCATEGORY: ConfigSubcategory = {
  id: "saved-keys",
  label: "Saved keys",
  keywords: ["credential", "api key", "provider", "revoke", "remove"],
  teach: {
    summary: "The keys your connections reuse. A key is added from a connection; here you can revoke or remove it.",
    affects: ["every connection that uses that key"],
  },
};
