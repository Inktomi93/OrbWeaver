// `createSavedEntityForm` (UI-Primitives §13.4 — the button-gated editor factory). The SIX
// obligations neo leaked as remembered conventions (only 1 of 4 editors honored all; forgetting
// `reset(saved)` silently bricked the save bar with a green check — UI-Gates §11.0 rule 2) are
// BAKED here, verified against the full-docs mine (UI-Lib-TanStack-Form.md §C — footguns #1–#4/#6
// are FACTORY-ORIGINAL; no example or guide fixes them):
//   1. seed-on-load — `defaultValues` seed from `serverValues` at mount (the lib seeds ONCE;
//      `defaultValues` is not reactive).
//   2. `key`-remount on entity-id change — the returned `mountKey` MUST key the editor subtree
//      (the only clean way to re-seed a non-reactive `defaultValues`).
//   3. post-submit `reset(saved)` re-baseline — run in an EFFECT after submit resolution, NEVER
//      synchronously inside `onSubmit` (footgun #2: reset-inside-onSubmit can ignore new defaults).
//      `reset(value)` updates the defaults, re-arming the guard + clearing the pill.
//   4. the reseed guard — a background refetch reseeds the form ONLY when the user hasn't typed:
//      gate on persistent `isDirty` ("touched since seed" — exactly its documented semantic; the
//      pill uses `!isDefaultValue`, the guard uses `isDirty` — two flags, two jobs, NEVER unified).
//   6. `promote()` — mount-time non-user writes go through `setFieldValue(..., {dontUpdateMeta:
//      true})` so they don't flip dirty. The flag is TYPED-BUT-UNDOCUMENTED (patch-semver types):
//      it lives behind this one wrapper + a guard test, so a rename is a one-file fix. The options
//      bag is `satisfies UpdateMetaOptions` (the REAL exported type, not a hand-respelled inline
//      shape) — a rename/reshape of `dontUpdateMeta` breaks HERE at compile time, not silently.
// (Obligation 5 — the Zustand-persist draft mirror — is now OPTIONALLY this factory's too (shipped
// 2026-07-09; UI-Primitives §13.4 obligation-5 doctrine). A button-gated editor normally holds unsaved
// state in the form itself, but a LONG-FORM editor whose fields carry lots of authored text (the
// character card editor is the founding consumer) passes a `draft` store so a crash/reload survives.
// The dirty-pill honesty is the whole point: the form seeds from the SERVER row ONLY (the draft NEVER
// touches `defaultValues`, so `isDefaultValue` still compares against server truth); a surviving draft
// is instead PROMOTED after mount as USER-intent writes (setFieldValue WITHOUT dontUpdateMeta) so
// `!isDefaultValue` flips and the save-bar pill LIGHTS — a restored draft that looked "clean" is a lie
// that loses the work on the next navigation. A `draftSeededRef` makes the promotion mount-once so a
// background refetch re-render can't re-apply it (the same trap the autosave factory's `seededRef`
// guards). A debounced form-level listener mirrors every real change (skipping the untouched seed so an
// open never mints a draft); the mirror clears on a confirmed save AND on explicit `discard()`. The
// debounce is FLUSHED synchronously on hook unmount (an `!isDefaultValue`-guarded cleanup writes the
// latest values immediately) so a switch-triggered remount can't drop an in-flight edit before the
// debounce fires — the §6.5 "loses nothing" guarantee; a clean form flushes nothing. No `draft`
// supplied = byte-identical to the original button-gated behavior — every existing consumer is untouched.)
//
// The persist fn (`save`) has TWO seams, exactly mirroring `createAutosaveEntityForm`: a module-scope
// `config.save` for editors whose save needs nothing beyond `TValues`, and a CALL-time
// `SavedEntityFormArgs.save` (WINS) for editors whose save must close over the live tRPC client + an
// entity id neither reachable at module scope (e.g. the theme editor's `updateTheme.mutateAsync`).
//
// Two more adopts from the full-docs mine (UI-Lib-TanStack-Form.md §E.6/§E.11), baked as defaults
// every consumer inherits for free:
//   • `validationLogic: revalidateLogic()` — the editor-friendly default validation seam
//     (validate-on-submit, then live on-change after the first submit); inert unless a config
//     supplies an `onDynamic` validator, and overridable via `config.options` (spread BEFORE it).
//   • `onSubmitInvalid` focus-first-error — the library ships none by design (philosophy.md); the
//     `@orb/ui/field` primitive already stamps real `aria-invalid="true"` on the native control via
//     Base UI's Field.Control, so the documented `querySelector('[aria-invalid="true"]')` recipe
//     finds the actual control, not a wrapper div.

