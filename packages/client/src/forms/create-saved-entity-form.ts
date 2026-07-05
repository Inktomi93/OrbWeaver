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
// (Obligation 5 — the Zustand-persist draft mirror — is the AUTOSAVE factory's; a button-gated
// editor holds unsaved state in the form itself.)
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
import type { AppFormOptions } from "./use-app-form";
import { useAppForm } from "./use-app-form";

/** The authored per-entity config — `formOptions()`-shaped (the one home for defaults+validators). */
export interface SavedEntityFormConfig<TValues extends object> {
  /** Fallback defaults for a CREATE (no server row yet). */
  readonly defaultValues: TValues;
  /** Persist the values; RESOLVES to the saved row (the re-baseline source). */
  readonly save: (values: TValues) => Promise<TValues>;
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
}

// The factory's return type is INFERENCE-CARRIED on purpose: the AppForm instance is a 20+-generic
// TanStack type that cannot be truthfully named without re-spelling the library's internals — the
// hook returns `{ form, mountKey, promote, discard }` with `form` fully typed by inference.
// biome-ignore lint/nursery/useExplicitReturnType: see above — naming the AppForm generic instance would re-spell TanStack internals (the same class of exception as AppRouter).
export function createSavedEntityForm<TValues extends object>(
  config: SavedEntityFormConfig<TValues>,
) {
  // biome-ignore lint/nursery/noComponentHookFactories: the D54 §13.1 editor-factory pattern — factories run at MODULE scope (const useCharacterForm = createSavedEntityForm(...)), so the returned hook has a stable identity the Compiler can analyze; a per-render creation is what the rule fears and cannot happen here.
  // biome-ignore lint/nursery/useExplicitReturnType: inference-carried (see the factory header).
  return function useSavedEntityForm({ entityId, serverValues }: SavedEntityFormArgs<TValues>) {
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
        // here — `config.save` receives the untransformed input (UI-Lib-TanStack-Form §C footgun #7).
        // The TInput/TOutput split is deferred to the first entity editor whose schema actually
        // transforms (validate against a real consumer, per the factory drift-bug lesson) — task #58.
        const saved = await config.save(value);
        savedRef.current = saved;
        setSaveTick((t) => t + 1);
      },
      onSubmitInvalid: (): void => {
        // Focus-first-error — the library ships none by design. `@orb/ui/field` stamps real
        // aria-invalid="true" on the native control (never a wrapper div), so this finds it.
        // biome-ignore lint/security/noSecrets: false positive — an aria-attribute CSS selector, not a credential.
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      },
    });

    // Obligation 3 — the post-submit re-baseline effect (never inside onSubmit).
    useEffect(() => {
      if (saveTick > 0 && savedRef.current !== null) {
        form.reset(savedRef.current);
      }
      // form is referentially stable (the hook returns one instance for the mount).
    }, [saveTick, form]);

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
      },
    };
  };
}
