// `createAutosaveEntityForm` (UI-Primitives §13.4 — the listener-debounced editor factory:
// world-info entries, room overrides, settings panels — "flip it and it saves"). Built on the
// docs' OWN autosave backbone (UI-Lib-TanStack-Form.md §"Listeners": form-level `listeners.
// onChange` + `onChangeDebounceMs`; the docs' example IS autosave) plus the two factory-original
// belts:
//   • `reset` is REMOVED from the returned surface's type — calling reset(value) re-baselines
//     defaults, which on a live draft mirror is the autosave infinite loop (UI-Gates §7 row 2;
//     gate `no-form-reset-in-autosave` is thereby compile-time here).
//   • the Zustand-persist DRAFT MIRROR (obligation 5): every debounced change also lands in a
//     `createEntityDraftStore` slot, so a crash/refresh restores the unsaved edit; the mirror
//     seeds OVER the server row at mount and clears on a confirmed save.
//   • `onFieldUnmount` flush — the documented-but-unprosed hook (reference-only; no guide
//     exercises it): a field unmounting mid-debounce flushes its pending value.
//
// Two more adopts from the full-docs mine (UI-Lib-TanStack-Form.md §E.6/§E.11), the same as the
// saved-entity factory: `validationLogic: revalidateLogic()` as the default validation seam
// (inert unless a config supplies `onDynamic`; overridable via `config.options`), and an
// `onSubmitInvalid` focus-first-error belt (harmless here — the listener only ever calls
// `handleSubmit()` once `isValid`, so an invalid submit is rare, but a consumer that DOES ever
// drive an explicit submit still gets the a11y behavior for free).

import { revalidateLogic } from "@tanstack/react-form";
import { useEffect, useRef } from "react";
import type { EntityDraftStore } from "#state";
import type { AppFormInstance, AppFormOptions } from "./use-app-form";
import { useAppForm } from "./use-app-form";

const DEFAULT_DEBOUNCE_MS = 500;

export interface AutosaveEntityFormConfig<TValues extends object> {
  readonly defaultValues: TValues;
  /**
   * Persist the values (fire-and-forget from the listener; failures surface via the caller's channel).
   *
   * OPTIONAL because a factory runs at MODULE scope (stable hook identity, §13.1) where the runtime
   * tRPC client — a React-context value — is not reachable; a surface whose `save` must close over the
   * live client supplies it at CALL time via `AutosaveEntityFormArgs.save` instead (which WINS). This
   * mirrors `createEntityMutation`, whose client also arrives per-call (`useX({ trpc })`), never baked
   * into the module-scope config. Supply save at exactly ONE of the two seams; the call-time one wins.
   */
  readonly save?: (values: TValues) => Promise<unknown>;
  /** The crash-survival mirror (obligation 5). Omit ONLY for genuinely ephemeral panels. */
  readonly draft?: EntityDraftStore<TValues>;
  /** @defaultValue 500 */
  readonly debounceMs?: number;
  /**
   * Extra `useAppForm` options (validators etc.) spread verbatim. Derived from the REAL hook
   * options (never a hand-restated bag): a typo'd key is now a compile error, not a silent no-op.
   */
  readonly options?: Partial<Omit<AppFormOptions<TValues>, "defaultValues" | "onSubmit">>;
}

export interface AutosaveEntityFormArgs<TValues extends object> {
  readonly entityId: string;
  readonly serverValues: TValues | undefined;
  /**
   * The persist fn — supplied at CALL time so it can close over the live tRPC client the surface holds
   * via `useTRPCClient()`/a `createEntityMutation` hook (a module-scope `config.save` cannot reach
   * React context). WINS over `config.save` when both are present. Must be referentially stable across
   * the mount (it is captured once, in `onSubmit`) — a client-bound closure or a mutation's
   * `mutateAsync` satisfies this; the app-lifetime client makes identity churn harmless anyway.
   */
  readonly save?: (values: TValues) => Promise<unknown>;
}

/**
 * The autosave form surface — everything the AppForm exposes MINUS `reset` (see the header). Pinned
 * to the SAME `AppFormInstance<TValues>` instantiation `form` is actually built from (a bare
 * `ReturnType<typeof useAppForm>` — no type args — independently defaults every trailing generic and
 * can silently stop structurally matching, which is exactly what surfaced when `config.options`
 * moved off `Record<string, unknown>` onto the real, richer `AppFormOptions<TValues>`).
 */
type AutosaveForm<TValues extends object> = Omit<AppFormInstance<TValues>, "reset">;

