// The preset editor's crash-survival mirror (HIGH tier — multi-section prompt-assembly config with
// free-prose literal/templated-marker bodies; #73). Schema-version-gated only (no `validate`): a
// `.partial()` over the refined `promptConfigSchema` is unsafe (zod refuses `.partial()` on a refined
// object — the house `zod-partial-refuses-refined` lesson), so a stale-shape draft is caught by
// `schemaVersion` alone — bump it whenever `PromptConfig`'s shape changes. Instantiated ONCE at module
// scope (the store THROWS on a duplicate `name`).

import type { PromptConfig } from "@orb/contracts/preset";
import { createEntityDraftStore } from "#state";

export const presetDraftStore = createEntityDraftStore<PromptConfig>({
  name: "preset-config",
  schemaVersion: 1,
});
