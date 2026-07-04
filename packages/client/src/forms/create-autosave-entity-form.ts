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

import { useEffect, useRef } from "react";
import type { EntityDraftStore } from "#state";
import { useAppForm } from "./use-app-form";

const DEFAULT_DEBOUNCE_MS = 500;

export interface AutosaveEntityFormConfig<TValues extends object> {
  readonly defaultValues: TValues;
  /** Persist the values (fire-and-forget from the listener; failures surface via the caller's channel). */
  readonly save: (values: TValues) => Promise<unknown>;
  /** The crash-survival mirror (obligation 5). Omit ONLY for genuinely ephemeral panels. */
  readonly draft?: EntityDraftStore<TValues>;
  /** @defaultValue 500 */
  readonly debounceMs?: number;
  /** Extra `useAppForm` options (validators etc.) spread verbatim. */
  readonly options?: Record<string, unknown>;
}

export interface AutosaveEntityFormArgs<TValues extends object> {
  readonly entityId: string;
  readonly serverValues: TValues | undefined;
}

/** The autosave form surface — everything the AppForm exposes MINUS `reset` (see the header). */
type AutosaveForm = Omit<ReturnType<typeof useAppForm>, "reset">;

export function createAutosaveEntityForm<TValues extends object>(
  config: AutosaveEntityFormConfig<TValues>,
): (args: AutosaveEntityFormArgs<TValues>) => {
  form: AutosaveForm;
  /** Spread as `key={mountKey}` — id change remounts + reseeds (same rule as the saved factory). */
  mountKey: string;
} {
  // biome-ignore lint/nursery/noComponentHookFactories: the D54 §13.1 editor-factory pattern — module-scope factory call sites give the returned hook a stable identity (see create-saved-entity-form.ts).
  return function useAutosaveEntityForm({
    entityId,
    serverValues,
  }: AutosaveEntityFormArgs<TValues>) {
    // Seed order (obligation 5): defaults ← server row ← surviving draft (the draft is the user's
    // newest unsaved intent; it wins over the server row it was edited from).
    const draftSeed = config.draft?.readDraft(entityId);
    const seedRef = useRef<TValues>({
      ...config.defaultValues,
      ...serverValues,
      ...draftSeed,
    });

    const form = useAppForm({
      ...config.options,
      defaultValues: seedRef.current,
      onSubmit: async ({ value }: { value: TValues }) => {
        await config.save(value);
        // A confirmed save makes the mirror redundant — clear it so a later crash doesn't
        // resurrect a stale draft over fresher server truth.
        config.draft?.clearDraft(entityId);
      },
      listeners: {
        // The docs' own autosave recipe: mirror to the draft store, then submit-if-valid.
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

    // Belt for the draft path: if a draft seeded this mount, mirror it back immediately so a
    // crash BEFORE the first keystroke still holds the restored state.
    useEffect(() => {
      if (draftSeed !== undefined) {
        config.draft?.setDraft(entityId, seedRef.current);
      }
      // mount-only by design (seedRef is fixed for the mount; id change remounts via mountKey)
    }, [entityId, draftSeed]);

    // The compile-time `no-form-reset-in-autosave`: reset is structurally absent from the type.
    return { form: form as AutosaveForm, mountKey: entityId };
  };
}
