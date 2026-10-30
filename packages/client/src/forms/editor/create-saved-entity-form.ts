// Button-gated editor form factory. Seeds defaultValues once from serverValues at mount, re-baselines
// via reset(saved) in an effect after submit (never inside onSubmit), and reseeds an untouched form on
// a fresh serverValues identity. It persists nothing: a half-typed create or credential never reaches storage.

import type { UpdateMetaOptions } from "@tanstack/react-form";
import { revalidateLogic } from "@tanstack/react-form";
import { useEffect, useRef, useState } from "react";
import { focusFirstInvalidField } from "./focus-invalid-field.ts";
import type { AppFormOptions } from "./use-app-form.ts";
import { useAppForm } from "./use-app-form.ts";

/** The authored per-entity config — `formOptions()`-shaped. */
export interface SavedEntityFormConfig<TValues extends object> {
  /** Fallback defaults for a CREATE (no server row yet). */
  readonly defaultValues: TValues;
  /**
   * Persist the values; resolves to the saved row (the re-baseline source). Optional because a
   * module-scope save can't close over runtime context (tRPC client / entity id) — the surface
   * supplies it at call time via `SavedEntityFormArgs.save` instead (which wins).
   *
   * Receives the FULL `TValues` — this factory does not diff to changed keys. A consumer needing
   * per-field clear semantics must project at its own save seam (see `characterUpdateDiff`).
   */
  readonly save?: (values: TValues) => Promise<TValues>;
  /** Extra `useAppForm` options (validators etc.) spread verbatim. */
  readonly options?: Partial<Omit<AppFormOptions<TValues>, "defaultValues" | "onSubmit">>;
}

export interface SavedEntityFormArgs<TValues extends object> {
  /** Keys the remount + names the entity for diagnostics. */
  readonly entityId: string;
  /** The server row (undefined while loading / for a create). */
  readonly serverValues: TValues | undefined;
  /** Call-time persist fn; wins over `config.save`. Resolves to the saved row. */
  readonly save?: (values: TValues) => Promise<TValues>;
}

// Return type is inference-carried: the AppForm instance is a 20+-generic TanStack type that can't
// be truthfully re-spelled by hand.
export function createSavedEntityForm<TValues extends object>(config: SavedEntityFormConfig<TValues>) {
  // biome-ignore lint/correctness/noComponentHookFactories: the D54 §13.1 editor-factory pattern — factories run at MODULE scope (const useCharacterForm = createSavedEntityForm(...)), so the returned hook has a stable identity the Compiler can analyze; a per-render creation is what the rule fears and cannot happen here.
  // biome-ignore lint/nursery/useExplicitReturnType: inference-carried (see the factory header).
  return function useSavedEntityForm({ entityId, serverValues, save: callTimeSave }: SavedEntityFormArgs<TValues>) {
    const save = callTimeSave ?? config.save;

    // onSubmit stores the saved row + bumps the tick; the effect below re-baselines outside the submit
    // path (isSubmitSuccessful alone can't carry the saved value).
    const savedRef = useRef<TValues | null>(null);
    const [saveTick, setSaveTick] = useState(0);
    /**
     * WHICH SUBMISSION IS ALLOWED TO RE-BASELINE (#1503).
     *
     * The re-baseline is `form.reset(savedRef.current)` — it OVERWRITES every field with a server row. A
     * bare `savedRef` makes that "whichever save resolved last", which is not the same as "the last save
     * the user made": two submissions in flight (a double-press the disabled state did not catch, a retry
     * over a slow first attempt) resolve in network order, so an OLDER row could land last and reset the
     * form back onto values the user had already replaced — silent, and indistinguishable from the save
     * having worked. The epoch makes the rule explicit: a submission that has been superseded resolves
     * quietly and writes nothing.
     */
    const submitEpoch = useRef(0);

    const form = useAppForm({
      validationLogic: revalidateLogic(),
      ...config.options,
      defaultValues: serverValues ?? config.defaultValues,
      onSubmit: async ({ value }: { value: TValues }) => {
        // FLAG[#58] parse-on-submit not wired: `value` is the form's input type; a Standard-Schema
        // transform's output is not applied here.
        if (save === undefined) {
          throw new Error("createSavedEntityForm: no save function supplied (neither config.save nor a call-time save)");
        }
        const epoch = submitEpoch.current + 1;
        submitEpoch.current = epoch;
        const saved = await save(value);
        if (submitEpoch.current !== epoch) {
          return; // a later submission owns this form now — see `submitEpoch`
        }
        savedRef.current = saved;
        setSaveTick((t) => t + 1);
      },
      onSubmitInvalid: focusFirstInvalidField,
    });

    useEffect(() => {
      if (saveTick > 0 && savedRef.current !== null) {
        form.reset(savedRef.current);
      }
    }, [saveTick, form]);

    // Reseed guard: a fresh serverValues identity reseeds only an untouched form.
    const seededRef = useRef<TValues | undefined>(serverValues);
    useEffect(() => {
      if (serverValues !== undefined && seededRef.current !== serverValues && !form.state.isDirty) {
        form.reset(serverValues);
        seededRef.current = serverValues;
      }
    }, [serverValues, form]);

    return {
      form,
      mountKey: entityId,
      promote: (name: string, value: unknown): void => {
        // Not a branded-id cast: the path and its value are erased to `never` only to satisfy setFieldValue's `TField extends DeepKeys<TFormData>` generic at this loose public boundary. Ends when promote() takes a typed DeepKeys<TValues> instead of `string`.
        form.setFieldValue(name as never, value as never, {
          dontUpdateMeta: true,
        } satisfies UpdateMetaOptions);
      },
      discard: (): void => {
        form.reset();
      },
    };
  };
}
