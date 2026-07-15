// The Connections settings pane (client-architecture-lockdown.md §8) — co-located SettingsPaneDefinition
// wrapping the existing surface. TEMPORARY home (M6.1: panes stay put; the credentials-owned move is M6.2).

// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve ExternalLink fine (the settings-nav.ts precedent).
import { ExternalLink } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";
import { ConnectionsSettingsSurface } from "../surfaces/connections-settings-surface";
import { CONNECTIONS_SUBCATEGORY_IDS } from "./connections-nav";

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
  body: () => <ConnectionsSettingsSurface />,
};