export function createAutosaveEntityForm<TValues extends object>(
  config: AutosaveEntityFormConfig<TValues>,
): (args: AutosaveEntityFormArgs<TValues>) => {
  form: AutosaveForm<TValues>;
  /** Spread as `key={mountKey}` — id change remounts + reseeds (same rule as the saved factory). */
  mountKey: string;
} {
  // biome-ignore lint/nursery/noComponentHookFactories: the D54 §13.1 editor-factory pattern — module-scope factory call sites give the returned hook a stable identity (see create-saved-entity-form.ts).
  return function useAutosaveEntityForm({
    entityId,
    serverValues,
    save: callTimeSave,
  }: AutosaveEntityFormArgs<TValues>) {
    // The persist fn: the call-time `save` (client-bound; the surface's seam) WINS over the
    // module-scope `config.save`. Exactly one is expected; if neither is supplied the form is
    // read-only (no persist) — a legal "genuinely ephemeral panel" shape, never a throw.
    const save = callTimeSave ?? config.save;
    // Seed order (obligation 5): defaults ← server row ← surviving draft (the draft is the user's
    // newest unsaved intent; it wins over the server row it was edited from).
    const draftSeed = config.draft?.readDraft(entityId);
    const seedRef = useRef<TValues>({
      ...config.defaultValues,
      ...serverValues,
      ...draftSeed,
    });

    const form = useAppForm({
      validationLogic: revalidateLogic(), // submit-then-live seam; overridable via config.options
      ...config.options,
      defaultValues: seedRef.current,
      onSubmit: async ({ value }: { value: TValues }) => {
        await save?.(value);
        // A confirmed save makes the mirror redundant — clear it so a later crash doesn't
        // resurrect a stale draft over fresher server truth.
        config.draft?.clearDraft(entityId);
      },
      onSubmitInvalid: (): void => {
        // Focus-first-error — the library ships none by design. `@orb/ui/field` stamps real
        // aria-invalid="true" on the native control (never a wrapper div), so this finds it.
        // biome-ignore lint/security/noSecrets: false positive — an aria-attribute CSS selector, not a credential.
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      },
      listeners: {
        // The docs' own autosave recipe: mirror to the draft store, then submit-if-valid.
        // NOTE (audit tier-3, evaluated + deferred): the real per-callback param type is
        // form-core's `FormListenersPropsField<TFormData, TOnMount, ..., TSubmitMeta>` — but it is
        // NOT exported from `@tanstack/form-core`/`@tanstack/react-form` (only the outer
        // `FormListeners<...>` container is). Deriving it honestly would mean threading the full
        // 11-generic validator chain through `AutosaveEntityFormConfig<TValues>` (today collapsed
        // into the single `options` bag) — a public-shape change, not a same-shape tightening. The
        // hand-narrowed shape below is self-checking (a real API shift breaks the call site), so
        // it's left as-is rather than risking a wrong "clean swap."
        onChange: ({
          formApi,
        }: {
          formApi: {
            state: { values: TValues; isValid: boolean };
            handleSubmit: () => Promise<void>;
          };
        }) => {
          config.draft?.setDraft(entityId, formApi.state.values);
          if (formApi.state.isValid) {
            void formApi.handleSubmit();
          }
        },
        onChangeDebounceMs: config.debounceMs ?? DEFAULT_DEBOUNCE_MS,
        // A field unmounting mid-debounce flushes its pending edit (the unprosed reference hook).
        onFieldUnmount: ({
          formApi,
        }: {
          formApi: { state: { isValid: boolean }; handleSubmit: () => Promise<void> };
        }) => {
          if (formApi.state.isValid) {
            void formApi.handleSubmit();
          }
        },
      },
    });

    // Belt for the draft path: if a draft seeded this mount, mirror the full merged seed back
    // ONCE so a crash BEFORE the first keystroke still holds the restored state.
    //
    // `seededRef` is load-bearing, not decoration: `draftSeed` is re-read every render (line ~55 is a
    // plain store READ, not a subscription), and its identity FLIPS the moment the debounced onChange
    // writes an edit into the same slot. Without the guard, the next host re-render (a background
    // refetch handing `serverValues` a fresh identity is the common trigger) re-runs this effect and
    // writes the fixed mount `seedRef.current` back OVER the user's live edit — reverting the
    // crash-survival mirror exactly when it matters (an invalid in-progress edit never submits, so
    // `clearDraft` never runs to mask it). The guard makes the write genuinely mount-once; `mountKey`
    // (= entityId) remounts the hook on id change, so the ref resets per entity. exhaustive-deps stays
    // green (deps unchanged; the guard short-circuits the body).
    const seededRef = useRef(false);
    useEffect(() => {
      if (seededRef.current) {
        return;
      }
      seededRef.current = true;
      if (draftSeed !== undefined) {
        config.draft?.setDraft(entityId, seedRef.current);
      }
    }, [entityId, draftSeed]);

    // The compile-time `no-form-reset-in-autosave`: reset is structurally absent from the type.
    return { form: form as AutosaveForm<TValues>, mountKey: entityId };
  };
}
