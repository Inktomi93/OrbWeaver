// The one mutation factory — every create/update/delete goes through it, never an inline
// useMutation + loose cache surgery. Bakes the 4-phase cache-flavor optimistic recipe (cancelQueries
// → snapshot → setQueryData → return-rollback; onError restores from the returned context so
// concurrent mutations each roll back their own snapshot), a lightweight variables-render ghost-row
// mode free on every mutation, and one sticky error slot per mutation with explicit clearError().
// Callback property order is onMutate → onError → onSettled (type-inference-sensitive).

import type { DefaultError, QueryKey, UseMutationOptions } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import type { InvalidateFilter, Invalidation } from "./invalidation";
import type { Trpc } from "./trpc";

/** What the tRPC proxy's `.mutationOptions()` provides — derived off the real `UseMutationOptions`
 *  so a rename/reshape breaks here at compile time, not silently at a consumer. */
type BaseMutationOptions<TVars, TData, TError = DefaultError> = Required<Pick<UseMutationOptions<TData, TError, TVars>, "mutationKey">> &
  Pick<UseMutationOptions<TData, TError, TVars>, "mutationFn">;

interface EntityMutationBase<TVars, TData, TRead> {
  /** `(t) => t.character.update.mutationOptions()` — the proxy is the one mutationKey/Fn source. */
  readonly options: (trpc: Trpc) => BaseMutationOptions<TVars, TData>;
  /** Cache-flavor optimistic update — use when multiple readers must reflect the change instantly;
   *  omit for the cheaper variables-render ghost-row mode (append-only creates). */
  readonly optimistic?: {
    readonly readKey: (trpc: Trpc, vars: TVars) => QueryKey;
    readonly update: (old: TRead | undefined, vars: TVars) => TRead | undefined;
  };
  /** Optional global-toast message on failure (rides mutation `meta` → MutationCache.onError). */
  readonly errorToast?: string | ((error: unknown) => string);
}

/**
 * The freshness source — a compile-time XOR: a mutation reconciles its post-write cache from exactly
 * one of two places (doing both is the double-invalidate storm). `busDriven: true` means the server
 * verb emits a covering bus event, so supplying `invalidates` is a type error (`never`). Otherwise
 * `invalidates` is required — the filters for keys no delivered bus event covers.
 */
type FreshnessSource<TVars> =
  | { readonly busDriven: true; readonly invalidates?: never }
  | {
      readonly busDriven?: false;
      /** Filters reconciled on settle (success AND error) — routed through the central seam. */
      readonly invalidates: (trpc: Trpc, vars: TVars) => readonly InvalidateFilter[];
    };

export type EntityMutationConfig<TVars, TData, TRead = unknown> = EntityMutationBase<TVars, TData, TRead> & FreshnessSource<TVars>;

/** A `busDriven` mutation reconciles via the bus, not itself — its settle invalidates nothing. */
const NO_INVALIDATION = (): readonly InvalidateFilter[] => [];

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

/** Build the mutation hook once at module scope; features call the returned hook. Deps (trpc +
 *  invalidation) arrive per-call so the factory itself stays import-pure. */
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
        // Cancel in-flight refetches so they can't clobber the optimistic write.
        await context.client.cancelQueries({ queryKey: readKey });
        const snapshot = context.client.getQueryData<TRead>(readKey);
        context.client.setQueryData<TRead>(readKey, (old) => (config.optimistic === undefined ? old : config.optimistic.update(old, vars)));
        // Return the snapshot rather than close over it — rollback reads it from onError's arg, so
        // concurrent mutations each roll back their own.
        return { snapshot, readKey };
      },
      onError: (_error, _vars, onMutateResult, context) => {
        if (onMutateResult === undefined || onMutateResult.readKey === null) {
          return;
        }
        // Cold cache (no snapshot): the optimistic write created the entry, and v5 treats
        // setQueryData(key, undefined) as a no-op — remove it instead of leaving a phantom row.
        if (onMutateResult.snapshot === undefined) {
          context.client.removeQueries({ queryKey: onMutateResult.readKey });
        } else {
          context.client.setQueryData<TRead>(onMutateResult.readKey, onMutateResult.snapshot);
        }
      },
      onSettled: (_data, _error, vars) => {
        // Always reconcile — the optimistic value is never trusted as final.
        const invalidates = config.invalidates ?? NO_INVALIDATION;
        invalidation.invalidateFilters(invalidates(trpc, vars));
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
