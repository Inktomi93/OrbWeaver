// The autosave session-boundary's NON-JSX HALF — the session surface, the mint config arms, the mount props
// arms, and the three module-scope pure helpers of `createAutosaveEntityForm` (D78,
// autosave-form-doctrine.md §1–§6). Split out of the `.tsx` factory for the `component-size` cap, on the
// local precedent that a JSX module carries components and its non-JSX half lives beside it
// (`capped-field-model.ts`, `save-status-seam.ts`). The factory's OVERLOADS — which pair a config arm with
// its props arm — stay in the `.tsx`; this file is what they are spelled in.
//
// The helpers at the bottom (`hasUnsavedEdits` · `foldSaveState` · `takeDiscard`) are exported ONLY for the
// sibling factory, never through `#forms`: they are the Session's internals, and a consumer that could reach
// `foldSaveState` could re-derive a status the boundary already hands it — the second truth `AutosaveSession`
// exists to prevent.
//
// THE SEAM LAW lives here (Codex audit client-forms-01, 2026-08-13): the persistence seam is declared at
// EXACTLY ONE place, and that is a compile fact. Both seams used to be optional and the driver ran
// `await save?.(value)`, so a mount with neither re-baselined, cleared the crash-survival draft, and set
// "saved" — the UI reported success for a write that never happened. Autosave that can lie is worse than
// no autosave. A mint-time throw cannot decide it (every live consumer legitimately mints WITHOUT
// `config.save`, because a module-scope factory cannot reach the runtime tRPC client), so the config's
// `save` presence selects the props arm instead: no config seam ⇒ the mount must declare `save` OR the
// explicit `readOnly` arm.

import type { ReactNode, RefObject } from "react";
import type { EntityDraftStore, SAVE_LIFECYCLE_STATES } from "#state";
import { formValuesEqual } from "./entity-form-base.ts";
import type { AppFormInstance, AppFormOptions } from "./use-app-form.ts";

/** The autosave lifecycle the shared `AutosaveStatus` affordance renders (north-star §7 / D66 A4).
 *  DERIVED from the state-tier tuple (`SAVE_LIFECYCLE_STATES`) — the settings save-status store carries the
 *  same lifecycle and lives BELOW forms, so the tuple homes there and this alias derives rather than
 *  re-spells it (`no-inline-union-redecl`). */
export type AutosaveSaveState = (typeof SAVE_LIFECYCLE_STATES)[number];

/** The AppForm surface the session hands its body, `reset` type-removed (calling it re-baselines defaults,
 *  which on a live autosave draft is the isDirty loop `no-form-reset-in-autosave` also bans). */
export type AutosaveForm<TValues extends object> = Omit<AppFormInstance<TValues>, "reset">;

