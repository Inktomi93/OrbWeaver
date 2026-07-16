// Listener-debounced autosave form factory (world-info entries, room overrides, settings panels).
// `reset` is removed from the returned surface's type — calling it re-baselines defaults, which on a
// live draft mirror is an infinite loop.

import { revalidateLogic } from "@tanstack/react-form";
import { useEffect, useRef, useState } from "react";
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

/** The autosave lifecycle the shared `AutosaveStatus` affordance renders (north-star §7 / D66 A4). */
const AUTOSAVE_SAVE_STATES = ["saved", "saving", "error"] as const;
export type AutosaveSaveState = (typeof AUTOSAVE_SAVE_STATES)[number];

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
  /**
   * Spread as `key={mountKey}` on the component that CALLS this hook (the hook-OWNING component), NOT on
   * a `<form>`/`<Stack>` below it. The FormApi lives in this hook's `useState`; a `key` on a descendant
   * DOM node remounts only that DOM and the surviving FormApi keeps the OLD entity's frozen seed —
   * switching entity then renders the previous entity's values and one keystroke persists them into the
   * newly-selected row (stickler review 2026-07-16-merge-block-28523122). Key the hook owner and the
   * whole form identity dies + is reborn (character-editor-surface.tsx keys `CharacterEditorBody`).
   */
  mountKey: string;
  /** The live save lifecycle for `AutosaveStatus` (Saved / Saving… / Save failed — retry). */
  saveState: AutosaveSaveState;
  /** Re-run the pending save (the AutosaveStatus retry affordance); bypasses the onChange dirty guard. */
  retrySave: () => void;
  /**
   * Arm the teardown-flush suppression before a DELIBERATE same-identity reseed remount (reset-to-
   * default). A keyed remount tears the form down field-by-field, and each field's unmount fires the
   * `onFieldUnmount` flush — which on a dirty form would `handleSubmit` the PRE-reset values right back
   * over the freshly-reset row (a durable no-op reset). Call this immediately before bumping the remount
   * key so the outgoing instance's field unmounts skip the flush. Switching to a DIFFERENT entity needs
   * no call: that flush is bound to the OUTGOING entity's `save` closure, so it can only write the old
   * row (never the newly-selected one).
   */
  closeForReseed: () => void;
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

    // Armed by `closeForReseed()` right before a same-identity reseed remount (reset-to-default) so the
    // outgoing instance's field-unmount flushes are skipped — otherwise they re-persist the pre-reset
    // values over the fresh row (stickler review 2026-07-16-merge-block-28523122).
    const closingRef = useRef(false);

    // The save lifecycle the AutosaveStatus affordance renders. Starts "saved" — an untouched mount is
    // in sync with the server row. onSubmit drives it: saving → saved, or → error (which lights retry).
    const [saveState, setSaveState] = useState<AutosaveSaveState>("saved");

    const form = useAppForm({
      validationLogic: revalidateLogic(),
      ...config.options,
      defaultValues: seedRef.current,
      onSubmit: async ({ value }: { value: TValues }) => {
        setSaveState("saving");
        try {
          await save?.(value);
          config.draft?.clearDraft(entityId);
          setSaveState("saved");
        } catch (error) {
          // Record the failed lifecycle for the retry affordance, then re-throw so the listener's own
          // `.catch` and the injected save's errorToast still run (and clearDraft is correctly skipped).
          setSaveState("error");
          throw error;
        }
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
        // double-invoke, or any tab-away before an edit) would autosave the untouched seed. And when the
        // whole form is torn down for a same-identity RESEED remount (reset-to-default), `closingRef`
        // skips the flush entirely — else the pre-reset values re-persist over the fresh row.
        onFieldUnmount: ({
          formApi,
        }: {
          formApi: {
            state: { isValid: boolean; isDefaultValue: boolean };
            handleSubmit: () => Promise<void>;
          };
        }) => {
          if (closingRef.current) {
            return;
          }
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

    const retrySave = (): void => {
      // Direct submit — bypasses the onChange !isDefaultValue guard so an explicit user retry always
      // re-attempts the held edit; the same swallow as the listener (the save's errorToast is the UI).
      form.handleSubmit().catch(() => undefined);
    };

    const closeForReseed = (): void => {
      closingRef.current = true;
    };

    return { form: form as AutosaveForm<TValues>, mountKey: entityId, saveState, retrySave, closeForReseed };
  };
}
