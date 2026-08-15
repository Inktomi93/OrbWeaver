// The custom-schema library data tier (R3/SF — the NL design's client half): reads + writes over
// the schema CRUD, the NL forge pair, the testSchema drill, and the preflight readout. FRESHNESS rides the
// BUS exactly like the sibling hooks: the three CRUD verbs emit the `refineryChanged` user-bus member, whose
// seam row path-invalidates `trpc.refinery` (both keys live under it), so a schema saved on one device
// repaints the picker on the other. The cited STATIC rows those keys carried were deleted with the member
// (the reversal is documented in `use-refinery-mutations.ts`'s header).
//
// The forge pair (`generateSchema`/`refineSchema`) and `testSchema` are DRAFT verbs: they persist
// nothing and move no read, so they ride `createEntityMutation` with NO `invalidates` — the draft lands
// in the editor's local state, and the double-failure `failed` arm is DATA (rendered for hand-fixing),
// never an error toast.

import type { RefinerySessionId } from "@orb/kit/ids";
import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc, TrpcReadError } from "#data";
import { createEntityMutation, useGatedQuery, useTRPC } from "#data";

type SchemaLibrary = inferOutput<Trpc["refinery"]["listSchemas"]>;
type Preflight = inferOutput<Trpc["refinery"]["preflight"]>;

/** The owner's schema library (the stage-config picker + the editor's list). */
export function useRefinerySchemas(): UseQueryResult<SchemaLibrary, TrpcReadError> {
  const trpc = useTRPC();
  return useQuery(trpc.refinery.listSchemas.queryOptions());
}

/** ONE session's output-budget preflight — re-resolved per fetch; the write tier
 *  invalidates it whenever the session's scope/config moves. `null` asks nothing. */
export function useRefineryPreflight(sessionId: RefinerySessionId | null): UseQueryResult<Preflight, TrpcReadError> {
  const trpc = useTRPC();
  return useGatedQuery(sessionId, (id) => trpc.refinery.preflight.queryOptions({ sessionId: id }));
}

export const useCreateRefinerySchema = createEntityMutation<inferInput<Trpc["refinery"]["createSchema"]>, inferOutput<Trpc["refinery"]["createSchema"]>>({
  options: (trpc) => trpc.refinery.createSchema.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't save that schema.",
});

export const useUpdateRefinerySchema = createEntityMutation<inferInput<Trpc["refinery"]["updateSchema"]>, inferOutput<Trpc["refinery"]["updateSchema"]>>({
  options: (trpc) => trpc.refinery.updateSchema.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't update that schema.",
});

/** @public future: the R3 schema-editor delete affordance (R4 polish, task #30, unbuilt) — schema deletion
 *  for the R3 schema library; the verb + belts shipped with R3 so the surface can wire it without a contract
 *  round-trip. */
export const useDeleteRefinerySchema = createEntityMutation<inferInput<Trpc["refinery"]["deleteSchema"]>, unknown>({
  options: (trpc) => trpc.refinery.deleteSchema.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't delete that schema.",
});

/** NL → draft. Resolves the `failed` arm as DATA (show-the-partial); persists nothing, so the explicit
 *  EMPTY invalidates list is the honest freshness statement ("this write moves no read"). */
export const useGenerateRefinerySchema = createEntityMutation<inferInput<Trpc["refinery"]["generateSchema"]>, inferOutput<Trpc["refinery"]["generateSchema"]>>({
  options: (trpc) => trpc.refinery.generateSchema.mutationOptions(),
  invalidates: () => [],
  errorToast: "The schema generator didn't answer — try again.",
});

export const useRefineRefinerySchema = createEntityMutation<inferInput<Trpc["refinery"]["refineSchema"]>, inferOutput<Trpc["refinery"]["refineSchema"]>>({
  options: (trpc) => trpc.refinery.refineSchema.mutationOptions(),
  invalidates: () => [],
  errorToast: "The schema refiner didn't answer — try again.",
});

/** The test drill — returns the typed-per-schema payload for preview rendering; writes nothing. */
export const useTestRefinerySchema = createEntityMutation<inferInput<Trpc["refinery"]["testSchema"]>, inferOutput<Trpc["refinery"]["testSchema"]>>({
  options: (trpc) => trpc.refinery.testSchema.mutationOptions(),
  invalidates: () => [],
  errorToast: "The test run didn't finish — try again or adjust the schema.",
});