/** The per-render surface a boundary hands its render-prop body. One session = one entity epoch. */
export interface AutosaveSession<TValues extends object> {
  /** The widened AppForm surface (same as the old factory's), minus `reset` at the type level. */
  readonly form: AutosaveForm<TValues>;
  /** The DISPLAYED save lifecycle for `AutosaveStatus`, per SESSION (resets on entity switch / reseed). It
   *  is a FOLD, not the raw driver state (`foldSaveState` at the bottom of this file owns the order): an invalid form
   *  reads `blocked`, because the driver is holding that write and a status line saying "Saved" over it is
   *  simply false; a declared read-only mount that is somehow dirty reads `blocked` at the same seam; and a
   *  form carrying an edit the driver has not written yet reads `saving`, never "Saved" (side-eye #81 P0 —
   *  the whole debounce window used to claim success over text that lived only in the box). A consumer
   *  renders this verbatim: there is no per-surface dirty fold to remember, and none to forget. */
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

/** Everything a mint config carries EXCEPT the persistence seam — the seam decides the arm (below). */
interface AutosaveEntityBoundaryConfigBase<TValues extends object> {
  readonly defaultValues: TValues;
  /** The crash-survival mirror. Omit only for genuinely ephemeral panels. */
  readonly draft?: EntityDraftStore<TValues>;
  /** @defaultValue 500 */
  readonly debounceMs?: number;
  readonly options?: Partial<Omit<AppFormOptions<TValues>, "defaultValues" | "onSubmit">>;
}

/** A config that carries the persistence seam at MINT time — the per-instance `save` prop is then an
 *  optional OVERRIDE (it still wins). */
export interface AutosaveEntityBoundaryConfigWithSave<TValues extends object> extends AutosaveEntityBoundaryConfigBase<TValues> {
  /** Persist the values (fire-and-forget from the save driver). */
  readonly save: (values: TValues) => Promise<unknown>;
}

/** A config that does NOT carry the seam — the overwhelmingly common shape, because a module-scope
 *  factory can't reach the runtime tRPC client. The returned boundary then REQUIRES a declared arm. */
export interface AutosaveEntityBoundaryConfigWithoutSave<TValues extends object> extends AutosaveEntityBoundaryConfigBase<TValues> {
  readonly save?: never;
}

/** The mint config, either arm. Its `save` PRESENCE decides the returned boundary's props (the overloads
 *  on `createAutosaveEntityForm`), which is how "the seam is declared exactly once" became a compile fact. */
export type AutosaveEntityBoundaryConfig<TValues extends object> =
  | AutosaveEntityBoundaryConfigWithSave<TValues>
  | AutosaveEntityBoundaryConfigWithoutSave<TValues>;

interface AutosaveBoundaryPropsBase<TValues extends object> {
  /** The entity under edit — keys the Session; a change is a full teardown/remount seeded from server. */
  readonly entityId: string;
  /** The server row (undefined while loading). A structural change while clean re-baselines (§5). */
  readonly serverValues: TValues | undefined;
  /** The body — a render prop given the live session (form + saveState + retrySave + reseed). */
  readonly children: (session: AutosaveSession<TValues>) => ReactNode;
}

/** Props of a boundary minted WITH `config.save`: the per-instance seam is an optional override. */
export interface AutosaveBoundaryProps<TValues extends object> extends AutosaveBoundaryPropsBase<TValues> {
  /**
   * Per-instance persist fn closing over the live tRPC client the surface holds. Wins over `config.save`.
   */
  readonly save?: (values: TValues) => Promise<unknown>;
}

/** The PERSISTING arm of a boundary minted WITHOUT `config.save`: the per-instance seam is the only one,
 *  so it is REQUIRED — a seamless mount is a type error, not a runtime lie (client-forms-01). */
export interface AutosaveBoundaryPropsPersisting<TValues extends object> extends AutosaveBoundaryPropsBase<TValues> {
  /** Per-instance persist fn closing over the live tRPC client the surface holds. */
  readonly save: (values: TValues) => Promise<unknown>;
  readonly readOnly?: never;
}

/**
 * The READ-ONLY arm: a surface that mounts this editor to DISPLAY server truth with no persistence at all
 * (the non-host member view of the chat Group / Field-overrides / Injections editors). Declaring it is
 * mandatory precisely because it used to be spelled the same way as the defect — an omitted `save`
 * (client-forms-01). Read-only is now a fact the BOUNDARY holds, not a per-field `disabled` convention the
 * next added field can forget: the save driver never arms, nothing mirrors to the crash draft, and a form
 * that is somehow dirty reads `blocked`, never "Saved".
 */
export interface AutosaveBoundaryPropsReadOnly<TValues extends object> extends AutosaveBoundaryPropsBase<TValues> {
  readonly save?: never;
  readonly readOnly: true;
}

/** The props of a boundary minted WITHOUT `config.save` — persist or explicitly read-only, no third state. */
export type AutosaveBoundaryPropsSeamRequired<TValues extends object> = AutosaveBoundaryPropsPersisting<TValues> | AutosaveBoundaryPropsReadOnly<TValues>;

/** The implementation-side widening of every public arm — what the closure component destructures. A
 *  consumer never sees it: the overloads hand out the arms above, which is where the seam law is spelled. */
export interface AutosaveBoundaryImplProps<TValues extends object> extends AutosaveBoundaryPropsBase<TValues> {
  readonly save?: ((values: TValues) => Promise<unknown>) | undefined;
  readonly readOnly?: boolean | undefined;
}

/** Structural inequality of live values vs the last-saved baseline (§3) — the ONE unsaved-edit predicate the
 *  save driver, the clean-echo reseed, and the teardown flush share. NEVER `isDefaultValue` (permanently-true
 *  after any edit was the F2 write-back vector). Module-scope so no effect ever takes it as a dependency
 *  (D54: manual memo is banned, so an in-component definition would re-arm every render). */
export function hasUnsavedEdits<TValues extends object>(values: TValues, lastSaved: TValues): boolean {
  return !formValuesEqual(values, lastSaved);
}

/** The facts the displayed lifecycle folds together — one per reason the driver's own `saveState` can be a
 *  lie about this instant. Module-scope + an interface rather than five positional booleans, because the
 *  ORDER of the fold is the law (see `foldSaveState`) and a positional call site hides it. */
interface DisplayedSaveState {
  /** The driver's own lifecycle — what the last attempted write did. */
  readonly driver: AutosaveSaveState;
  /** `form.state.isValid` — false ⇒ the driver is deliberately holding this write. */
  readonly isValid: boolean;
  /** A DECLARED read-only mount that is nonetheless dirty — a write that will never be attempted. */
  readonly readOnlyDirty: boolean;
  /** `hasUnsavedEdits(values, lastSaved)` — an edit the driver has not yet written (the debounce window). */
  readonly unsaved: boolean;
  /** `SaveUnwritableContext` — the STORED row cannot be read, so the server refuses every write derived
   *  from this form and the driver never arms (#1716). Not a failure and not a held write: a fact about
   *  the row that no edit, retry or valid field can change. */
  readonly unwritable: boolean;
}

/**
 * THE DISPLAYED LIFECYCLE — the ONE derivation of "what is true about this form's persistence right now",
 * folded at the seam rather than at each call site (the same ruling as the `blocked` arm below: one
 * derivation, every autosave surface, no editor able to forget it).
 *
 * Order is the law, strongest fact about the WRITE first:
 *  0. `unreadable` — the stored row cannot be read, so NO write from this form can ever land (#1716). It
 *     outranks `error` because it explains it: the first refused save sets `error`, whose Retry cannot
 *     succeed, and offering that retry is the defect. Above `blocked` too — a valid field does not make
 *     this form writable.
 *  1. `error` — a save genuinely failed. It owns the retry affordance and outranks everything about what
 *     is in the box now.
 *  2. `blocked` — the driver is HOLDING this write (invalid form, or a declared read-only mount that got
 *     edited). "Not saved", with the reason living on the field.
 *  3. THE UNCOMMITTED EDIT (side-eye #81 P0) — the form carries text the driver has not written yet, i.e.
 *     the debounce window. Every editor read "Saved" here, over content that lived nowhere but in the box,
 *     and a tab closed inside that window loses it in silence (see the teardown note below: a page reload
 *     never unmounts React, so nothing flushes). It reads "saving": the pane is one armed debounce away
 *     from the write, which is exactly what "Saving…" means — the ratified three-state vocabulary, no
 *     fourth state minted (D78 §6), and the same mapping the Connections pane already made by hand.
 *
 * `unsaved` is `hasUnsavedEdits` against the SESSION-PRIVATE last-saved baseline, never `form.state.isDirty`
 * — TanStack's `isDirty` is permanently true after the first edit (the F2 trap this file warns about
 * throughout), so folding THAT here would pin every editor on "Saving…" forever. The baseline is why this
 * fold cannot live at a call site: `lastSavedRef` is the Session's own, and a consumer cannot compute it.
 */
export function foldSaveState({ driver, isValid, readOnlyDirty, unsaved, unwritable }: DisplayedSaveState): AutosaveSaveState {
  if (unwritable) {
    return "unreadable";
  }
  if (driver === "error") {
    return driver;
  }
  if (!isValid || readOnlyDirty) {
    return "blocked";
  }
  return driver === "saved" && unsaved ? "saving" : driver;
}

/** Read-and-clear the Boundary's discard flag — `true` = this teardown was a reseed and skips its flush. */
export function takeDiscard(discardRef: RefObject<boolean>): boolean {
  const discard = discardRef.current;
  discardRef.current = false;
  return discard;
}

/**
 * MUST THIS TEARDOWN SKIP ITS FLUSH? Two independent reasons, folded into one predicate so the Session's
 * cleanup stays one branch (`noExcessiveCognitiveComplexity` is a real ceiling on that component):
 *
 *  • a staged reseed/discard — the pre-reseed edit is dropped, never written back (the F2 write-back vector);
 *  • an UNWRITABLE subtree (#1716) — the stored row cannot be read, so the server refuses every write
 *    derived from it. A flush there is a guaranteed 400 fired from a component that has already unmounted,
 *    with no status left to report it. The `unreadable` status was the honest disclosure while the form was
 *    on screen.
 *
 * `takeDiscard` runs FIRST and unconditionally: the flag is read-and-clear, so short-circuiting past it
 * would leave a stale discard armed for the NEXT teardown, which would then silently drop a real edit.
 */
export function skipTeardownFlush(discardRef: RefObject<boolean>, unwritableRef: RefObject<boolean>): boolean {
  const discarded = takeDiscard(discardRef);
  return discarded || unwritableRef.current;
}
