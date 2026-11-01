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

import type { RefinerySchemaStage } from "@orb/contracts/refinery";
import type { RefinerySessionId } from "@orb/kit/ids";
import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import { useEffect, useState } from "react";
import type { Trpc, TrpcReadError } from "#data";
import { createEntityMutation, useGatedQuery, useInvalidation, useTRPC } from "#data";
import { useDebouncedValue } from "#lib";

type SchemaLibrary = inferOutput<Trpc["refinery"]["listSchemas"]>;
type Preflight = inferOutput<Trpc["refinery"]["preflight"]>;
type SchemaPlan = inferOutput<Trpc["refinery"]["schemaPlan"]>;

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

/** How long a draft must stay unchanged before its plan is asked. */
const SCHEMA_PLAN_SETTLE_MS = 400;

/** The plan ask is a POST because a draft can outgrow a URL; it writes nothing, so it moves no read. Its failure is
 *  the plan line's own "couldn't check" state, not a toast. */
const useAskSchemaPlan = createEntityMutation<inferInput<Trpc["refinery"]["schemaPlan"]>, SchemaPlan>({
  options: (trpc) => trpc.refinery.schemaPlan.mutationOptions(),
  invalidates: () => [],
});

/** The plan line's state: not yet answered, the server's answer (`null` for a draft the save belt refuses), or no
 *  answer because the ask failed. */
type SchemaPlanRead = { readonly state: "asking" } | { readonly state: "answered"; readonly plan: SchemaPlan } | { readonly state: "failed" };

/** What the caller's bound Utility model would do with a draft schema, asked once the draft has settled. The last
 *  answer stays up while the next draft is asked, so the line does not flicker as the author types. */
export function useRefinerySchemaPlan(schema: Record<string, unknown>, stage: RefinerySchemaStage): SchemaPlanRead {
  const { mutate } = useAskSchemaPlan({ trpc: useTRPC(), invalidation: useInvalidation(), failureShownInline: true });
  const [read, setRead] = useState<SchemaPlanRead>({ state: "asking" });
  // Settled by content, not identity: the dialog re-parses the draft text on every render.
  const settled = useDebouncedValue(JSON.stringify(schema), SCHEMA_PLAN_SETTLE_MS);
  useEffect(() => {
    let current = true;
    const answer = (next: SchemaPlanRead): void => {
      if (current) {
        setRead(next);
      }
    };
    mutate(
      { schema: JSON.parse(settled) as Record<string, unknown>, stage },
      { onSuccess: (plan) => answer({ state: "answered", plan }), onError: () => answer({ state: "failed" }) },
    );
    return (): void => {
      current = false;
    };
  }, [mutate, settled, stage]);
  return read;
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

/** Delete one saved schema-library row. Freshness arrives on the server's `refineryChanged` event, whose
 *  root path invalidation repaints both the library and any session readout that named the removed row. */
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
