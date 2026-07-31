// createAutosaveEntityForm — the session-boundary autosave factory (autosave-form-doctrine.md §1–§6,
// D78; SEAL landed 2026-07-16). The ONE way a feature mounts an autosave form: `const XForm =
// createAutosaveEntityForm<TValues>(config)` at module scope, then `<XForm entityId serverValues save>
// {(session) => …}</XForm>`. The factory OWNS identity, reseed, the teardown flush, the baseline, and the
// save driver (the D78 ledger row); the internal Session hook is unexported, so the failure modes it kills
// (§7) are unspellable rather than merely discouraged. `no-manual-autosave-flush` (G-A) bans the retired
// call-site array flush; `no-form-reset-in-autosave` / `no-direct-useform` / `form-factory-for-multifield`
// hold the rest. `noComponentHookFactories` is off for this file via a biome.json override (see the bottom).
//
// WHY a boundary component and not a hook (D78 §0–§2): the old factory delegated entity IDENTITY to an
// invisible consumer convention ("put a React `key` above the component that calls the hook"). When a lane
// composed the key wrong, it rendered the previous entity under the new one and one keystroke persisted A
// into B (the live F1 P0). Here the factory OWNS the key: the internal Session component is defined inside
// the factory closure and never exported, so a consumer CANNOT mount an autosave form except through the
// boundary that keys its own Session. Wrong key placement is no longer a mistake you can spell.
//
//   Boundary  — holds `epoch` state + a discard-flag ref; renders <Session key={entityId:epoch}> and
//               threads the reseed payload down as a plain prop. An identity change OR reseed() bumps the
//               key = a React-guaranteed full teardown/remount of the form AND the consumer's body
//               (tabs/scroll/local state reset with it — the entity-switch behavior; D78 §2 O1).
//   Session   — owns the private useAppForm call, saveState, lastSavedRef, the store-subscription save
//               driver (§3), and the ONE teardown flush (§4, discard-aware). Its seed = the reseed payload
//               if present, else defaults ⊕ serverValues ⊕ surviving draft.

import { revalidateLogic } from "@tanstack/react-form";
import type { ReactElement, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EntityDraftStore } from "#state";
import { DEFAULT_DEBOUNCE_MS, focusFirstInvalidField, formValuesEqual, hashServerBaseline, mirrorDraft, readDraftSeed } from "./entity-form-base";
import { createSaveCircuitBreaker, DEFAULT_SAVE_BREAKER } from "./save-circuit-breaker";
import type { AppFormInstance, AppFormOptions } from "./use-app-form";
import { useAppForm } from "./use-app-form";

/** The autosave lifecycle the shared `AutosaveStatus` affordance renders (north-star §7 / D66 A4). */
const AUTOSAVE_SAVE_STATES = ["saved", "saving", "error"] as const;
export type AutosaveSaveState = (typeof AUTOSAVE_SAVE_STATES)[number];

/** The AppForm surface the session hands its body, `reset` type-removed (calling it re-baselines defaults,
 *  which on a live autosave draft is the isDirty loop `no-form-reset-in-autosave` also bans). */
type AutosaveForm<TValues extends object> = Omit<AppFormInstance<TValues>, "reset">;

/** The per-render surface a boundary hands its render-prop body. One session = one entity epoch. */
export interface AutosaveSession<TValues extends object> {
  /** The widened AppForm surface (same as the old factory's), minus `reset` at the type level. */
  readonly form: AutosaveForm<TValues>;
  /** The live save lifecycle for `AutosaveStatus`, per SESSION (resets on entity switch / reseed). */
  readonly saveState: AutosaveSaveState;
  /** Explicit user retry (the AutosaveStatus affordance) — submits the current values unconditionally. */
  readonly retrySave: () => void;
  /**
   * The ONE reset path (§5): tear the session down WITHOUT the teardown flush and remount seeded from
   * `next` (a mutation-response row or a contract default — NEVER a post-invalidation cache read, which
   * races the refetch). Discard-flagged so the pre-reseed edit is dropped, not written back.
   */
  readonly reseed: (next: TValues) => void;
}

