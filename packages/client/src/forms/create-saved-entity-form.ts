// Button-gated editor form factory. Seeds defaultValues once from serverValues at mount, re-baselines
// via reset(saved) in an effect after submit (never inside onSubmit), and reseeds an untouched form on
// a fresh serverValues identity. Optional `draft` param mirrors edits to a crash-survival store.

import type { UpdateMetaOptions } from "@tanstack/react-form";
import { revalidateLogic } from "@tanstack/react-form";
import { useEffect, useRef, useState } from "react";
import type { EntityDraftStore } from "#state";
import { DEFAULT_DEBOUNCE_MS, focusFirstInvalidField, mirrorDraft, readDraftSeed } from "./entity-form-base";
import type { AppFormOptions } from "./use-app-form";
import { useAppForm } from "./use-app-form";

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
  /**
   * Crash-survival mirror, for long-form editors whose fields carry authored text a crash/reload
   * must not lose. The draft never seeds `defaultValues` (mount seed stays server-only); a surviving
   * draft is promoted after mount as a user-intent write so the dirty pill lights honestly. Cleared
   * on confirmed save and on `discard()`. Omit = original behavior (no listener, no mirror).
   */
  readonly draft?: EntityDraftStore<TValues>;
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
  // biome-ignore lint/nursery/noComponentHookFactories: the D54 §13.1 editor-factory pattern — factories run at MODULE scope (const useCharacterForm = createSavedEntityForm(...)), so the returned hook has a stable identity the Compiler can analyze; a per-render creation is what the rule fears and cannot happen here.
  // biome-ignore lint/nursery/useExplicitReturnType: inference-carried (see the factory header).
  return function useSavedEntityForm({ entityId, serverValues, save: callTimeSave }: SavedEntityFormArgs<TValues>) {
    const save = callTimeSave ?? config.save;

    // Draft read is a plain store read (not a subscription), promoted after mount, never merged into
    // the seed — the mount seed stays server-only so isDefaultValue tracks server truth.
    const draftSeed = readDraftSeed(config.draft, entityId);

    // onSubmit stores the saved row + bumps the tick; the effect below re-baselines outside the submit
    // path (isSubmitSuccessful alone can't carry the saved value).
    const savedRef = useRef<TValues | null>(null);
    const [saveTick, setSaveTick] = useState(0);

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
        const saved = await save(value);
        savedRef.current = saved;
        setSaveTick((t) => t + 1);
        config.draft?.clearDraft(entityId);
      },
      onSubmitInvalid: focusFirstInvalidField,
      ...(config.draft === undefined
        ? {}
        : {
            listeners: {
              onChange: ({ formApi }: { formApi: { state: { values: TValues; isDefaultValue: boolean } } }): void => {
                if (!formApi.state.isDefaultValue) {
                  mirrorDraft(config.draft, entityId, formApi.state.values);
                }
              },
              onChangeDebounceMs: DEFAULT_DEBOUNCE_MS,
            },
          }),
    });

    useEffect(() => {
      if (saveTick > 0 && savedRef.current !== null) {
        form.reset(savedRef.current);
      }
    }, [saveTick, form]);

    // Promote a surviving draft after mount as a user-intent write so isDefaultValue flips and the
    // pill lights. draftSeededRef makes this mount-once: draftSeed's identity flips the moment the
    // debounced listener mirrors an edit, which would otherwise re-trigger this effect and clobber the
    // live edit with the original draft on the next host re-render.
    const draftSeedRef = useRef(draftSeed);
    const draftSeededRef = useRef(false);
    useEffect(() => {
      if (draftSeededRef.current) {
        return;
      }
      draftSeededRef.current = true;
      if (draftSeed !== undefined && draftSeedRef.current !== undefined) {
        for (const [name, value] of Object.entries(draftSeedRef.current)) {
          // @orb-gate-ignore no-loose-id-cast not a branded-id cast — `name`/`value` are a draft field key + its value erased to `never` at this loose public boundary (see promote()).
          form.setFieldValue(name as never, value as never);
        }
      }
    }, [draftSeed, form]);

    // Flush the debounced mirror synchronously on unmount so a fast entity-switch (key={mountKey})
    // can't drop an in-flight edit before the debounce fires. Guarded on !isDefaultValue so a clean
    // form flushes nothing.
    useEffect(() => {
      if (config.draft === undefined) {
        return;
      }
      return (): void => {
        if (!form.state.isDefaultValue) {
          mirrorDraft(config.draft, entityId, form.state.values);
        }
      };
    }, [entityId, form]);

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
        // @orb-gate-ignore no-loose-id-cast not a branded-id cast — `name`/`value` are an arbitrary DeepKeys path + its value, erased to `never` ONLY to satisfy setFieldValue's generic `TField extends DeepKeys<TFormData>` at this loose public boundary (see header).
        form.setFieldValue(name as never, value as never, {
          dontUpdateMeta: true,
        } satisfies UpdateMetaOptions);
      },
      discard: (): void => {
        form.reset();
        config.draft?.clearDraft(entityId);
      },
    };
  };
}
