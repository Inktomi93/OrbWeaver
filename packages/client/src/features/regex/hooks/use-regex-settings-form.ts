// The owner-global regex-settings autosave form, mounted through the D78 session boundary
// (`RegexSettingsForm`) at module scope — the boundary owns the (constant) entity key AND persists
// structural array ops via its store-subscription driver, so the surface's add/remove call-site
// `handleSubmit` flushes are gone (autosave-form-doctrine.md §3/§8, D78 L4). The form value is the shared
// `RegexScriptsFormValues` (`{ regexScripts }`) so it binds the ONE shared RegexEditorDialog directly; the
// surface's save fn maps `regexScripts` onto the `regex` section patch (`{ scripts }`). No draft mirror —
// settings is server-synced and autosaves within the debounce window.

import type { RegexScriptsFormValues } from "#components";
import { createAutosaveEntityForm } from "#forms";

/** The singleton entity id — the regex library is one owner-global row, so a fixed key. */
export const REGEX_SETTINGS_ENTITY_ID = "regex-settings";

export const RegexSettingsForm = createAutosaveEntityForm<RegexScriptsFormValues>({
  defaultValues: { regexScripts: [] },
});