export interface AutosaveEntityBoundaryConfig<TValues extends object> {
  readonly defaultValues: TValues;
  /**
   * Persist the values (fire-and-forget from the save driver). Optional because a module-scope factory
   * can't reach the runtime tRPC client; a surface needing it supplies `save` per-instance via
   * `AutosaveBoundaryProps.save` (which wins). Supply save at exactly one of the two seams.
   */
  readonly save?: (values: TValues) => Promise<unknown>;
  /** The crash-survival mirror. Omit only for genuinely ephemeral panels. */
  readonly draft?: EntityDraftStore<TValues>;
  /** @defaultValue 500 */
  readonly debounceMs?: number;
  readonly options?: Partial<Omit<AppFormOptions<TValues>, "defaultValues" | "onSubmit">>;
}

export interface AutosaveBoundaryProps<TValues extends object> {
  /** The entity under edit — keys the Session; a change is a full teardown/remount seeded from server. */
  readonly entityId: string;
  /** The server row (undefined while loading). A structural change while clean re-baselines (§5). */
  readonly serverValues: TValues | undefined;
  /**
   * Per-instance persist fn closing over the live tRPC client the surface holds. Wins over `config.save`.
   */
  readonly save?: (values: TValues) => Promise<unknown>;
  /** The body — a render prop given the live session (form + saveState + retrySave + reseed). */
  readonly children: (session: AutosaveSession<TValues>) => ReactNode;
}

/**
 * The autosave session-boundary factory (D78). Returns a COMPONENT, not a hook: a consumer mounts an
 * autosave form ONLY as `<XForm entityId serverValues save>{(session) => …}</XForm>`, and the factory —
 * not the consumer — owns the entity key. The internal Session is a closure component (never exported), so
 * wrong key placement is unspellable.
 */
