// Listener-debounced autosave form factory (world-info entries, room overrides, settings panels).
// `reset` is removed from the returned surface's type — calling it re-baselines defaults, which on a
// live draft mirror is an infinite loop.

import { revalidateLogic } from "@tanstack/react-form";
import { useEffect, useRef } from "react";
import type { EntityDraftStore } from "#state";
import { DEFAULT_DEBOUNCE_MS, focusFirstInvalidField, mirrorDraft, readDraftSeed } from "./entity-form-base";
import type { AppFormInstance, AppFormOptions } from "./use-app-form";
import { useAppForm } from "./use-app-form";

export interface AutosaveEntityFormConfig<TValues extends object> {
  readonly defaultValues: TValues;
  /**
   * Persist the values (fire-and-forget from the listener). Optional because a module-scope factory
   * can't reach the runtime tRPC client; a surface needing it supplies `save` at call time instead via
   * `AutosaveEntityFormArgs.save` (which wins). Supply save at exactly one of the two seams.
   */
  readonly save?: (values: TValues) => Promise<unknown>;
  /** The crash-survival mirror. Omit only for genuinely ephemeral panels. */
  readonly draft?: EntityDraftStore<TValues>;
  /** @defaultValue 500 */
  readonly debounceMs?: number;
  readonly options?: Partial<Omit<AppFormOptions<TValues>, "defaultValues" | "onSubmit">>;
}

export interface AutosaveEntityFormArgs<TValues extends object> {
  readonly entityId: string;
  readonly serverValues: TValues | undefined;
  /**
   * Call-time persist fn so it can close over the live tRPC client the surface holds. Wins over
   * `config.save`. Must be referentially stable across the mount (captured once in `onSubmit`).
   */
  readonly save?: (values: TValues) => Promise<unknown>;
}

/** The AppForm surface minus `reset`, pinned to the same instantiation `form` is built from (a bare
 *  `ReturnType<typeof useAppForm>` defaults its generics independently and can silently stop matching). */
type AutosaveForm<TValues extends object> = Omit<AppFormInstance<TValues>, "reset">;

export function createAutosaveEntityForm<TValues extends object>(
  config: AutosaveEntityFormConfig<TValues>,
): (args: AutosaveEntityFormArgs<TValues>) => {
  form: AutosaveForm<TValues>;
  /** Spread as `key={mountKey}` — id change remounts + reseeds. */
  mountKey: string;
} {
  // biome-ignore lint/nursery/noComponentHookFactories: the D54 §13.1 editor-factory pattern — module-scope factory call sites give the returned hook a stable identity (see create-saved-entity-form.ts).
  return function useAutosaveEntityForm({ entityId, serverValues, save: callTimeSave }: AutosaveEntityFormArgs<TValues>) {
    const save = callTimeSave ?? config.save;
    // Seed order: defaults ← server row ← surviving draft (the draft is the newest unsaved intent).
    const draftSeed = readDraftSeed(config.draft, entityId);
    const seedRef = useRef<TValues>({
      ...config.defaultValues,
      ...serverValues,
      ...draftSeed,
    });

    const form = useAppForm({
      validationLogic: revalidateLogic(),
      ...config.options,
      defaultValues: seedRef.current,
      onSubmit: async ({ value }: { value: TValues }) => {
        await save?.(value);
        config.draft?.clearDraft(entityId);
      },
      onSubmitInvalid: focusFirstInvalidField,
      listeners: {
        onChange: ({
          formApi,
        }: {
          formApi: {
            state: { values: TValues; isValid: boolean; isDefaultValue: boolean };
            handleSubmit: () => Promise<void>;
          };
        }) => {
          mirrorDraft(config.draft, entityId, formApi.state.values);
          // Save only a genuine change, never the untouched seed (isDefaultValue = matches seed now).
          if (formApi.state.isValid && !formApi.state.isDefaultValue) {
            // handleSubmit re-throws an onSubmit rejection; swallow it here — the injected save's own
            // errorToast surfaces the failure, and the draft mirror already holds the edit for retry.
            formApi.handleSubmit().catch(() => undefined);
          }
        },
        onChangeDebounceMs: config.debounceMs ?? DEFAULT_DEBOUNCE_MS,
        // A field unmounting flushes its pending edit — but only a real edit. Without the
        // !isDefaultValue guard, a field unmounting while still AT the seed (StrictMode's dev
        // double-invoke, or any tab-away before an edit) would autosave the untouched seed.
        onFieldUnmount: ({
          formApi,
        }: {
          formApi: {
            state: { isValid: boolean; isDefaultValue: boolean };
            handleSubmit: () => Promise<void>;
          };
        }) => {
          if (formApi.state.isValid && !formApi.state.isDefaultValue) {
            formApi.handleSubmit().catch(() => undefined);
          }
        },
      },
    });

    // If a draft seeded this mount, mirror the full merged seed back once so a crash before the first
    // keystroke still holds the restored state. seededRef guards against draftSeed's identity flipping
    // on a later re-render (the debounced onChange writes into the same slot), which would otherwise
    // re-run this effect and clobber the live edit with the stale mount seed.
    const seededRef = useRef(false);
    useEffect(() => {
      if (seededRef.current) {
        return;
      }
      seededRef.current = true;
      if (draftSeed !== undefined) {
        mirrorDraft(config.draft, entityId, seedRef.current);
      }
    }, [entityId, draftSeed]);

    return { form: form as AutosaveForm<TValues>, mountKey: entityId };
  };
}
