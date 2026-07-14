// The owner-global regex-settings autosave form, built on createAutosaveEntityForm at module scope. The
// form value is the shared `RegexScriptsFormValues` (`{ regexScripts }`) so it binds the ONE shared
// RegexEditorDialog directly; the surface's save fn maps `regexScripts` onto the `regex` section patch
// (`{ scripts }`). No draft mirror — settings is server-synced and autosaves within the debounce window.

import type { RegexScriptsFormValues } from "#components";
import { createAutosaveEntityForm } from "#forms";

/** The singleton entity id — the regex library is one owner-global row, so a fixed key. */
export const REGEX_SETTINGS_ENTITY_ID = "regex-settings";

export const useRegexSettingsForm = createAutosaveEntityForm<RegexScriptsFormValues>({
  defaultValues: { regexScripts: [] },
});
