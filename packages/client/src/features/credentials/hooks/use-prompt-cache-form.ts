// The connection editor's Prompt caching tier as an autosave form, minted at module scope through the D78
// session boundary. The entity is the connection; the shipped settings are only the type-level seed, because
// the tier always mounts with the row's effective settings as its server values.

import type { PromptCacheSettings } from "@orb/contracts/inference";
import { SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import { createAutosaveEntityForm } from "#forms/editor";

export const PromptCacheAutosaveForm = createAutosaveEntityForm<PromptCacheSettings>({
  defaultValues: SHIPPED_PROMPT_CACHE,
});
