// The Connections settings pane (client-architecture-lockdown.md §8) — co-located SettingsPaneDefinition
// wrapping the feature's own surface. Owned by features/credentials — the M6.2 de-god move LANDED (§8/O3);
// `surface` mode because this pane is a credential/role CRUD screen, not a knob stack.

import { ExternalLink } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";
import { ConnectionsSettingsSurface } from "../surfaces/connections-settings-surface.tsx";
import { CONNECTIONS_SUBCATEGORY_IDS } from "./connections-nav.ts";

export const connectionsPane: SettingsPaneDefinition = {
  id: "connections",
  group: "app",
  label: "Connections",
  icon: ExternalLink,
  description: "Provider credentials and the per-role model connections.",
  subcategories: [
    {
      id: CONNECTIONS_SUBCATEGORY_IDS.roles,
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
    },
    {
      id: CONNECTIONS_SUBCATEGORY_IDS.hostClaude,
      label: "Host Claude",
      keywords: ["claude", "subscription", "max", "pro", "auth", "health", "probe", "owner"],
    },
    {
      id: CONNECTIONS_SUBCATEGORY_IDS.keys,
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
    },
  ],
  body: { kind: "surface", render: () => <ConnectionsSettingsSurface /> },
};
