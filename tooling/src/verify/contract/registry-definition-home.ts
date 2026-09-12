// The co-located definition SLOT vocabulary (#1988). Seven registry-integrity policies author a slot
// (`DEFINITION_SLOTS.section`, `.chrome`, `.tile`, `.modal`, `.group`, `.collection`) and hand it to
// `lib/registry-definition-home.ts`, so the tuple is an INPUT crossing the lib↔policy boundary, not a
// reader-private constant. The union derives from the tuple so a new slot is one row here and `tsc` finds
// every reader (Spine-TypeScript-and-Patterns.md §7.4 + string-union dispatch; Core-Tooling-Law.md §2.5).

/** The definition slot a co-located file name ends with, before its extension. */
export const DEFINITION_SLOTS = {
  section: "-section",
  modal: "-modal",
  chrome: "-chrome",
  tile: "-tile",
  group: "-group",
  collection: "-collection",
} as const;

export type DefinitionSlot = (typeof DEFINITION_SLOTS)[keyof typeof DEFINITION_SLOTS];
