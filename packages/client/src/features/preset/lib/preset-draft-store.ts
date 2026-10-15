// Preset crash-survival drafts include parallel row identities, admitted and validated by the editor model.
// Schema-version freshness rejects old editor shapes; the factory projects canonical baseline identity.

import { createEntityDraftStore } from "#state";
import type { PresetEditorValues } from "./preset-editor-values.ts";

export const presetDraftStore = createEntityDraftStore<PresetEditorValues>({
  name: "preset-config",
  schemaVersion: 2,
});
