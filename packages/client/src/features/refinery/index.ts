// refinery/ front door — the section definition (still §6a DECLARED-PLANNED: the SURFACE is R3, design-gated
// on the owner's mockup ruling) plus the R2 DATA TIER over the R1 tRPC router.
//
// Why the hooks are on the door at all, when a feature's hooks are normally intra-slice: R3's surfaces will
// live INSIDE this slice and import them relatively — but until R3 exists the only consumer is the CT, and a
// CT story module MUST enter through the `@orb/client/*` alias (a relative import into packages/client/src
// hands the story a DIFFERENT React context instance and mounts blank). The door is the alias-reachable path.

export {
  useApplyRefineryFields,
  useDeleteRefinerySession,
  useIterateRefinery,
  useRunRefineryStage,
  useStartRefinerySession,
  useUpdateRefinerySession,
} from "./hooks/use-refinery-mutations.ts";
export { useRefineryRuns, useRefinerySession, useRefinerySessions } from "./hooks/use-refinery-sessions.ts";
export { refinerySection } from "./lib/refinery-section.tsx";