import type { UpdateMetaOptions } from "@tanstack/react-form";
import { revalidateLogic } from "@tanstack/react-form";
import { useEffect, useRef, useState } from "react";
import type { EntityDraftStore } from "#state";
import type { AppFormOptions } from "./use-app-form";
import { useAppForm } from "./use-app-form";

const DEFAULT_DEBOUNCE_MS = 500;

/** The authored per-entity config — `formOptions()`-shaped (the one home for defaults+validators). */
export interface SavedEntityFormConfig<TValues extends object> {
  /** Fallback defaults for a CREATE (no server row yet). */
  readonly defaultValues: TValues;
  /**
   * Persist the values; RESOLVES to the saved row (the re-baseline source). OPTIONAL because a
   * factory runs at MODULE scope (stable hook identity, §13.1) where a save that needs the runtime
   * tRPC client + an entity id (a React-context value + a route/call param, neither reachable at
   * module scope) can't be baked here — the surface supplies it at CALL time via
   * `SavedEntityFormArgs.save` instead (which WINS). Mirrors `createAutosaveEntityForm`'s identical
   * call-time seam (create-autosave-entity-form.ts) — the same problem, the same fix.
   *
   * `save` receives the FULL `TValues` — this factory does NOT diff to changed keys. A consumer whose
   * wire wants "only changed keys" (`null`=clear vs omit=unchanged; the per-field clear semantic the
   * factory can't know) must project at ITS OWN save seam. Reference impl: `characterUpdateDiff`
   * (features/character/lib/character-card-form-model.ts), wired at character-editor-surface.tsx.
   * (FINAL-Character §2, amended 2026-07-10 — the diff is the surface's job, not the factory's.)
   */
  readonly save?: (values: TValues) => Promise<TValues>;
  /**
   * The crash-survival mirror (obligation 5) — OPTIONAL, for LONG-FORM button-gated editors whose
   * fields carry authored text a crash/reload must not lose (the character card editor is the founding
   * consumer). Unlike `createAutosaveEntityForm` the draft NEVER seeds `defaultValues`: the mount seed
   * stays `defaults ← serverValues` ONLY, so `isDefaultValue` compares against SERVER truth. A surviving
   * draft is instead PROMOTED after mount as user-intent writes so `!isDefaultValue` lights the pill
   * honestly (a restored draft that looks clean loses the work on the next navigation). Cleared on a
   * confirmed save and on `discard()`. Omit = byte-identical original behavior (no listener, no mirror).
   */
  readonly draft?: EntityDraftStore<TValues>;
  /**
   * Extra `useAppForm` options (validators etc.) spread verbatim — authored at the call site.
   * Derived from the REAL hook options (never a hand-restated bag): a typo'd key (e.g.
   * `validaters`) is now a compile error instead of a silently-swallowed no-op.
   */
  readonly options?: Partial<Omit<AppFormOptions<TValues>, "defaultValues" | "onSubmit">>;
}

export interface SavedEntityFormArgs<TValues extends object> {
  /** Keys the remount (obligation 2) + names the entity for diagnostics. */
  readonly entityId: string;
  /** The server row (undefined while loading / for a create). */
  readonly serverValues: TValues | undefined;
  /**
   * The persist fn — supplied at CALL time so it can close over the live tRPC client + the entity id
   * the surface holds (a module-scope `config.save` cannot reach React context). WINS over
   * `config.save` when both are present. RESOLVES to the saved row (the re-baseline source, obligation
   * 3) — e.g. `updateTheme.mutateAsync(...).then(themeFormFromEntity)`.
   */
  readonly save?: (values: TValues) => Promise<TValues>;
}

