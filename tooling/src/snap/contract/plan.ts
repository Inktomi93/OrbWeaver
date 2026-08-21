// The per-page capture plan — beside types.ts so the shot-plan family reads as one unit.
import type { ShotPlan } from "./types.ts";

// One page's full capture pass. Nav actions + steps + captures are FILTERED to this page's index, so a
// flat argv list drives N tabs. On single-page (totalPages 1) every filter is a no-op and the flow is
// byte-identical to the original. `unit` picks the shot suffix: "p" (--pages, the default) or "u"
// (--contexts) — the two modes are mutually exclusive so only one is ever requested per run.
export type PagePlan = ShotPlan & { pageIndex: number; totalPages: number; unit?: "p" | "u"; navigatePage?: boolean };
