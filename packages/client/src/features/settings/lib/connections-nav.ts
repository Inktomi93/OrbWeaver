// biome-ignore-all lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react
// re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + LucideIcon fine
// (the settings-nav.ts precedent).

// The Connections settings category's nav DATA (W10 Panel 1) — split out of settings-nav.ts to keep that
// registry under the §2.1 component-size cap. Same registry-as-data + one-home discipline as the sibling
// categories; imported back into `SETTINGS_CATEGORIES` (settings-nav.ts). The SHAPE vocabulary lives in
// settings-nav-model.ts.

import { ExternalLink } from "@orb/ui/icons";
import type { SettingsCategory } from "./settings-nav-model";

/** Connections pane subcategory ids (W10 Panel 1 — the two anchored sections: the role slots + the saved
 *  key library; same one-home discipline as the other panes). */
export const CONNECTIONS_SUBCATEGORY_IDS = {
  roles: "model-roles",
  keys: "saved-keys",
} as const;

/** The Connections category (USER group — connections are PER-USER: credential rows are owner-scoped
 *  (`listOwnedCredentials(ownerId)`, AAD `${userId}|${provider}`) and `routing.roleDefaults` is per-user
 *  UserSettings, so this is a user preference, not deployment/app config). Provider credentials + the
 *  per-role model connections. */
export const CONNECTIONS_CATEGORY: SettingsCategory = {
  group: "user",
  label: "Connections",
  icon: ExternalLink,
  description: "Provider credentials and the per-role model connections.",
  built: true,
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
};
