// The kit's subject-qualification grammar (#1383) — a `.ts` module so it may export non-components.
export { trackerActionName, trackerFieldName } from "../../lib/tracker-names.ts";

export { AddRow } from "./add-row.tsx";
export type { AmbientStripProps } from "./ambient-strip.tsx";
export { AmbientStrip } from "./ambient-strip.tsx";

export { HintEditor } from "./hint-editor.tsx";
// The meter row + its label/value/max/track pieces are ONE module (the component-size cap) — nothing
// outside it composes any of them.

export { MeterRow } from "./meter-row.tsx";
// The npc card + its header slots live in ONE module (the component-size cap) — the card is nothing but
// the arrangement of those slots, and they have no other consumer.

export { NpcCard } from "./npc-card-slots.tsx";
export {} from "./relationship-badge.tsx";

export { BeatLine, GoalLine, StatCell } from "./tracker-blocks.tsx";

export { TrackerValue } from "./tracker-value.tsx";
