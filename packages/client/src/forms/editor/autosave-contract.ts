// Browser/editor contract for createAutosaveEntityForm; composes state-owned draft types and the pure autosave lifecycle.

import type { ReactNode } from "react";
import type { EntityDraftStore } from "#state";
import type { AutosaveSaveState } from "../create-autosave-entity-form-model.ts";
import type { AppFormInstance, AppFormOptions } from "./use-app-form.ts";

/** The AppForm surface the session hands its body, `reset` type-removed (calling it re-baselines defaults,
 *  which on a live autosave draft is the isDirty loop `no-form-reset-in-autosave` also bans). */
export type AutosaveForm<TValues extends object> = Omit<AppFormInstance<TValues>, "reset">;

/** The per-render surface a boundary hands its render-prop body. One session = one entity epoch. */
export interface AutosaveSession<TValues extends object> {
  /** The widened AppForm surface (same as the old factory's), minus `reset` at the type level. */
  readonly form: AutosaveForm<TValues>;
  /** The DISPLAYED save lifecycle for `AutosaveStatus`, per SESSION (resets on entity switch / reseed). It
   *  is a FOLD, not the raw driver state (`foldSaveState` in the pure autosave model owns the order): an invalid form
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
