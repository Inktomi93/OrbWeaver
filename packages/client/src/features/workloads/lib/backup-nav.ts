// The Backup & Restore group's nav entries (config-revamp-design.md §6.8) — the ONE home for both ends of
// the anchor wiring: each contribution def spells its `nav` from these and each section body stamps
// `configAnchorId("backup", …)` from the same constant.

import type { ConfigSubcategory } from "#state";

export const BACKUP_EXPORT_SUBCATEGORY: ConfigSubcategory = {
  id: "export",
  label: "Export",
  keywords: ["backup", "download", "save", "zip", "portability", "migrate", "leave"],
};

export const BACKUP_IMPORT_SUBCATEGORY: ConfigSubcategory = {
  id: "import",
  label: "Import",
  keywords: ["restore", "upload", "sillytavern", "st", "migrate", "bundle", "zip", "card"],
};
