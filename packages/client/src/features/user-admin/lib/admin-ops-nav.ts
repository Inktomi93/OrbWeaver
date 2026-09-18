// The admin OPS sections' nav entries (SET-SEAMS stage 3) — the model-catalog refreshers and the inline
// card embed. Both live here for the same reason their bodies share `components/admin-ops-section.tsx`:
// they are the two ops utilities, kept as SEPARATE sections so their `(anchor, subId)` pairs stay
// byte-identical to the pre-split pane's subcategories (§7.1 — a merge into one "Ops" section would break
// every deep link and search leaf pointing at them).

import type { ConfigSubcategory } from "#state";

export const ADMIN_CATALOG_SUBCATEGORY: ConfigSubcategory = {
  id: "model-catalog",
  label: "Model catalog",
  keywords: ["models", "catalog", "sync", "refresh", "openrouter", "providers"],
  teach: {
    summary: "Refresh the model catalog from upstream providers so new models appear in the connection picker.",
    affects: ["the model list every connection picker shows, deployment-wide"],
  },
};

export const ADMIN_EMBEDDINGS_SUBCATEGORY: ConfigSubcategory = {
  id: "card-embeddings",
  label: "Card embeddings",
  keywords: ["embeddings", "cards", "reindex", "vectors", "backfill", "characters"],
  teach: {
    summary: "Trigger a backfill of character-card embeddings so gallery similarity search and corpus analysis cover new or changed cards.",
    affects: ["character-card vector coverage for search and analysis"],
  },
};
