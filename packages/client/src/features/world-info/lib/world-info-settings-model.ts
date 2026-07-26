// The World-info settings-SECTION model (Phase B ②) — the bound-field constants only. The form value type
// is NOT re-spelled here: it IS the stored section shape, so the hook + surface derive it in place via the
// indexed access `UserSettings["worldInfo"]` (no alias, no `contract/` home needed for a pure derive —
// no-inline-types). Bounds mirror the contract (SCAN_DEPTH 1..200, WI_TOKEN_BUDGET 0..65536) so the
// NumberField clamps at the same edges the server re-validate does.

export const SCAN_DEPTH_MIN = 1;
export const SCAN_DEPTH_MAX = 200;
export const WI_TOKEN_BUDGET_MIN = 0;
export const WI_TOKEN_BUDGET_MAX = 65_536;
