// brand-flow: where a branded id is minted, widened to a plain string, laundered back into a brand, or never branded.
// Read-only. Never in CI, never a gate.

export type { RankedSite } from "./report.ts";
export { rank, renderReport } from "./report.ts";
export { runBrandFlow } from "./run.ts";
export type { BrandFlowReport } from "./scan.ts";
export { brandFlowWorlds, scanBrandEdgesAt, scanBrandFlow } from "./scan.ts";