// The factory's return type is INFERENCE-CARRIED on purpose: the AppForm instance is a 20+-generic
// TanStack type that cannot be truthfully named without re-spelling the library's internals — the
// hook returns `{ form, mountKey, promote, discard }` with `form` fully typed by inference. (The
// useExplicitReturnType exception is suppressed on the RETURNED hook below, where the rule actually
// fires — this outer factory needs no suppression.)
export function createSavedEntityForm<TValues extends object>(
  config: SavedEntityFormConfig<TValues>,
) {
  // biome-ignore lint/nursery/noComponentHookFactories: the D54 §13.1 editor-factory pattern — factories run at MODULE scope (const useCharacterForm = createSavedEntityForm(...)), so the returned hook has a stable identity the Compiler can analyze; a per-render creation is what the rule fears and cannot happen here.
  // biome-ignore lint/nursery/useExplicitReturnType: inference-carried (see the factory header).
  return function useSavedEntityForm({
    entityId,
    serverValues,
    save: callTimeSave,
  }: SavedEntityFormArgs<TValues>) {
    // The persist fn: the call-time `save` (client-bound; the surface's seam) WINS over the
    // module-scope `config.save` — same rule as the autosave factory.
    const save = callTimeSave ?? config.save;

    // The crash-survival mirror (obligation 5, OPTIONAL). A surviving draft is read ONCE-per-render
    // here (a plain store READ, not a subscription) and PROMOTED after mount (the effect below), never
    // merged into the seed — the mount seed stays SERVER-only so `isDefaultValue` tracks server truth.
    const draftSeed = config.draft?.readDraft(entityId);

    // The re-baseline handshake (obligation 3): onSubmit stores the SAVED row + bumps the tick;
    // the effect below runs after the submit promise resolves and calls reset(saved) OUTSIDE the
    // submit path. isSubmitSuccessful alone can't carry the saved VALUE — hence the ref+tick pair.
    const savedRef = useRef<TValues | null>(null);
    const [saveTick, setSaveTick] = useState(0);

    const form = useAppForm({
      validationLogic: revalidateLogic(), // submit-then-live seam; overridable via config.options
      ...config.options,
      defaultValues: serverValues ?? config.defaultValues, // obligation 1 (seed once at mount)
      onSubmit: async ({ value }: { value: TValues }) => {
        // FLAG[#58] parse-on-submit NOT wired: `value` is the form's INPUT type. If a config supplies
        // a Standard-Schema validator with a Zod `.transform()`/coercion, the OUTPUT is NOT applied
        // here — `save` receives the untransformed input (UI-Lib-TanStack-Form §C footgun #7). The
        // TInput/TOutput split is deferred to the first entity editor whose schema actually
        // transforms (validate against a real consumer, per the factory drift-bug lesson) — task #58.
        if (save === undefined) {
          // Neither seam supplied a persist fn — a button-gated editor with nothing to save is a
          // wiring bug, not a legal "read-only panel" (unlike autosave's fire-and-forget, this form's
          // whole point is the explicit save action), so this fails loud rather than silently no-op.
          throw new Error(
            "createSavedEntityForm: no save function supplied (neither config.save nor a call-time save)",
          );
        }
        const saved = await save(value);
        savedRef.current = saved;
        setSaveTick((t) => t + 1);
        // A confirmed save makes the mirror redundant — clear it so a later crash can't resurrect a
        // stale draft over fresher server truth (mirrors the autosave factory's post-save clear).
        config.draft?.clearDraft(entityId);
      },
      onSubmitInvalid: (): void => {
        // Focus-first-error — the library ships none by design. `@orb/ui/field` stamps real
        // aria-invalid="true" on the native control (never a wrapper div), so this finds it.
        // biome-ignore lint/security/noSecrets: false positive — an aria-attribute CSS selector, not a credential.
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      },
      // Obligation 5 (OPTIONAL) — the debounced crash mirror. Present ONLY when a `draft` store is
      // supplied, so a draftless consumer is byte-identical to the original (no listener at all). Mirror
      // ONLY (never `handleSubmit` — this factory stays button-gated); skip the untouched seed so an
      // open never mints a draft (`!isDefaultValue` = the same "differs from seed right now" pill flag
      // the autosave factory guards on, NOT persistent `isDirty`).
      ...(config.draft === undefined
        ? {}
        : {
            listeners: {
              onChange: ({
                formApi,
              }: {
                formApi: { state: { values: TValues; isDefaultValue: boolean } };
              }): void => {
                if (!formApi.state.isDefaultValue) {
                  config.draft?.setDraft(entityId, formApi.state.values);
                }
              },
              onChangeDebounceMs: DEFAULT_DEBOUNCE_MS,
            },
          }),
    });

    // Obligation 3 — the post-submit re-baseline effect (never inside onSubmit).
    useEffect(() => {
      if (saveTick > 0 && savedRef.current !== null) {
        form.reset(savedRef.current);
      }
      // form is referentially stable (the hook returns one instance for the mount).
    }, [saveTick, form]);

    // Obligation 5 (OPTIONAL) — promote a surviving draft AFTER mount as USER-intent writes (no
    // `dontUpdateMeta`) so `!isDefaultValue` flips and the pill LIGHTS: a restored draft that looked
    // "clean" would silently lose the work on the next navigation (the whole point of the mirror).
    //
    // `draftSeededRef` is load-bearing exactly like the autosave factory's `seededRef`: `draftSeed` is
    // re-read every render (a plain store read, not a subscription) and its identity FLIPS the moment
    // the debounced listener mirrors an edit into the same slot. Without the guard, the next host
    // re-render (a background refetch handing `serverValues` a fresh identity is the common trigger)
    // re-runs this effect and re-applies the ORIGINAL draft over the user's live edit. The guard makes
    // the promotion genuinely mount-once; `mountKey` (= entityId) remounts the hook on id change, so the
    // ref resets per entity. Promoting as user-writes also flips persistent `isDirty`, which correctly
    // arms the reseed guard below (a restored draft must NOT be clobbered by a background refetch).
    const draftSeedRef = useRef(draftSeed); // the MOUNT draft, captured once (the autosave `seedRef`)
    const draftSeededRef = useRef(false);
    useEffect(() => {
      if (draftSeededRef.current) {
        return;
      }
      draftSeededRef.current = true;
      // Guard on the re-read `draftSeed` (matches the autosave factory) but WRITE the fixed mount
      // `draftSeedRef.current` — the two are equal at mount (the only time the body runs), and writing
      // the fixed ref is what makes an un-guarded re-run a real clobber of the ORIGINAL over the edit.
      if (draftSeed !== undefined && draftSeedRef.current !== undefined) {
        for (const [name, value] of Object.entries(draftSeedRef.current)) {
          // Same loose public-boundary erasure as `promote()` — an arbitrary draft field path + value
          // narrowed to `never` for setFieldValue's generic; UNLIKE promote() this is a USER write (no
          // dontUpdateMeta) so the pill lights.
          // biome-ignore lint/plugin/no-loose-id-cast: not a branded-id cast — `name`/`value` are a draft field key + its value erased to `never` at this loose public boundary (see promote()).
          form.setFieldValue(name as never, value as never);
        }
      }
      // `draftSeed` is in deps (it flips identity the moment the listener mirrors an edit into the same
      // slot) so this effect RE-RUNS on a host re-render — the `draftSeededRef` guard is what stops the
      // body from re-applying the fixed mount `draftSeedRef.current` back OVER the user's live edit.
    }, [draftSeed, form]);

    // Obligation 5 (OPTIONAL) — FLUSH the debounced mirror on UNMOUNT. The onChange listener above is
    // debounced (DEFAULT_DEBOUNCE_MS), so an edit made <debounce before the editor REMOUNTS on an entity
    // switch (`key={mountKey}`) would be DROPPED — the pending mirror write never fires and the draft is
    // lost with ZERO warning (FINAL-Character §6.5: "switching away mid-edit loses nothing — the mirror
    // preserves the draft and re-promotes it with the dirty pill LIT on return", the whole reason the
    // confirm dialog was removed). The cleanup writes the LATEST form values to the mirror synchronously
    // so a fast switch can't race the debounce. Lowering the debounce is NOT the fix (a faster switch
    // would still race) — a synchronous flush-on-unmount is. Guarded on `!isDefaultValue`, so a
    // clean/unchanged form flushes NOTHING: safe for every draftless consumer (persona/group-config/
    // system-settings/appearance) and byte-identical to before when no `draft` store is supplied.
    useEffect(() => {
      if (config.draft === undefined) {
        return;
      }
      return (): void => {
        if (!form.state.isDefaultValue) {
          config.draft?.setDraft(entityId, form.state.values);
        }
      };
    }, [entityId, form]);

    // Obligation 4 — the reseed guard: a fresh serverValues identity reseeds ONLY an untouched form.
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
        // The ONE dontUpdateMeta site (obligation 6) — see the header for why it's wrapped. The
        // field-name/value narrowing to `never` is the loose public-boundary erasure (legitimate —
        // `promote` takes an arbitrary path string, not a branded id); the options bag is
        // `satisfies UpdateMetaOptions`, the REAL exported type, so it breaks HERE at compile time
        // if the flag is renamed/reshaped.
        // biome-ignore lint/plugin/no-loose-id-cast: not a branded-id cast — `name`/`value` are an arbitrary DeepKeys path + its value, erased to `never` ONLY to satisfy setFieldValue's generic `TField extends DeepKeys<TFormData>` at this loose public boundary (see header).
        form.setFieldValue(name as never, value as never, {
          dontUpdateMeta: true,
        } satisfies UpdateMetaOptions);
      },
      discard: (): void => {
        form.reset();
        // Explicit discard drops the crash mirror too — otherwise a reload would resurrect the very
        // draft the user just chose to throw away.
        config.draft?.clearDraft(entityId);
      },
    };
  };
}
