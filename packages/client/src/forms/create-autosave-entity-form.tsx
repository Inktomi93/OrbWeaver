// createAutosaveEntityForm — the session-boundary autosave factory (autosave-form-doctrine.md §1–§6,
// D78; SEAL landed 2026-07-16). The ONE way a feature mounts an autosave form: `const XForm =
// createAutosaveEntityForm<TValues>(config)` at module scope, then `<XForm entityId serverValues save>
// {(session) => …}</XForm>`. The factory OWNS identity, reseed, the teardown flush, the baseline, and the
// save driver (the D78 ledger row); the internal Session hook is unexported, so the failure modes it kills
// (§7) are unspellable rather than merely discouraged. `no-manual-autosave-flush` (G-A) bans the retired
// call-site array flush; `no-form-reset-in-autosave` / `no-direct-useform` / `form-factory-for-multifield`
// hold the rest. `noComponentHookFactories` is off for this file via a biome.json override (see the bottom).
//
// EXACTLY ONE PERSISTENCE SEAM is a COMPILE fact, not prose (Codex audit client-forms-01): the factory is
// overloaded so a config WITHOUT `save` returns a boundary whose `save` prop is REQUIRED. A seamless mount
// used to report "Saved" over an edit it had thrown away — see the factory TSDoc + the onSubmit refusal.
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
import type { ReactElement, ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
// The NON-JSX HALF (the seam law, the session surface, and the three module-scope pure helpers) is the
// `-model.ts` sibling — this JSX module carries the factory and its closure components (`component-size`;
// the capped-field-model precedent).
import type {
  AutosaveBoundaryImplProps,
  AutosaveBoundaryProps,
  AutosaveBoundaryPropsSeamRequired,
  AutosaveEntityBoundaryConfig,
  AutosaveEntityBoundaryConfigWithoutSave,
  AutosaveEntityBoundaryConfigWithSave,
  AutosaveForm,
  AutosaveSaveState,
  AutosaveSession,
} from "./create-autosave-entity-form-model.ts";
import { foldSaveState, hasUnsavedEdits, skipTeardownFlush } from "./create-autosave-entity-form-model.ts";
import { DEFAULT_DEBOUNCE_MS, focusFirstInvalidField, formValuesEqual, hashServerBaseline, mirrorDraft, readDraftSeed } from "./entity-form-base.ts";
import { createSaveCircuitBreaker, DEFAULT_SAVE_BREAKER } from "./save-circuit-breaker.ts";
import { useSaveUnwritable, useSaveUnwritableRef } from "./save-status-seam.ts";
import { useAppForm } from "./use-app-form.ts";

/**
 * The autosave session-boundary factory (D78). Returns a COMPONENT, not a hook: a consumer mounts an
 * autosave form ONLY as `<XForm entityId serverValues save>{(session) => …}</XForm>`, and the factory —
 * not the consumer — owns the entity key. The internal Session is a closure component (never exported), so
 * wrong key placement is unspellable.
 *
 * EXACTLY ONE PERSISTENCE SEAM, ENFORCED AT COMPILE TIME (Codex audit `client-forms-01`, 2026-08-13).
 * Both seams used to be optional and the driver ran `await save?.(value)` — a boundary mounted with
 * NEITHER re-baselined, cleared the crash-survival draft, and reported "Saved" over an edit that had gone
 * nowhere. Autosave that can lie is worse than no autosave. A mint-time throw cannot decide this (all 25
 * live consumers legitimately mint WITHOUT `config.save` and supply the seam per-instance, because the
 * tRPC client is a runtime value), so the enforcement is one rung higher than a throw: these overloads
 * make the seam declaration REQUIRED exactly when the config omitted it — `save`, or the explicit
 * `readOnly` arm for the display-only member views. `tsc` is the enforcer; the onSubmit refusal below is
 * the runtime backstop for a caller that erases the type.
 */
export function createAutosaveEntityForm<TValues extends object>(
  config: AutosaveEntityBoundaryConfigWithSave<TValues>,
): (props: AutosaveBoundaryProps<TValues>) => ReactElement;
export function createAutosaveEntityForm<TValues extends object>(
  config: AutosaveEntityBoundaryConfigWithoutSave<TValues>,
): (props: AutosaveBoundaryPropsSeamRequired<TValues>) => ReactElement;
export function createAutosaveEntityForm<TValues extends object>(
  config: AutosaveEntityBoundaryConfig<TValues>,
): (props: AutosaveBoundaryImplProps<TValues>) => ReactElement {
  const debounceMs = config.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  interface SessionProps {
    readonly entityId: string;
    readonly serverValues: TValues | undefined;
    readonly save: ((values: TValues) => Promise<unknown>) | undefined;
    /** The declared read-only arm (props.readOnly) — the save driver never arms and nothing mirrors. */
    readonly readOnly: boolean;
    /** The reseed payload for this epoch (undefined = seed from defaults ⊕ server ⊕ draft). */
    readonly pendingSeed: TValues | undefined;
    /**
     * The Boundary's discard flag, passed as the REF rather than a reader callback (D54 — no manual memo,
     * so a reader would be a fresh identity every Boundary render; naming it in the teardown effect's deps
     * re-arms the effect, and every re-arm FLUSHES — a measured 31-write save loop). A ref object is stable
     * by construction, so the teardown effect can depend on it honestly. Read-and-clear via `takeDiscard`.
     */
    readonly discardRef: RefObject<boolean>;
    readonly reseed: (next: TValues) => void;
    readonly children: (session: AutosaveSession<TValues>) => ReactNode;
  }

  /**
   * The keyed Session — the epoch's owner of the FormApi, saveState, the last-saved baseline, the store-
   * subscription save driver, and the ONE teardown flush. Remounted whenever the Boundary bumps its key
   * (entity switch or reseed), so every ref here is genuinely fresh per entity (the cross-entity
   * stale-`error` bleed of the old hook-resident state is gone — §4).
   */
  function Session({ entityId, serverValues, save, readOnly, pendingSeed, discardRef, reseed, children }: SessionProps): ReactElement {
    // The identity of the server snapshot this epoch mounts over — the baseline a surviving draft must
    // have been begun on to still outrank it. Computed at mount and held stable for
    // the epoch (a structural change to `serverValues` remounts via the boundary key or re-baselines the
    // clean echo below; either path recomputes). `undefined` server (a create/loading) → an ungated read.
    const baselineHash = serverValues === undefined ? undefined : hashServerBaseline(serverValues);

    // "No write from this subtree can land" (#1716) — a CONTEXT rather than a prop so the fact reaches every
    // form under one provider (a settings pane stacks a dozen self-owned section forms and not one of them
    // can save while `user_settings.config` is unreadable). Read here, at the Session, because that is where
    // the driver and the teardown flush live — the two things that must not arm.
    const unwritable = useSaveUnwritable();
    // …and as a ref the teardown cleanup below may read without owning it as a dependency (see its TSDoc).
    const unwritableRef = useSaveUnwritableRef();

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
    // Completion ownership: saves may overlap (an explicit retry/teardown can submit while a debounce write
    // is still in flight). Only the newest-started submit may advance the session baseline or lifecycle.
    // Otherwise an older response arriving last clears the newer crash draft and makes the form look clean
    // against stale values.
    const submitEpochRef = useRef(0);
    const form = useAppForm({
      validationLogic: revalidateLogic(),
      ...config.options,
      defaultValues: seed,
      onSubmit: async ({ value }: { value: TValues }) => {
        const submitEpoch = ++submitEpochRef.current;
        setSaveState("saving");
        try {
          if (save === undefined) {
            // THE RUNTIME BACKSTOP for the compile-time law on the factory (client-forms-01). Reaching
            // here means the props type was erased (a cast, a JS caller). REFUSE before the sequence
            // below: `await save?.(value)` resolved on `undefined`, so the edit was re-baselined away,
            // its crash-survival draft cleared, and the status set to "saved" — the UI reported success
            // for a write that never happened. Throwing routes into the catch: no re-baseline, no
            // clearDraft (the draft SURVIVES for retry), status `error`, retry affordance lit. Same
            // shape as the button-gated sibling's refusal (create-saved-entity-form.ts onSubmit).
            throw new Error(`createAutosaveEntityForm: no save function supplied for entity "${entityId}" (neither config.save nor a call-time save)`);
          }
          await save(value);
          if (submitEpoch !== submitEpochRef.current) {
            return;
          }
          // Re-baseline to the just-saved snapshot AFTER save resolves (§4) — all guards now read clean.
          lastSavedRef.current = value;
          config.draft?.clearDraft(entityId);
          setSaveState("saved");
        } catch (error) {
          // Record the failed lifecycle for the retry affordance, then re-throw so the driver's own
          // `.catch` and the injected save's errorToast still run (clearDraft correctly skipped).
          if (submitEpoch === submitEpochRef.current) {
            setSaveState("error");
          }
          throw error;
        }
      },
      onSubmitInvalid: focusFirstInvalidField,
    });

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
      if (readOnly || unwritable) {
        // The DECLARED read-only arm (client-forms-01): no driver, no debounce, and no draft mirror — a
        // display-only mount must not write anywhere, and a crash draft it can never save is only a
        // future stale-draft heal. The status fold below keeps it from ever reading "Saved" over an edit.
        //
        // `unwritable` joins it (#1716) for the same three reasons and one more: the server REFUSES every
        // write derived from an unreadable stored row, so arming the debounce would spend a request per
        // keystroke-burst on a guaranteed 400, walk the circuit breaker toward a trip, and land the user on
        // an `error` whose Retry cannot ever succeed. The status fold reports `unreadable` instead.
        return;
      }
      // The oscillation backstop (§11): a store-values change that came from a
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
        if (!(form.state.isValid && hasUnsavedEdits(form.state.values, lastSavedRef.current))) {
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
        // @orb-gate-ignore caught-failure-ownership(promise:handleSubmit): the injected save's own errorToast surfaces the failure and the draft mirror holds the edit for retry. Ends if the injected save stops wiring an errorToast.
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
      // `hasUnsavedEdits` is a plain function over `form` + a ref (D54 — no manual memo), so `form` already
      // IS its dependency; naming the callback identity would only re-arm on every render.
    }, [form, entityId, baselineHash, readOnly, unwritable]);

    // Clean server-echo reseed (§5, two-device freshness): when `serverValues` changes STRUCTURALLY
    // (deep-compare vs the last-seen snapshot — identity is the mapper-fresh-object trap) and the form is
    // clean and no save is in flight, re-baseline to the new server values. With unsaved edits → keep
    // editing; the next save wins (last-writer-wins, unchanged).
    useEffect(() => {
      if (serverValues === undefined || formValuesEqual(serverValues, lastServerRef.current)) {
        return;
      }
      lastServerRef.current = serverValues;
      if (saveState !== "saving" && !hasUnsavedEdits(form.state.values, lastSavedRef.current)) {
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
            // @orb-waive no-loose-id-cast(name): not a branded-id cast — a server-row FIELD KEY erased to `never` to satisfy setFieldValue's `TField extends DeepKeys<TFormData>` generic, which Object.entries cannot narrow to. ENDS WHEN: the seed is typed as a partial of TValues instead of an entries loop.
            // @orb-waive no-loose-id-cast(value): not a branded-id cast — the field's VALUE erased to `never` because setFieldValue's value type is keyed off the (already erased) field generic. Same end condition as the key above.
            form.setFieldValue(name as never, value as never);
          }
        } finally {
          programmaticWriteRef.current = false;
        }
      }
    }, [serverValues, saveState, form, entityId, baselineHash]);

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
        if (skipTeardownFlush(discardRef, unwritableRef)) {
          return; // a staged reseed/discard, or an unwritable subtree (#1716) — see the predicate's TSDoc
        }
        if (form.state.isValid && hasUnsavedEdits(form.state.values, lastSavedRef.current)) {
          // @orb-gate-ignore caught-failure-ownership(promise:handleSubmit): same swallow as the debounce driver above — the injected save's own errorToast surfaces the failure and the draft mirror holds the edit for retry. Ends if the injected save stops wiring an errorToast.
          form.handleSubmit().catch(() => undefined);
        }
      };
      // `unwritableRef` is a REF OBJECT, stable by construction exactly like `discardRef` — naming it here
      // costs nothing and satisfies exhaustive-deps honestly. What must NEVER be named is the BOOLEAN it
      // carries: this effect FLUSHES on every re-arm (the measured 31-write save loop).
    }, [form, discardRef, unwritableRef]);

    // NOT covered here, deliberately (measured, 2026-08-01): a page RELOAD / tab close never unmounts React,
    // so nothing above runs and an armed debounce dies with the document. A `pagehide` flush was built and
    // REJECTED as theater — `handleSubmit` awaits validation and the batch link flushes on a later tick, so
    // the request is never dispatched before teardown (CT-verified: zero writes reached the wire). Closing it
    // honestly needs a SYNCHRONOUS write path (a `sendBeacon` endpoint), which is a transport decision, not a
    // forms one. Until then the exposure is the debounce window, and the honest mitigation is the consumer's
    // own dirty disclosure — a pane must not read "Saved" over an unsaved edit.
    const retrySave = (): void => {
      // @orb-gate-ignore caught-failure-ownership(promise:handleSubmit): explicit user retry — same swallow as the debounce driver, the injected save's own errorToast surfaces the failure. Ends if the injected save stops wiring an errorToast.
      // Direct submit — an explicit user retry always re-attempts the held edit; same swallow as the driver.
      form.handleSubmit().catch(() => undefined);
    };

    // THE DISPLAYED LIFECYCLE (see `foldSaveState`). Two arms landed here first and the third joined them
    // for the same reason:
    //
    // THE HELD-WRITE ARM (side-eye PROSE-LIMIT P2). `attemptSave` and the teardown flush BOTH gate on
    // `form.state.isValid`, so an invalid form is a write the driver is deliberately NOT making — and every
    // status affordance was reading the untouched `saveState`, i.e. "Saved", over text that was not saved and
    // would not be. The truth lives at the same seam the refusal does, so it is folded in HERE rather than at
    // each call site: one derivation, every autosave surface, no editor able to forget it.
    //
    // THROUGH `form.Subscribe`, not a render-time `form.state.isValid` read: `form.state` is a SNAPSHOT and
    // reading it subscribes to nothing, so the status would keep the validity it happened to have at the last
    // Session render — and the flip we need to catch (the driver's own submit attempt validating and
    // refusing) does not re-render the Session at all. `error` still WINS the fold: a save that genuinely
    // failed is a stronger fact about the write than the validity of what is in the box now, and it owns the
    // retry affordance.
    // EXPLICITLY INSTANTIATED `<boolean>`, through a local alias: `Subscribe`'s `TSelected` is
    // inference-blocked here (its props wrap the state in `NoInfer`, and `TValues` is still generic inside
    // the factory), so an un-instantiated call defaults `TSelected` to the WHOLE FormState and rejects a
    // boolean selector — and TSX cannot carry type arguments on a MEMBER-expression tag (`<form.Subscribe<
    // boolean>>` is a parse error), so the component comes out to a const first. Concretely-typed call sites
    // (a feature's own `form.Subscribe`) infer fine; this is a factory-generic-only wrinkle. Subscribing to
    // `isValid` ALONE and not to the whole state is deliberate: the body here is the consumer's entire
    // editor, and a whole-state subscription would re-render it on every keystroke.
    //
    // The READ-ONLY arm folds in at the same seam and for the same reason: a declared-read-only mount has
    // no driver at all, so a form that is somehow dirty (a field that forgot its `disabled`) is a write
    // that will never be made — `blocked`, never "Saved" (client-forms-01). `isDirty` is the right
    // predicate FOR THAT ARM: it is exactly "this form has been edited", and in the read-only arm no save
    // can ever clear it. The UNCOMMITTED-EDIT arm (#81 P0) needs the opposite predicate — `hasUnsavedEdits`
    // against the last-saved baseline, because a save DOES clear it — which is precisely why the two are
    // separate facts in the fold rather than one "dirty".
    //
    // The selector returns the FOLDED STATE, not a boolean: it is a primitive, so `Subscribe` re-renders
    // the consumer's body only when the DISPLAYED state actually transitions (twice per save cycle), never
    // per keystroke — the same subscription economy the boolean bought, with the whole verdict computed
    // where the baseline lives.
    const FormSubscribe = form.Subscribe;
    return (
      <FormSubscribe<AutosaveSaveState>
        selector={(state): AutosaveSaveState =>
          foldSaveState({
            driver: saveState,
            isValid: state.isValid,
            readOnlyDirty: readOnly && state.isDirty,
            unsaved: hasUnsavedEdits(state.values, lastSavedRef.current),
            unwritable,
          })
        }
      >
        {(displayed: AutosaveSaveState): ReactNode =>
          children({
            form: form as AutosaveForm<TValues>,
            saveState: displayed,
            retrySave,
            reseed,
          })
        }
      </FormSubscribe>
    );
  }

  // noComponentHookFactories is off for THIS file via a biome.json override (the D54 §13.1 editor-factory
  // pattern — this factory runs at MODULE scope, `const PresetForm = createAutosaveEntityForm(...)`, so
  // both Session and AutosaveBoundary have stable identities; a per-render factory call is what the rule
  // fears and cannot happen here — mirrors create-registry-context.tsx / create-drill-selection-store.ts).
  return function AutosaveBoundary({ entityId, serverValues, save: callTimeSave, readOnly, children }: AutosaveBoundaryImplProps<TValues>): ReactElement {
    // A DECLARED read-only mount never persists, even if the mint config carried a seam — the arm the
    // surface declared at the mount site is the stronger statement about this instance.
    const save = readOnly === true ? undefined : (callTimeSave ?? config.save);
    // The epoch + the reseed payload are ONE state cell so a reseed bumps the key AND stages the winning
    // seed atomically — read at render (state, not a ref), consumed once by the remounted Session's seed
    // initializer. The discard flag telling the OUTGOING session's teardown to skip its flush is a ref
    // (read/written only in callbacks — takeDiscard/reseed — never at render, so no ref-during-render).
    const [reseedState, setReseedState] = useState<{ readonly epoch: number; readonly seed: TValues | undefined }>({ epoch: 0, seed: undefined });
    const discardRef = useRef(false);

    const reseed = (next: TValues): void => {
      // The outgoing session must NOT flush (the reseed discards the pre-reseed edit — that was the F2
      // write-back); stage the discard flag, then bump the epoch WITH the winning seed to remount.
      discardRef.current = true;
      setReseedState((s) => ({ epoch: s.epoch + 1, seed: next }));
    };

    return (
      <Session
        key={`${entityId}:${reseedState.epoch}`}
        entityId={entityId}
        serverValues={serverValues}
        save={save}
        readOnly={readOnly === true}
        pendingSeed={reseedState.seed}
        discardRef={discardRef}
        reseed={reseed}
      >
        {children}
      </Session>
    );
  };
}
