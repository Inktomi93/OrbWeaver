// The one mutation factory — every create/update/delete goes through it, never an inline
// useMutation + loose cache surgery (the `client-cache-surgery-only-in-data` gate makes that
// physics: an imperative QueryClient call outside data/ is RED, so a cache need lands HERE). Bakes
// the 4-phase cache-flavor optimistic recipe (cancelQueries → snapshot → setQueryData →
// return-rollback; a per-query mutation token, not cache object identity, owns rollback so structural
// sharing cannot let an older failure overwrite a newer write), the `echo` post-write read seed (a verb whose RESPONSE is the authoritative row
// for a read), a lightweight variables-render ghost-row mode free on every mutation, and one sticky
// error slot per mutation with explicit clearError(). Callback property order is
// onMutate → onError → onSuccess → onSettled (type-inference-sensitive).
//
// THREE outcome classes, not two (EDITSNAP-OK): resolved-and-committed · threw (`errorToast`) · RESOLVED AND
// REFUSED (`refusal`). The third is the one that goes silently wrong — see the `refusal` doc below.

import type { DefaultError, MutateOptions, QueryClient, QueryKey, UseMutationOptions } from "@tanstack/react-query";
import { hashKey, useMutation } from "@tanstack/react-query";
import { notify } from "#lib";
import type { InvalidateFilter, Invalidation } from "./invalidation.ts";
import type { Trpc } from "./trpc.ts";

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
  /**
   * The read key this write's OWN RESPONSE is authoritative for — seeded with the response on success
   * (never on error). For a verb that returns exactly the row a read serves (`updateUserSettingsSection`
   * → `getUserSettings`): a confirmed write is strictly newer knowledge than the snapshot it was computed
   * from, so the surface that renders that read must not wait on a refetch to stop showing the pre-write
   * value. Complements `busDriven` rather than competing with it (this is a cache SEED, not an
   * invalidate — the covering bus tick still arrives and confirms the same row, a structural no-op).
   * Distinct from `optimistic`, which writes the UNCONFIRMED intent before the server has agreed.
   */
  readonly echo?: (trpc: Trpc, vars: TVars) => QueryKey;
  /** Optional global-toast message on failure (rides mutation `meta` → MutationCache.onError). A function
   *  form may return `null` to suppress the toast for a specific error (e.g. a stale turn abort the bus
   *  surfaces its own notice for — see `isSilencedTurnAbort`). */
  readonly errorToast?: string | ((error: unknown) => string | null);
  /**
   * ERRORS-AS-DATA — the THIRD outcome class, beside "resolved" and "threw" (EDITSNAP-OK).
   *
   * A verb whose contract promises a LEGIBLE refusal (rpg's four hand doors return
   * `{ok:false, reason}` as DATA — "a bad path is errors-as-data, never a wire reject") resolves this
   * mutation NORMALLY: `errorToast` never fires, `mutation.error` stays null, `onError` never runs. So a
   * fire-and-forget `.mutate()` call site — which is every one of them, because the write is bus/invalidate
   * reconciled and nobody reads the return — drops the refusal on the floor. A five-plane scene write was
   * lost to one 41-character label exactly this way, with the panel showing no sign at all.
   *
   * Return the sentence to toast, or `null` when this result is not a refusal. Declared on the FACTORY,
   * not per call site: whether a verb can refuse-as-data is a property of the VERB, and putting it here is
   * what makes the sweep total instead of a checklist that rots as call sites are added.
   *
   * A refused write is NOT authoritative for any read, so it suppresses `echo`; `onSettled` still runs, so
   * an `invalidates` mutation repaints from the true server state (which is what un-does any optimistic
   * write — `onError` cannot roll it back, because nothing errored).
   */
  readonly refusal?: (data: TData) => string | null;
}

/**
 * The freshness source — a compile-time XOR: a mutation reconciles its post-write cache from exactly
 * one of two places (doing both is the double-invalidate storm). `busDriven: true` means the server
 * verb emits a covering bus event, so supplying `invalidates` is a type error (`never`). Otherwise
 * `invalidates` is required — the filters for keys no delivered bus event covers.
 */
type FreshnessSource<TVars, TData> =
  | { readonly busDriven: true; readonly invalidates?: never }
  | {
      readonly busDriven?: false;
      /**
       * Filters reconciled on settle (success AND error) — routed through the central seam.
       *
       * `data` is the SETTLED RESPONSE (`undefined` when the write threw), so a verb whose own answer says
       * NOTHING CHANGED can reconcile nothing: `chat.reapTemporaryChats` returns `{reaped}`, and a landing
       * that swept zero rows was invalidating the chats list anyway — a second full `listChats` round-trip
       * on every home visit, inside the boot window, for a list the server had just said was unaffected
       * (issue #188 P2-12). The error arm keeps the conservative reconcile: `undefined` is not evidence of
       * a no-op. A filter list that does not depend on the answer simply ignores the third argument.
       */
      readonly invalidates: (trpc: Trpc, vars: TVars, data: TData | undefined) => readonly InvalidateFilter[];
    };

export type EntityMutationConfig<TVars, TData, TRead = unknown> = EntityMutationBase<TVars, TData, TRead> & FreshnessSource<TVars, TData>;

/** A `busDriven` mutation reconciles via the bus, not itself — its settle invalidates nothing. */
const NO_INVALIDATION = (): readonly InvalidateFilter[] => [];

