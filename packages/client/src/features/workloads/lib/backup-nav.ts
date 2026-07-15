// Backup & Restore pane subcategory ids — shared by the pane def (backup-pane.tsx) and the surface's
// `<Section>` anchor stamps; split out to avoid a pane↔surface import cycle.
export const BACKUP_SUBCATEGORY_IDS = { export: "export", import: "import" } as const;
