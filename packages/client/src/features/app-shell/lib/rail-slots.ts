// The rail's section groups (divider order). Modal affordances are NOT declared here — they DERIVE from
// the modal registry via each ModalDefinition's `trigger` (client-architecture-lockdown.md §6d).

/** The rail's section groups, divided by `--spacing-section`: primary (everyday collections) · authoring (create/refine) · insight (analyze). */
export const SECTION_GROUPS = ["primary", "authoring", "insight"] as const;