export interface EntityMutationResult<TVars, TData> {
  /** `options` forwards react-query's per-call `MutateOptions` — the callbacks run IN ADDITION to the
   *  factory's baked cache recipe + the global error toast (e.g. a call-site `onError` for the guided
   *  input-restore, F3). */
  readonly mutate: (vars: TVars, options?: MutateOptions<TData, DefaultError, TVars>) => void;
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
  readonly owner: OptimisticOwner | null;
}

interface OptimisticOwner {
  readonly queryHash: string;
  readonly token: symbol;
}

const optimisticOwners = new WeakMap<QueryClient, Map<string, symbol>>();

function claimOptimisticOwner(queryClient: QueryClient, readKey: QueryKey): OptimisticOwner {
  let owners = optimisticOwners.get(queryClient);
  if (owners === undefined) {
    owners = new Map();
    optimisticOwners.set(queryClient, owners);
  }
  const owner = { queryHash: hashKey(readKey), token: Symbol("optimistic-mutation") };
  owners.set(owner.queryHash, owner.token);
  return owner;
}

function ownsOptimisticRollback(queryClient: QueryClient, owner: OptimisticOwner): boolean {
  return optimisticOwners.get(queryClient)?.get(owner.queryHash) === owner.token;
}

function releaseOptimisticOwner(queryClient: QueryClient, owner: OptimisticOwner): void {
  const owners = optimisticOwners.get(queryClient);
  if (owners?.get(owner.queryHash) !== owner.token) {
    return;
  }
  owners.delete(owner.queryHash);
  if (owners.size === 0) {
    optimisticOwners.delete(queryClient);
  }
}

/** Build the mutation hook once at module scope; features call the returned hook. Deps (trpc +
 *  invalidation) arrive per-call so the factory itself stays import-pure. */
export function createEntityMutation<TVars, TData, TRead = unknown>(
  config: EntityMutationConfig<TVars, TData, TRead>,
): (deps: { trpc: Trpc; invalidation: Invalidation }) => EntityMutationResult<TVars, TData> {
  // biome-ignore lint/nursery/noComponentHookFactories: the D54 §13.1 editor-factory pattern — factories run at MODULE scope (const useDeleteCharacter = createEntityMutation(...)), so the returned hook has a stable identity (see forms/editor/create-saved-entity-form.ts).
  return function useEntityMutation({ trpc, invalidation }): EntityMutationResult<TVars, TData> {
    const mutation = useMutation<TData, DefaultError, TVars, OptimisticContext<TRead>>({
      ...config.options(trpc),
      ...(config.errorToast === undefined ? {} : { meta: { errorToast: config.errorToast } }),
      onMutate: async (vars, context): Promise<OptimisticContext<TRead>> => {
        if (config.optimistic === undefined) {
          return { snapshot: undefined, readKey: null, owner: null };
        }
        const readKey = config.optimistic.readKey(trpc, vars);
        // Cancel in-flight refetches so they can't clobber the optimistic write.
        await context.client.cancelQueries({ queryKey: readKey });
        const snapshot = context.client.getQueryData<TRead>(readKey);
        context.client.setQueryData<TRead>(readKey, (old) => (config.optimistic === undefined ? old : config.optimistic.update(old, vars)));
        // Claim only after the updater succeeds: an updater rejection has no write to own and must not
        // leave ownership metadata behind.
        const owner = claimOptimisticOwner(context.client, readKey);
        // Return the snapshot rather than close over it — rollback reads it from onError's arg, so
        // concurrent mutations each roll back their own.
        return { snapshot, readKey, owner };
      },
      onError: (_error, _vars, onMutateResult, context) => {
        if (onMutateResult === undefined || onMutateResult.readKey === null || onMutateResult.owner === null) {
          return;
        }
        // Object identity is not ownership: TanStack structural sharing can preserve an older reference
        // for a newer deep-equal success. The per-query token records which mutation wrote last.
        if (!ownsOptimisticRollback(context.client, onMutateResult.owner)) {
          return;
        }
        try {
          // Cold cache (no snapshot): the optimistic write created the entry, and v5 treats
          // setQueryData(key, undefined) as a no-op — remove it instead of leaving a phantom row.
          if (onMutateResult.snapshot === undefined) {
            context.client.removeQueries({ queryKey: onMutateResult.readKey });
          } else {
            context.client.setQueryData<TRead>(onMutateResult.readKey, onMutateResult.snapshot);
          }
        } finally {
          releaseOptimisticOwner(context.client, onMutateResult.owner);
        }
      },
      onSuccess: (data, vars, onMutateResult, context) => {
        if (onMutateResult.owner !== null) {
          releaseOptimisticOwner(context.client, onMutateResult.owner);
        }
        // The errors-as-data arm runs FIRST: a refusal resolved, so this is the only callback that will ever
        // see it, and a refused write must not seed a read as if it had committed.
        const refusal = config.refusal?.(data) ?? null;
        if (refusal !== null) {
          notify.error(refusal);
          return;
        }
        if (config.echo === undefined) {
          return;
        }
        // Runs BEFORE the mutateAsync promise resolves (v5 awaits the callbacks in the execution chain), so
        // a caller awaiting the save sees the seeded read, not the pre-write one.
        context.client.setQueryData<TData>(config.echo(trpc, vars), data);
      },
      onSettled: (data, _error, vars) => {
        // Always reconcile — the optimistic value is never trusted as final. The settled response rides
        // along so a no-op write can decline the refetch it does not need (see `invalidates`).
        const invalidates = config.invalidates ?? NO_INVALIDATION;
        invalidation.invalidateFilters(invalidates(trpc, vars, data));
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
