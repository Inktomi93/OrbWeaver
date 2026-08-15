// The lorebook entry editor's crash-survival mirror (HIGH tier — free-prose `content` + `description`
// plus the keyword-chip list; #73). Schema-version-gated only (no `validate`): `EntryFormValues` is a
// plain flattened interface with no zod twin (the wire mapper lives in `entry-editor-model.ts`), so a
// stale-shape draft is caught by `schemaVersion` alone — bump it whenever the form's field set changes
// shape. Instantiated ONCE at module scope (the store THROWS on a duplicate `name`).

import { createEntityDraftStore } from "#state";
import type { EntryFormValues } from "./entry-editor-model.ts";

export const entryDraftStore = createEntityDraftStore<EntryFormValues>({
  name: "world-info-entry",
  schemaVersion: 1,
});
