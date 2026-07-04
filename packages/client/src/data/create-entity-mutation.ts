// `createEntityMutation` (UI-Primitives §13.1): the ONE mutation factory — every create/update/
// delete goes through it, never an inline `useMutation` + loose cache surgery. It bakes the whole
// canonical flow so a call site cannot hold it wrong:
//   • the 4-phase CACHE-flavor optimistic recipe (UI-Lib-TanStack-Query.md §2 — the official
//     canonical): onMutate = cancelQueries → snapshot → setQueryData → return-rollback; onError
//     restores from the RETURNED context (survives concurrent mutations); onSettled ALWAYS
//     reconciles through the central invalidation seam. Skipping cancelQueries is the classic
//     optimistic bug (a slow in-flight GET lands after the write and reverts the UI).
//   • the lightweight VARIABLES-render mode free on every mutation (omit `optimistic`): render
//     `pendingVariables` as a ghost row, `retry()` re-fires the failed variables.
//   • ONE sticky-error slot per mutation (v5 errors persist until the next mutate) with an explicit
//     `clearError()` — never multiplex two mutations' errors into one surface (§11.1; gate
//     `no-multiplexed-mutation-error`).
//   • `context.client` callback arg (v5.101) — the factory closes over no QueryClient; provider-clean.
// Callback property order is onMutate → onError → onSettled (type-inference-sensitive — the
// @tanstack/query/mutation-property-order lint).

import type { DefaultError, MutationFunction, QueryKey } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import type { InvalidateFilter, Invalidation } from "./invalidation";
import type { Trpc } from "./trpc";

/** What the tRPC proxy's `.mutationOptions()` provides — the key + fn pair the factory wraps. */
interface BaseMutationOptions<TVars, TData> {
  readonly mutationKey: readonly unknown[];
  // v5.101 `MutationFunction` is 2-arg `(vars, context)` — the tRPC proxy's `.mutationOptions()`
  // provides exactly that shape; a 1-arg fn (e.g. a test double) still assigns (fewer params OK).
  readonly mutationFn?: MutationFunction<TData, TVars>;
}

export interface EntityMutationConfig<TVars, TData, TRead> {
  /** `(t) => t.character.update.mutationOptions()` — the proxy is the one mutationKey/Fn source. */
  readonly options: (trpc: Trpc) => BaseMutationOptions<TVars, TData>;
  /**
   * CACHE-flavor optimistic update (use when MULTIPLE readers must reflect the change instantly;
   * omit for the variables-render ghost-row mode — the cheaper correct default for append-only
   * creates). `readKey` uses the proxy's DataTag'd key so `update` is typed end-to-end.
   */
  readonly optimistic?: {
    readonly readKey: (trpc: Trpc, vars: TVars) => QueryKey;
    readonly update: (old: TRead | undefined, vars: TVars) => TRead | undefined;
  };
  /** Filters reconciled on settle (success AND error) — routed through the central seam. */
  readonly invalidates: (trpc: Trpc, vars: TVars) => readonly InvalidateFilter[];
  /** Optional global-toast message on failure (rides mutation `meta` → MutationCache.onError). */
  readonly errorToast?: string | ((error: unknown) => string);
}

export interface EntityMutationResult<TVars, TData> {
  readonly mutate: (vars: TVars) => void;
  readonly mutateAsync: (vars: TVars) => Promise<TData>;
  readonly isPending: boolean;
  /** The in-flight variables — render as the ghost row in variables-mode (§13.1). */
  readonly pendingVariables: TVars | undefined;
  /** The ONE error slot (sticky until the next mutate or `clearError`). */
  readonly error: unknown | null;
  readonly clearError: () => void;
  /** Re-fire the last failed variables (the variables-mode retry affordance). */
  readonly retry: () => void;
}

interface OptimisticContext<TRead> {
  readonly snapshot: TRead | undefined;
  readonly readKey: QueryKey | null;
}

/**
 * Build the mutation hook once at module scope; features call the returned hook. The deps
 * (`trpc` + the invalidation seam) arrive per-call from the composition-provided hooks so the
 * factory itself stays import-pure (client internal cake: data → state/lib only).
 */
export function createEntityMutation<TVars, TData, TRead = unknown>(
  config: EntityMutationConfig<TVars, TData, TRead>,
): (deps: { trpc: Trpc; invalidation: Invalidation }) => EntityMutationResult<TVars, TData> {
  // biome-ignore lint/nursery/noComponentHookFactories: the D54 §13.1 editor-factory pattern — factories run at MODULE scope (const useDeleteCharacter = createEntityMutation(...)), so the returned hook has a stable identity (see forms/create-saved-entity-form.ts).
  return function useEntityMutation({ trpc, invalidation }): EntityMutationResult<TVars, TData> {
    const mutation = useMutation<TData, DefaultError, TVars, OptimisticContext<TRead>>({
      ...config.options(trpc),
      ...(config.errorToast === undefined ? {} : { meta: { errorToast: config.errorToast } }),
      onMutate: async (vars, context): Promise<OptimisticContext<TRead>> => {
        if (config.optimistic === undefined) {
          return { snapshot: undefined, readKey: null };
        }
        const readKey = config.optimistic.readKey(trpc, vars);
        // 1. Cancel in-flight refetches so they can't clobber the optimistic write.
        await context.client.cancelQueries({ queryKey: readKey });
        // 2. Snapshot for rollback.
        const snapshot = context.client.getQueryData<TRead>(readKey);
        // 3. The optimistic write.
        context.client.setQueryData<TRead>(readKey, (old) =>
          config.optimistic === undefined ? old : config.optimistic.update(old, vars),
        );
        // 4. The snapshot RETURNS — rollback reads it from onError's arg, never a closure
        //    (concurrent mutations each roll back their own snapshot).
        return { snapshot, readKey };
      },
      onError: (_error, _vars, onMutateResult, context) => {
        if (onMutateResult !== undefined && onMutateResult.readKey !== null) {
          context.client.setQueryData<TRead>(onMutateResult.readKey, onMutateResult.snapshot);
        }
      },
      onSettled: (_data, _error, vars) => {
        // ALWAYS reconcile (success or error) — the optimistic value is never trusted as final.
        invalidation.invalidateFilters(config.invalidates(trpc, vars));
      },
    });

    return {
      mutate: mutation.mutate,
      mutateAsync: mutation.mutateAsync,
      isPending: mutation.isPending,
      pendingVariables: mutation.isPending ? mutation.variables : undefined,
      error: mutation.error,
      clearError: mutation.reset,
      retry: (): void => {
        if (mutation.isError && mutation.variables !== undefined) {
          mutation.mutate(mutation.variables);
        }
      },
    };
  };
}
