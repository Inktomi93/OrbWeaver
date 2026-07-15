// Workloads pane subcategory ids — shared by the pane def (workloads-pane.tsx) and the surface's
// `<Section>` anchor stamps; split out to avoid a pane↔surface import cycle.
export const WORKLOADS_SUBCATEGORY_IDS = { jobs: "jobs", schedules: "schedules" } as const;