export function createAutosaveEntityForm<TValues extends object>(
  config: AutosaveEntityBoundaryConfig<TValues>,
): (props: AutosaveBoundaryProps<TValues>) => ReactElement {
  const debounceMs = config.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  interface SessionProps {
    readonly entityId: string;
    readonly serverValues: TValues | undefined;
    readonly save: ((values: TValues) => Promise<unknown>) | undefined;
    /** The reseed payload for this epoch (undefined = seed from defaults ⊕ server ⊕ draft). */
    readonly pendingSeed: TValues | undefined;
    /** Reads-and-clears the Boundary's discard flag at teardown — true = this teardown skips its flush. */
    readonly takeDiscard: () => boolean;
    readonly reseed: (next: TValues) => void;
    readonly children: (session: AutosaveSession<TValues>) => ReactNode;
  }

  /**
   * The keyed Session — the epoch's owner of the FormApi, saveState, the last-saved baseline, the store-
   * subscription save driver, and the ONE teardown flush. Remounted whenever the Boundary bumps its key
   * (entity switch or reseed), so every ref here is genuinely fresh per entity (the cross-entity
   * stale-`error` bleed of the old hook-resident state is gone — §4).
   */
  function Session({ entityId, serverValues, save, pendingSeed, takeDiscard, reseed, children }: SessionProps): ReactElement {
    // The identity of the server snapshot this epoch mounts over — the baseline a surviving draft must
    // have been begun on to still outrank it (retro-workboard #11). Computed at mount and held stable for
    // the epoch (a structural change to `serverValues` remounts via the boundary key or re-baselines the
    // clean echo below; either path recomputes). `undefined` server (a create/loading) → an ungated read.
    const baselineHash = serverValues === undefined ? undefined : hashServerBaseline(serverValues);

    // Seed order (computed ONCE, this component only exists for one epoch): a pending reseed payload wins
    // outright; else defaults ⊕ serverValues ⊕ surviving draft — but the draft survives ONLY when it
    // validates against the model AND was begun on THIS server snapshot (the baseline gate). A stale or
    // unverifiable draft is discarded by `readDraftSeed`, so a poisoned mirror can no longer outrank the
    // server: the seed heals to server truth instead of displaying the dead draft as "saved" (the brick).
    const [seed] = useState<TValues>(
      () =>
        pendingSeed ??
        ({
          ...config.defaultValues,
          ...serverValues,
          ...readDraftSeed(config.draft, entityId, baselineHash),
        } as TValues),
    );

    // The save lifecycle AutosaveStatus renders. Starts "saved" — an untouched mount is in sync with the
    // server row. The driver drives it: saving → saved, or → error (which lights retry).
    const [saveState, setSaveState] = useState<AutosaveSaveState>("saved");
    // The last CONFIRMED-saved values — the baseline every guard compares against (§4). Init to the mount
    // seed (an untouched mount is clean); re-set after every successful save so a clean-since-save form is
    // genuinely clean (the permanently-dirty `isDefaultValue` defect never applies — it is not consulted
    // anywhere). Structural compare (formValuesEqual), never identity (mapper-fresh objects).
    const lastSavedRef = useRef<TValues>(seed);
    // The last server snapshot we baselined to — the clean-echo reseed (§5) compares the incoming
    // `serverValues` against THIS structurally (identity compare is the mapper-fresh-object trap).
    const lastServerRef = useRef<TValues | undefined>(serverValues);
    // True while the clean-echo effect is pushing server values into the form (a PROGRAMMATIC write, not a
    // user edit). The save-driver's breaker (§11) must NOT count a programmatic store change as a real
    // edit — otherwise an echo→re-submit oscillation clears its own edit-free run every loop and never
    // trips. A ref (read/written only in effect/subscription callbacks, never at render).
    const programmaticWriteRef = useRef(false);

    const form = useAppForm({
      validationLogic: revalidateLogic(),
      ...config.options,
      defaultValues: seed,
      onSubmit: async ({ value }: { value: TValues }) => {
        setSaveState("saving");
        try {
          await save?.(value);
          // Re-baseline to the just-saved snapshot AFTER save resolves (§4) — all guards now read clean.
          lastSavedRef.current = value;
          config.draft?.clearDraft(entityId);
          setSaveState("saved");
        } catch (error) {
          // Record the failed lifecycle for the retry affordance, then re-throw so the driver's own
          // `.catch` and the injected save's errorToast still run (clearDraft correctly skipped).
          setSaveState("error");
          throw error;
        }
      },
      onSubmitInvalid: focusFirstInvalidField,
    });

    // hasUnsavedEdits: structural inequality of live values vs the last-saved baseline (§3). Never
    // `isDefaultValue` (permanently-true after any edit was the F2 write-back vector). A stable callback so
    // the teardown cleanup and the driver share ONE definition without re-subscribing.
    const hasUnsavedEdits = useCallback((): boolean => !formValuesEqual(form.state.values, lastSavedRef.current), [form]);

    // THE ARMED DEBOUNCE, session-scoped (NOT effect-scoped). It outlives every re-subscription of the
    // driver effect below, and is cleared in exactly one place: the teardown effect (which flushes what
    // the timer was going to save). The 2026-08-01 lost-save incident is precisely what an effect-scoped
    // timer costs: the driver's deps carry the server-baseline hash, so ANY `serverValues` churn during
    // the debounce window — a busDriven refetch after some other settings write, a two-device echo — ran
    // the effect cleanup, cleared the armed timer, and never re-armed it. The edit was dropped in silence
    // while the status still read "Saved" (a dirty form is correctly skipped by the clean-echo re-baseline,
    // so the timer was the ONLY path to persistence). Same reason for the breaker + the stop flag: an
    // oscillation run must be a property of the SESSION, not of whichever effect instance is current.
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const stoppedRef = useRef(false);
    const breakerRef = useRef<ReturnType<typeof createSaveCircuitBreaker> | undefined>(undefined);

    // THE SAVE DRIVER (§3): a subscription on the form STORE, filtered to `state.values` changes. Every
    // mutation path — setFieldValue AND pushFieldValue/removeFieldValue/insertFieldValue/moveFieldValues —
    // routes through the store (array ops call setFieldValue internally), so structural array edits
    // autosave like any keystroke and NO call-site handleSubmit flush is needed (the §7 trap dies).
    // onFieldUnmount is gone: its job (don't lose a pending edit on field unmount) was always covered by
    // the form-level debounce — the FormApi + its timer outlive any field — and its real effect was F2.
    useEffect(() => {
      // The oscillation backstop (§11 / retro-workboard #11): a store-values change that came from a
      // REAL field edit clears the breaker's edit-free run; a submit that fires with no intervening edit
      // (a save→echo→re-submit loop) counts toward the trip. `values !== prevValues` is exactly "a values
      // change happened"; a values change the driver itself did NOT cause (the debounce fired, save
      // echoed, the store moved) still arrives here, but every arrival is preceded by a user edit in the
      // healthy case — an oscillation is the case where submits recur with the count never cleared.
      const breaker = breakerRef.current ?? createSaveCircuitBreaker({ ...DEFAULT_SAVE_BREAKER, now: () => performance.timeOrigin + performance.now() });
      breakerRef.current = breaker;
      let prevValues = form.store.state.values;
      const attemptSave = (): void => {
        timerRef.current = undefined;
        if (!(form.state.isValid && hasUnsavedEdits())) {
          return;
        }
        if (breaker.shouldTrip()) {
          // Edit-free submits are looping — stop the driver and surface `error` (retry lights). This turns
          // a would-be infinite write loop (the localStorage-brick symptom) into a visible, user-
          // recoverable state instead of silently hammering the server.
          stoppedRef.current = true;
          setSaveState("error");
          return;
        }
        // handleSubmit re-throws an onSubmit rejection; swallow it here — the injected save's own
        // errorToast surfaces the failure and the draft mirror holds the edit for retry.
        form.handleSubmit().catch(() => undefined);
      };
      const onValuesChange = (values: TValues): void => {
        // A programmatic write (the clean-echo effect pushing server truth) is NOT a user edit — it must
        // not clear the breaker's run, or an echo→re-submit loop resets its own counter every iteration.
        if (!programmaticWriteRef.current) {
          breaker.onEdit();
        }
        mirrorDraft(config.draft, entityId, values, baselineHash);
        if (stoppedRef.current) {
          return; // the breaker tripped this session — no further autosaves until reseed/remount
        }
        if (timerRef.current !== undefined) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(attemptSave, debounceMs);
      };
      const subscription = form.store.subscribe(() => {
        const values = form.store.state.values;
        if (values === prevValues) {
          return; // a non-values state change (meta/validation) — not our trigger
        }
        prevValues = values;
        onValuesChange(values);
      });
      // NOTE: the armed timer is deliberately NOT cleared here — this cleanup also runs on a plain
      // re-subscription (a `serverValues` churn moves `baselineHash`), and clearing it there is exactly
      // the lost-save defect. The ONLY clear is the teardown effect below, which flushes first.
      return (): void => subscription.unsubscribe();
    }, [form, entityId, hasUnsavedEdits, baselineHash]);

    // Clean server-echo reseed (§5, two-device freshness): when `serverValues` changes STRUCTURALLY
    // (deep-compare vs the last-seen snapshot — identity is the mapper-fresh-object trap) and the form is
    // clean and no save is in flight, re-baseline to the new server values. With unsaved edits → keep
    // editing; the next save wins (last-writer-wins, unchanged).
    useEffect(() => {
      if (serverValues === undefined || formValuesEqual(serverValues, lastServerRef.current)) {
        return;
      }
      lastServerRef.current = serverValues;
      if (saveState !== "saving" && !hasUnsavedEdits()) {
        // A clean re-baseline: adopt the server values as the new saved truth AND push them into the live
        // form (via each field, so the controlled inputs follow — never `form.reset`, the banned path).
        lastSavedRef.current = serverValues;
        // Stamp the mirror with the NEW server baseline (`baselineHash` already reflects this render's
        // `serverValues`), so a crash-restored draft is verified against the truth the form now shows.
        mirrorDraft(config.draft, entityId, serverValues, baselineHash);
        // These are PROGRAMMATIC writes (server truth, not user edits) — flag them so the save-driver's
        // breaker doesn't count them as edits that clear its oscillation run.
        programmaticWriteRef.current = true;
        try {
          for (const [name, value] of Object.entries(serverValues)) {
            // @orb-gate-ignore no-loose-id-cast not a branded-id cast — `name`/`value` are a server-row field key + its value erased to `never` at setFieldValue's loose generic boundary (the same idiom as create-saved-entity-form's promote()).
            form.setFieldValue(name as never, value as never);
          }
        } finally {
          programmaticWriteRef.current = false;
        }
      }
    }, [serverValues, saveState, hasUnsavedEdits, form, entityId, baselineHash]);

    // The ONE teardown flush (§4), discard-aware: this cleanup fires exactly on entity switch, reseed(),
    // and boundary unmount (all remount/unmount this component — its deps are all session-stable, so it
    // never runs on a re-render). Flush the unsaved edit to THIS session's save — unless the Boundary
    // staged a discard (the reseed path), which means "drop it." Within a session, nothing flushes on
    // field unmount; at teardown, one flush, correctly targeted. This is ALSO the one place the armed
    // debounce is disarmed: the flush persists exactly what the timer would have — flush, never drop.
    useEffect(() => {
      return (): void => {
        if (timerRef.current !== undefined) {
          clearTimeout(timerRef.current);
          timerRef.current = undefined;
        }
        if (takeDiscard()) {
          return; // this teardown was a reseed/discard — skip the flush
        }
        if (form.state.isValid && hasUnsavedEdits()) {
          form.handleSubmit().catch(() => undefined);
        }
      };
    }, [form, hasUnsavedEdits, takeDiscard]);

    // NOT covered here, deliberately (measured, 2026-08-01): a page RELOAD / tab close never unmounts React,
    // so nothing above runs and an armed debounce dies with the document. A `pagehide` flush was built and
    // REJECTED as theater — `handleSubmit` awaits validation and the batch link flushes on a later tick, so
    // the request is never dispatched before teardown (CT-verified: zero writes reached the wire). Closing it
    // honestly needs a SYNCHRONOUS write path (a `sendBeacon` endpoint), which is a transport decision, not a
    // forms one. Until then the exposure is the debounce window, and the honest mitigation is the consumer's
    // own dirty disclosure — a pane must not read "Saved" over an unsaved edit.
    const retrySave = useCallback((): void => {
      // Direct submit — an explicit user retry always re-attempts the held edit; same swallow as the driver.
      form.handleSubmit().catch(() => undefined);
    }, [form]);

    const session: AutosaveSession<TValues> = {
      form: form as AutosaveForm<TValues>,
      saveState,
      retrySave,
      reseed,
    };
    return <>{children(session)}</>;
  }

  // noComponentHookFactories is off for THIS file via a biome.json override (the D54 §13.1 editor-factory
  // pattern — this factory runs at MODULE scope, `const PresetForm = createAutosaveEntityForm(...)`, so
  // both Session and AutosaveBoundary have stable identities; a per-render factory call is what the rule
  // fears and cannot happen here — mirrors create-registry-context.tsx / create-drill-selection-store.ts).
  return function AutosaveBoundary({ entityId, serverValues, save: callTimeSave, children }: AutosaveBoundaryProps<TValues>): ReactElement {
    const save = callTimeSave ?? config.save;
    // The epoch + the reseed payload are ONE state cell so a reseed bumps the key AND stages the winning
    // seed atomically — read at render (state, not a ref), consumed once by the remounted Session's seed
    // initializer. The discard flag telling the OUTGOING session's teardown to skip its flush is a ref
    // (read/written only in callbacks — takeDiscard/reseed — never at render, so no ref-during-render).
    const [reseedState, setReseedState] = useState<{ readonly epoch: number; readonly seed: TValues | undefined }>({ epoch: 0, seed: undefined });
    const discardRef = useRef(false);

    const reseed = useCallback((next: TValues): void => {
      // The outgoing session must NOT flush (the reseed discards the pre-reseed edit — that was the F2
      // write-back); stage the discard flag, then bump the epoch WITH the winning seed to remount.
      discardRef.current = true;
      setReseedState((s) => ({ epoch: s.epoch + 1, seed: next }));
    }, []);

    const takeDiscard = useCallback((): boolean => {
      const discard = discardRef.current;
      discardRef.current = false;
      return discard;
    }, []);

    return (
      <Session
        key={`${entityId}:${reseedState.epoch}`}
        entityId={entityId}
        serverValues={serverValues}
        save={save}
        pendingSeed={reseedState.seed}
        takeDiscard={takeDiscard}
        reseed={reseed}
      >
        {children}
      </Session>
    );
  };
}
