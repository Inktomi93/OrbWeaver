// The Connections group's nav entries — the ONE home for both ends of the anchor wiring (the
// `workloads-jobs-nav.ts` precedent): each contribution def spells its `nav` from these and each section
// body stamps `configAnchorId("connections", …)` from the same constant. The group is a `sections` skimmer
// — these three ARE its rows: the user's connection rows first (the unit every
// role references), Model roles, then the saved-key reuse view (inference program §5.3a).

import type { RoutableTask } from "@orb/contracts/inference";
import { ADD_CONNECTION_DOOR, CHAT_ROLE_DOOR, MODEL_ROLES_SUBCATEGORY_ID, RERANK_ROLE_DOOR, UTILITY_ROLE_DOOR } from "#lib";
import type { ConfigSubcategory } from "#state";

const CHAT_MODEL_SETTING = CHAT_ROLE_DOOR.setting;
const UTILITY_MODEL_SETTING = UTILITY_ROLE_DOOR.setting;
const EMBED_MODEL_SETTING = "embed-model";
const RERANK_MODEL_SETTING = RERANK_ROLE_DOOR.setting;
/** The Connections list's add-flow leaf; its section stamps the add verb with this leaf's control id. */
export const ADD_CONNECTION_SETTING = ADD_CONNECTION_DOOR.setting;

/** The Model roles leaves a deep link can name, by the role row that renders each one's picker. */
export const ROLE_SETTING_IDS: Readonly<Partial<Record<RoutableTask, string>>> = {
  chat: CHAT_MODEL_SETTING,
  summarize: UTILITY_MODEL_SETTING,
  embed: EMBED_MODEL_SETTING,
  rerank: RERANK_MODEL_SETTING,
};

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
      id: ADD_CONNECTION_SETTING,
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
  id: MODEL_ROLES_SUBCATEGORY_ID,
  label: "Model roles",
  keywords: ["chat", "embed", "rerank", "summarize", "utility", "image", "model", "provider"],
  teach: {
    summary:
      "Which of your connections each role uses: chat, the utility model, embeddings and the rest. Rooms never override this — a turn always runs on the connection of whoever triggered it.",
    affects: ["the connection every role resolves to, for you"],
  },
  settings: [
    {
      id: CHAT_MODEL_SETTING,
      label: "Chat model",
      keywords: ["chat", "conversation", "provider"],
      teach: {
        summary: "The connection every conversation turn you trigger runs on — in your rooms and in anyone else's.",
        affects: ["every turn you send"],
        related: [{ group: "connections", sub: "connections", setting: ADD_CONNECTION_SETTING }],
      },
    },
    {
      id: UTILITY_MODEL_SETTING,
      label: "Utility model",
      keywords: ["summarize", "structured", "caption", "memory", "digest", "background"],
      teach: {
        summary: "Summaries, structured extraction and image captions run here. It must allow background work, or those quietly skip.",
        affects: ["memory digests, captions, extraction and the turn-arbiter"],
      },
    },
    {
      id: EMBED_MODEL_SETTING,
      label: "Text embedding model",
      keywords: ["embed", "vector", "search", "memory", "dimension"],
      teach: {
        summary: "The model that turns text into vectors — memory recall, search and the corpus analyses all read from what it wrote.",
        affects: ["memory recall, search and corpus analysis quality", "the whole index: changing it means re-embedding"],
      },
    },
    {
      id: RERANK_MODEL_SETTING,
      label: "Rerank model",
      keywords: ["rerank", "relevance", "smart", "speaker", "order", "ranking"],
      teach: {
        summary: "Reorders retrieved results by relevance, and ranks the characters when a room's Smart speaker order picks who replies.",
        affects: ["who Smart picks to reply", "the order of retrieved results"],
      },
    },
  ],
};

export const CONNECTIONS_KEYS_SUBCATEGORY: ConfigSubcategory = {
  id: "saved-keys",
  label: "Saved keys",
  keywords: ["credential", "api key", "provider", "replace", "revoke", "remove"],
  teach: {
    summary: "The keys your connections reuse. A key is added from a connection; here you can replace or revoke it.",
    affects: ["every connection that uses that key"],
  },
};
