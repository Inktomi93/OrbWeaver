// The admin OPS sections' nav entries (SET-SEAMS stage 3) — the model-catalog refreshers and the inline
// card embed. Both live here for the same reason their bodies share `components/admin-ops-section.tsx`:
// they are the two ops utilities, kept as SEPARATE sections so their `(anchor, subId)` pairs stay
// byte-identical to the pre-split pane's subcategories (§7.1 — a merge into one "Ops" section would break
// every deep link and search leaf pointing at them).

import type { SettingsSubcategory } from "#state";

export const ADMIN_CATALOG_SUBCATEGORY: SettingsSubcategory = {
  id: "model-catalog",
  label: "Model catalog",
  keywords: ["models", "catalog", "sync", "refresh", "openrouter", "providers"],
};

export const ADMIN_EMBEDDINGS_SUBCATEGORY: SettingsSubcategory = {
  id: "card-embeddings",
  label: "Card embeddings",
  keywords: ["embeddings", "cards", "reindex", "vectors", "backfill", "characters"],
};
