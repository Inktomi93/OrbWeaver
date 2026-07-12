// biome-ignore-all lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react
// re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve Archive + LucideIcon fine (the
// settings-nav.ts precedent).

// The Backup & Restore settings category's nav DATA (the export/import portability pane) — split out of
// settings-nav.ts to keep that registry under the §2.1 component-size cap (the connections-nav.ts
// precedent). Same registry-as-data + one-home discipline as the sibling categories; imported back into
// `SETTINGS_CATEGORIES` (settings-nav.ts). The SHAPE vocabulary lives in settings-nav-model.ts.

import { Archive } from "@orb/ui/icons";
import type { SettingsCategory } from "./settings-nav-model";

/** Backup & Restore pane subcategory ids (the two anchored sections; same one-home discipline as the
 *  other panes — the surface stamps each `<Section>` with `settingsAnchorId("backup", id)`). */
export const BACKUP_SUBCATEGORY_IDS = { export: "export", import: "import" } as const;

/** The Backup & Restore category (USER group — export/import is PER-USER: a user only ever exports or
 *  imports their OWN library, owner-scoped by the session cookie on every route). */
export const BACKUP_CATEGORY: SettingsCategory = {
  group: "user",
  label: "Backup & Restore",
  icon: Archive,
  description: "Export your whole library, or import a backup / SillyTavern bundle.",
  built: true,
  subcategories: [
    {
      id: BACKUP_SUBCATEGORY_IDS.export,
      label: "Export",
      keywords: ["backup", "download", "save", "zip", "portability", "migrate", "leave"],
    },
    {
      id: BACKUP_SUBCATEGORY_IDS.import,
      label: "Import",
      keywords: ["restore", "upload", "sillytavern", "st", "migrate", "bundle", "zip", "card"],
    },
  ],
};
