// The Backup & Restore group's nav entries — the ONE home for both ends of
// the anchor wiring: each contribution def spells its `nav` from these and each section body stamps
// `configAnchorId("backup", …)` from the same constant.

import type { ConfigSubcategory } from "#state";

export const BACKUP_EXPORT_SUBCATEGORY: ConfigSubcategory = {
  id: "export",
  label: "Export",
  keywords: ["backup", "download", "save", "zip", "portability", "migrate", "leave"],
  teach: {
    summary: "Download a portable backup of your data: characters, chats, settings, personas and world-info books in one archive.",
    affects: ["nothing live; produces a downloadable archive"],
  },
};

export const BACKUP_IMPORT_SUBCATEGORY: ConfigSubcategory = {
  id: "import",
  label: "Import",
  keywords: ["restore", "upload", "sillytavern", "st", "migrate", "bundle", "zip", "card"],
  teach: {
    summary: "Restore from a backup or import SillyTavern data: upload a zip, a character card or a bundle and merge it into the library.",
    affects: ["the library, chat history and settings, depending on what the archive contains"],
  },
};
