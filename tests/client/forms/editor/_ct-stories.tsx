// `_ct-stories.tsx` — the forms-mirror CT story module (docs/law/Spine-Testing.md §7: CT only mounts from a
// NON-test module). Holds the stories the sibling CTs mount: the shared `AutosaveStatus` affordance, the
// button-gated `createSavedEntityForm` draft-mirror scenarios, and the D78 session-boundary
// `createAutosaveEntityForm` regressions (CT-1..6, D78 — see the divider below).
// No <CtDataProviders> here because the form factories need no Query/tRPC — each is a pure form +
// Zustand-draft closure. The observation convention throughout: a SEPARATE sibling reads the same draft
// slot through the REACTIVE `useDraft` hook and serializes it into a testid `<output>` — reactive so an
// edit re-renders the observed DOM, sibling so a buggy self-re-render loop can't spin.
import { hashServerBaseline } from "@orb/client/forms";
import type { AutosaveSession, AutosaveStatusProps } from "@orb/client/forms/editor";
import { AutosaveStatus, createAutosaveEntityForm, createSavedEntityForm } from "@orb/client/forms/editor";
import { createEntityDraftStore } from "@orb/client/state";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { z } from "zod";

// ---------------------------------------------------------------------------------------------
// AutosaveStatusStory — drives the shared AutosaveStatus affordance (north-star §7 / D66 A4) through
// its lifecycle states, plus the caller-known pre-persistence draft arm. CT (not headless) because the ERROR-state retry is a real interactive
// affordance whose click must fire `onRetry` — a render + click contract that wants a live DOM (§7).
// The retry counter is the observation channel proving the affordance is a button, not styled text.
export function AutosaveStatusStory(): ReactElement {
  const [state, setState] = useState<AutosaveStatusProps["state"]>("saved");
  const [retries, setRetries] = useState(0);
  return (
    <div>
      <AutosaveStatus state={state} onRetry={(): void => setRetries((n) => n + 1)} />
      <output data-testid="autosave-status-retries">{retries}</output>
      <button type="button" onClick={(): void => setState("saving")}>
        set saving
      </button>
      <button type="button" onClick={(): void => setState("blocked")}>
        set blocked
      </button>
      <button type="button" onClick={(): void => setState("draft")}>
        set draft
      </button>
      <button type="button" onClick={(): void => setState("error")}>
        set error
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// SavedEntityPromoteStory — pins `promote()`'s `dontUpdateMeta: true` guarantee
// (create-saved-entity-form.ts `promote()`): a mount-time NON-USER write must change the value
// without ever flipping the form's (persistent) `isDirty` — the meta-preservation contract the
// headless `create-saved-entity-form.test.ts` pins at the raw FormApi level, exercised here
// through the REAL factory-exported `promote()` wrapper.
interface SavedStoryValues {
  readonly name: string;
  readonly avatarAssetId: string | null;
}

const usePromoteStoryForm = createSavedEntityForm<SavedStoryValues>({
  defaultValues: { name: "", avatarAssetId: null },
  save: (values): Promise<SavedStoryValues> => Promise.resolve(values),
});

export function SavedEntityPromoteStory(): ReactElement {
  const { form, promote } = usePromoteStoryForm({
    entityId: "promote-story-entity",
    serverValues: undefined,
  });
  return (
    <div>
      <form.Subscribe selector={(s): boolean => s.isDirty}>
        {(isDirty): ReactElement => <output data-testid="promote-story-is-dirty">{String(isDirty)}</output>}
      </form.Subscribe>
      <button type="button" onClick={(): void => promote("avatarAssetId", "asset_promoted")}>
        promote avatarAssetId
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// createSavedEntityForm DRAFT MIRROR stories (obligation 5, OPTIONAL — shipped 2026-07-09;
// UI-Primitives §13.4 obligation-5 doctrine). Pins the crash-survival mirror the button-gated saved
// factory gained for long-form editors (the character card editor is the founding consumer): a
// surviving draft PROMOTED after mount lights the pill HONESTLY, edits mirror (debounced) into the
// draft slot, and the slot clears on a confirmed save AND on explicit discard. CT (not the headless
// create-saved-entity-form.test.ts sibling) for the SAME reason the autosave draft stories above are
// CT — every one is a RENDER + EFFECT interaction (the promotion effect, the debounced listener, the
// reseed-clobber guard) that only reproduces with the real React scheduler + real timers (§7).

interface SavedDraftValues {
  readonly text: string;
}

const SAVED_DRAFT_ENTITY_ID = "saved-draft-entity";
// The server row the form seeds from — the draft NEVER seeds `defaultValues`, so a promoted draft must
// differ from THIS for `isDefaultValue` to flip and the pill to light.
const SAVED_DRAFT_SERVER_TEXT = "server text";
// The surviving crash draft the promotion restores over the server seed.
const SAVED_DRAFT_RESTORED_TEXT = "restored draft";

// --- Restore + reseed-guard: a store PRE-SEEDED with a surviving draft before any mount. Fresh
// browser context per test (see the autosave story header) re-runs this module → re-seeds clean. ---
const savedRestoreStore = createEntityDraftStore<SavedDraftValues>({ name: "saved-ct-restore" });
savedRestoreStore.setDraft(SAVED_DRAFT_ENTITY_ID, { text: SAVED_DRAFT_RESTORED_TEXT });

const useSavedRestoreForm = createSavedEntityForm<SavedDraftValues>({
  defaultValues: { text: "" },
  save: (values): Promise<SavedDraftValues> => Promise.resolve(values),
  draft: savedRestoreStore,
});

/** Owns the saved hook + the bound field; exposes the pill signal (`isDefaultValue`) for the test. */
function SavedRestoreFormPane({ serverValues }: { readonly serverValues: SavedDraftValues }): ReactElement {
  const { form } = useSavedRestoreForm({ entityId: SAVED_DRAFT_ENTITY_ID, serverValues });
  return (
    <div>
      <form.AppField name="text">{(field): ReactElement => <field.TextField label="Saved text" />}</form.AppField>
      {/* The save-bar pill lights on `!isDefaultValue`; a restored draft MUST flip this to false. */}
      <form.Subscribe selector={(s): boolean => s.isDefaultValue}>
        {(isDefaultValue): ReactElement => <output data-testid="saved-restore-is-default">{String(isDefaultValue)}</output>}
      </form.Subscribe>
    </div>
  );
}

/** SIBLING observer — reactive read of the same draft slot (the autosave-story convention). */
function SavedRestoreDraftObserver(): ReactElement {
  const draft = savedRestoreStore.useDraft(SAVED_DRAFT_ENTITY_ID);
  return <output data-testid="saved-restore-draft">{JSON.stringify(draft)}</output>;
}

/**
 * `serverValues` is state-held so the button hands it a FRESH object identity (identical content) — the
 * background-refetch trigger that flips `draftSeed`'s identity and RE-RUNS the promotion effect. Without
 * the `draftSeededRef` guard that re-run re-applies the ORIGINAL mount draft over the user's live edit.
 */
export function SavedDraftRestoreStory(): ReactElement {
  const [serverValues, setServerValues] = useState<SavedDraftValues>({
    text: SAVED_DRAFT_SERVER_TEXT,
  });
  return (
    <div>
      <SavedRestoreFormPane serverValues={serverValues} />
      <SavedRestoreDraftObserver />
      <button type="button" onClick={(): void => setServerValues({ text: SAVED_DRAFT_SERVER_TEXT })}>
        force host re-render
      </button>
    </div>
  );
}

// --- Mirror / clear-on-save / clear-on-discard / untouched-mints-no-draft: an EMPTY store. ---
const savedMirrorStore = createEntityDraftStore<SavedDraftValues>({ name: "saved-ct-mirror" });

const useSavedMirrorForm = createSavedEntityForm<SavedDraftValues>({
  defaultValues: { text: "" },
  // Resolves to the saved row (the re-baseline source) — onSubmit clears the mirror after it resolves.
  save: (values): Promise<SavedDraftValues> => Promise.resolve(values),
  draft: savedMirrorStore,
});

/** Owns the form + the save/discard actions (both need the hook's own surface). */
function SavedMirrorFormPane(): ReactElement {
  const { form, discard } = useSavedMirrorForm({
    entityId: SAVED_DRAFT_ENTITY_ID,
    serverValues: { text: SAVED_DRAFT_SERVER_TEXT },
  });
  return (
    <div>
      <form.AppField name="text">{(field): ReactElement => <field.TextField label="Mirror text" />}</form.AppField>
      <button type="button" onClick={(): void => void form.handleSubmit()}>
        save
      </button>
      <button type="button" onClick={(): void => discard()}>
        discard
      </button>
    </div>
  );
}

/** SIBLING observer — reactive read of the mirror slot (empty-key default `{}`). */
function SavedMirrorDraftObserver(): ReactElement {
  const draft = savedMirrorStore.useDraft(SAVED_DRAFT_ENTITY_ID);
  return <output data-testid="saved-mirror-draft">{JSON.stringify(draft)}</output>;
}

export function SavedDraftMirrorStory(): ReactElement {
  return (
    <div>
      <SavedMirrorFormPane />
      <SavedMirrorDraftObserver />
    </div>
  );
}

// --- Unmount-flush: the §6.5 draft-mirror race. The mirror listener is debounced (the factory's
// hardcoded DEFAULT_DEBOUNCE_MS = 500), and the character editor REMOUNTS on a character switch
// (`key={mountKey}`). An edit made <debounce before the switch would be DROPPED — the pending mirror
// write never fires, and the draft is lost with ZERO warning (breaking §6.5's "switching away
// mid-edit loses nothing" guarantee, the whole reason the confirm dialog was removed). The fix is a
// hook-unmount cleanup that FLUSHES the latest form values to the mirror synchronously, so a switch
// can't race the debounce. The story unmounts the WHOLE hook (as the keyed editor body does), not
// just a field — the flush lives at the hook level, not per-field. ---
const SAVED_FLUSH_ENTITY_ID = "saved-flush-entity";
const savedFlushStore = createEntityDraftStore<SavedDraftValues>({
  name: "saved-ct-unmount-flush",
});

const useSavedFlushForm = createSavedEntityForm<SavedDraftValues>({
  defaultValues: { text: "" },
  save: (values): Promise<SavedDraftValues> => Promise.resolve(values),
  draft: savedFlushStore,
});

/** Owns the saved hook + the bound field — unmounting THIS pane tears the hook down (the flush point). */
function SavedFlushFormPane(): ReactElement {
  const { form } = useSavedFlushForm({
    entityId: SAVED_FLUSH_ENTITY_ID,
    serverValues: { text: SAVED_DRAFT_SERVER_TEXT },
  });
  return <form.AppField name="text">{(field): ReactElement => <field.TextField label="Flush text" />}</form.AppField>;
}

/** SIBLING observer — reactive read of the same slot (empty-key default `{}`, the story convention). */
function SavedFlushDraftObserver(): ReactElement {
  const draft = savedFlushStore.useDraft(SAVED_FLUSH_ENTITY_ID);
  return <output data-testid="saved-flush-draft">{JSON.stringify(draft)}</output>;
}

export function SavedDraftUnmountFlushStory(): ReactElement {
  const [mounted, setMounted] = useState(true);
  return (
    <div>
      {mounted ? <SavedFlushFormPane /> : null}
      <SavedFlushDraftObserver />
      <button type="button" onClick={(): void => setMounted(false)}>
        unmount editor
      </button>
    </div>
  );
}

// =============================================================================================
// D78 SESSION-BOUNDARY stories (CT-1..6) — mount the REAL boundary
// (createAutosaveEntityForm) over a save SPY. The spy is a reactive draft-store channel (the
// established observation pattern above): each save records a monotonically-numbered entry
// `{ id: entityId, text: value.text }` under a per-call key, plus a running count — so a CT can pin
// both HOW MANY saves fired and WHICH entity/value each carried. The stories drive entityId /
// serverValues via host state and expose `reseed` through a button, exactly as a real consumer would.

interface BoundaryValues {
  readonly text: string;
}

// The spy channel — a reactive store the observer reads. `count` holds the running total; `last` holds
// the most recent {id,text}; `log` holds a joined "id=text" trail so CT-3 can assert exactly-one-save.
function createSaveSpy(name: string): {
  readonly store: ReturnType<typeof createEntityDraftStore<{ readonly value: string }>>;
  readonly record: (id: string, text: string) => void;
} {
  const store = createEntityDraftStore<{ readonly value: string }>({ name });
  let count = 0;
  const trail: string[] = [];
  return {
    store,
    record: (id, text): void => {
      count += 1;
      trail.push(`${id}=${text}`);
      store.setDraft("count", { value: String(count) });
      store.setDraft("last", { value: `${id}=${text}` });
      store.setDraft("log", { value: trail.join("|") });
    },
  };
}

// ---- CT-1 / CT-3: identity switch + teardown flush (one boundary, host-driven entityId) ------------
const switchSpy = createSaveSpy("boundary-ct-switch");
// No config.save — the per-instance save (below) closes over the live entityId, so each save is tagged
// with the entity that owned it (CT-3 asserts the flush hit the OLD entity, not the switched-to one).
const useSwitchBoundary = createAutosaveEntityForm<BoundaryValues>({
  defaultValues: { text: "" },
  debounceMs: 50,
});

function SwitchBoundaryStoryInner({ session, label }: { readonly session: AutosaveSession<BoundaryValues>; readonly label: string }): ReactElement {
  return <session.form.AppField name="text">{(field): ReactElement => <field.TextField label={label} />}</session.form.AppField>;
}

/** CT-1 identity switch + CT-3 teardown flush: a single boundary whose entityId + serverValues flip. */
export function BoundaryIdentitySwitchStory(): ReactElement {
  const [entity, setEntity] = useState<{ readonly id: string; readonly server: BoundaryValues }>({
    id: "A",
    server: { text: "alpha" },
  });
  return (
    <div>
      {useSwitchBoundary({
        entityId: entity.id,
        serverValues: entity.server,
        save: (values): Promise<void> => {
          switchSpy.record(entity.id, values.text);
          return Promise.resolve();
        },
        children: (session): ReactElement => <SwitchBoundaryStoryInner session={session} label={`${entity.id} text`} />,
      })}
      <SwitchSpyObserverFor spy={switchSpy} prefix="switch" />
      <button type="button" onClick={(): void => setEntity({ id: "B", server: { text: "beta" } })}>
        switch to B
      </button>
    </div>
  );
}

// ---- CT-2 / CT-4: reseed discards + array ops persist ---------------------------------------------
const reseedSpy = createSaveSpy("boundary-ct-reseed");
// LONG debounce: the edit must stay PENDING (never autosaved) when reseed fires, so the ONLY way a
// pre-reseed save could land is the discard-flagged teardown flush writing it back (the F2 defect CT-2
// pins). A short debounce would autosave the edit first — a legitimate save, not the write-back.
const useReseedBoundary = createAutosaveEntityForm<BoundaryValues>({
  defaultValues: { text: "" },
  debounceMs: 5000,
});

/** CT-2 reseed discards: edit → reseed(starter) → the field shows starter and no pre-reseed save lands. */
export function BoundaryReseedStory(): ReactElement {
  const sessionRef = useRef<AutosaveSession<BoundaryValues> | undefined>(undefined);
  return (
    <div>
      {useReseedBoundary({
        entityId: "reseed-entity",
        serverValues: { text: "server value" },
        save: (values): Promise<void> => {
          reseedSpy.record("reseed-entity", values.text);
          return Promise.resolve();
        },
        children: (session): ReactElement => {
          sessionRef.current = session;
          return <session.form.AppField name="text">{(field): ReactElement => <field.TextField label="Reseed text" />}</session.form.AppField>;
        },
      })}
      <SwitchSpyObserverFor spy={reseedSpy} prefix="reseed" />
      <button type="button" onClick={(): void => sessionRef.current?.reseed({ text: "starter value" })}>
        reseed to starter
      </button>
    </div>
  );
}

// ---- CT-7 / CT-8: the localStorage-brick fix -----------------------------------------------------
// A draft store PRE-SEEDED with a POISONED draft: values that mismatch the server AND a baseline hash
// that does NOT match the current server snapshot (it was begun on a different, now-stale server truth).
// The fix must DISCARD it on mount — the field heals to SERVER truth, and ZERO saves fire without any
// user input. Old behavior (draft-over-server, no gate): the field showed the stale draft as "saved".
const brickSchema = z.object({ text: z.string() });
const BRICK_ENTITY_ID = "brick-entity";
const BRICK_SERVER: BoundaryValues = { text: "server truth" };
const BRICK_POISON: BoundaryValues = { text: "STALE DRAFT (should never show)" };

// The store the boundary reads its draft from — validate + schemaVersion wired (the real consumer shape).
const brickDraftStore = createEntityDraftStore<BoundaryValues>({
  name: "boundary-ct-brick",
  schemaVersion: 1,
  validate: (v): BoundaryValues | undefined => {
    const r = brickSchema.safeParse(v);
    return r.success ? r.data : undefined;
  },
});
// Pre-seed the poison with a baseline hash for a DIFFERENT server snapshot — stale by construction.
brickDraftStore.setDraft(BRICK_ENTITY_ID, BRICK_POISON, hashServerBaseline({ text: "a totally different old server value" }));

const brickSaveSpy = createSaveSpy("boundary-ct-brick-spy");
const useBrickBoundary = createAutosaveEntityForm<BoundaryValues>({
  defaultValues: { text: "" },
  draft: brickDraftStore,
  debounceMs: 50,
});

/** CT-7/CT-8: a poisoned-draft mount heals to server truth and fires zero saves without user input. */
export function BoundaryBrickHealStory(): ReactElement {
  return (
    <div>
      {useBrickBoundary({
        entityId: BRICK_ENTITY_ID,
        serverValues: BRICK_SERVER,
        save: (values): Promise<void> => {
          brickSaveSpy.record(BRICK_ENTITY_ID, values.text);
          return Promise.resolve();
        },
        children: (session): ReactElement => (
          <session.form.AppField name="text">{(field): ReactElement => <field.TextField label="Brick text" />}</session.form.AppField>
        ),
      })}
      <SwitchSpyObserverFor spy={brickSaveSpy} prefix="brick" />
    </div>
  );
}

// ---- CT-9: a serverValues churn DURING the debounce must not drop the pending save -----------------
// The live defect (2026-08-01 owner session, Connections pane): the save driver held its debounce timer in
// the effect closure, so ANY re-subscription of that effect (its deps include the server-baseline hash)
// cleared the armed timer and never re-armed it — the edit sat unsaved forever while the status still read
// "Saved". A settings write from anywhere (busDriven refetch) or a two-device echo is enough to churn
// `serverValues`, and the form is DIRTY so the clean-echo re-baseline correctly does nothing.
const echoDropSpy = createSaveSpy("boundary-ct-echo-drop");
const EchoDropBoundary = createAutosaveEntityForm<BoundaryValues>({
  defaultValues: { text: "" },
  debounceMs: 300,
});

/** CT-9: edit → server snapshot churns mid-debounce → the pending save must still land. */
export function BoundaryEchoDuringDebounceStory(): ReactElement {
  const [server, setServer] = useState<BoundaryValues>({ text: "srv-1" });
  return (
    <div>
      <EchoDropBoundary
        entityId="echo-drop-entity"
        serverValues={server}
        save={(values): Promise<void> => {
          echoDropSpy.record("echo-drop-entity", values.text);
          return Promise.resolve();
        }}
      >
        {(session): ReactElement => (
          <session.form.AppField name="text">{(field): ReactElement => <field.TextField label="Churn text" />}</session.form.AppField>
        )}
      </EchoDropBoundary>
      <SwitchSpyObserverFor spy={echoDropSpy} prefix="echo-drop" />
      <button type="button" onClick={(): void => setServer({ text: "srv-2" })}>
        churn server snapshot
      </button>
    </div>
  );
}

// ---- CT-10: unmounting the BOUNDARY flushes the pending edit (leaving a settings pane / closing a modal)
// The teardown flush is pinned on the entity-switch path by CT-3; this is its other trigger — the whole
// boundary going away, which is what "close the settings modal mid-edit" is. Long debounce so the ONLY
// way the spy sees the edit is the flush.
const unmountSpy = createSaveSpy("boundary-ct-unmount");
const UnmountBoundary = createAutosaveEntityForm<BoundaryValues>({
  defaultValues: { text: "" },
  save: (values): Promise<void> => {
    unmountSpy.record("unmount-entity", values.text);
    return Promise.resolve();
  },
  debounceMs: 5000,
});

/** CT-10: edit → unmount the boundary → the pending save FIRED (never silently dropped). */
export function BoundaryUnmountFlushStory(): ReactElement {
  const [mounted, setMounted] = useState(true);
  return (
    <div>
      {mounted ? (
        <UnmountBoundary entityId="unmount-entity" serverValues={{ text: "server value" }}>
          {(session): ReactElement => (
            <session.form.AppField name="text">{(field): ReactElement => <field.TextField label="Unmount text" />}</session.form.AppField>
          )}
        </UnmountBoundary>
      ) : null}
      <SwitchSpyObserverFor spy={unmountSpy} prefix="unmount" />
      <button type="button" onClick={(): void => setMounted(false)}>
        unmount the pane
      </button>
    </div>
  );
}

// ---- CT-11: a mount with NO persistence seam REFUSES — the draft survives and the status says error ---
// The Codex-audit defect (client-forms-01): both seams were optional and the driver ran `await save?.()`,
// so a seamless mount re-baselined, CLEARED the crash-survival draft, and set "saved" — the UI reported
// success for a write that never happened. The seam is now a compile fact (see the .test-d sibling), so
// this story has to ERASE the props type to reach the runtime backstop at all: the path a cast or a JS
// caller could still take. What it pins is the refusal — no clearDraft, status `error`, edit retained.
const SEAMLESS_ENTITY_ID = "seamless-entity";
const seamlessDraftStore = createEntityDraftStore<BoundaryValues>({ name: "boundary-ct-seamless" });
const seamlessBoundary = createAutosaveEntityForm<BoundaryValues>({
  defaultValues: { text: "" },
  draft: seamlessDraftStore,
  debounceMs: 50,
});
// The ONE deliberate erasure, at the mount: the real component with its seam requirement removed. The
// seam is compile-REQUIRED (create-autosave-entity-form-model.ts), so the invalid mount this story exists
// to drive is unspellable in TS — the double-cast IS the probe, reproducing what a cast or a JS caller can
// still hand the boundary at runtime.
// @orb-waive no-test-fabrication(unknown): invalid-input probe — the seamless mount the compile-time seam law forbids. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
const SeamlessBoundary = seamlessBoundary as unknown as (props: {
  readonly entityId: string;
  readonly serverValues: BoundaryValues;
  readonly children: (session: AutosaveSession<BoundaryValues>) => ReactElement;
}) => ReactElement;

/** CT-11: edit a boundary that can persist nowhere → status `error`, the draft still holds the edit. */
export function BoundarySeamlessRefusalStory(): ReactElement {
  return (
    <div>
      <SeamlessBoundary entityId={SEAMLESS_ENTITY_ID} serverValues={{ text: "server value" }}>
        {(session): ReactElement => (
          <div>
            <session.form.AppField name="text">{(field): ReactElement => <field.TextField label="Seamless text" />}</session.form.AppField>
            <output data-testid="seamless-state">{session.saveState}</output>
          </div>
        )}
      </SeamlessBoundary>
      <SeamlessDraftObserver />
    </div>
  );
}

/** SIBLING observer — reactive read of the crash draft the refusal must NOT clear (story convention). */
function SeamlessDraftObserver(): ReactElement {
  const draft = seamlessDraftStore.useDraft(SEAMLESS_ENTITY_ID);
  return <output data-testid="seamless-draft">{draft.text ?? ""}</output>;
}

// ---- CT-12: the DECLARED read-only arm never reports "Saved" over an edit ---------------------------
// The member/display-only mount (chat Group tab, Field overrides, Injections rows). It is honest today
// only because every field carries `disabled={!isHost}` — a per-field convention the next added field can
// forget. With `readOnly` declared at the boundary the guarantee is structural: no save driver, no draft
// mirror, and a form that IS somehow dirty reads `blocked`. This story's field is deliberately ENABLED —
// it plays the forgotten `disabled` — so the fold is what is under test, not the field.
const READ_ONLY_ENTITY_ID = "read-only-entity";
const readOnlyDraftStore = createEntityDraftStore<BoundaryValues>({ name: "boundary-ct-read-only" });
const ReadOnlyBoundary = createAutosaveEntityForm<BoundaryValues>({
  defaultValues: { text: "" },
  draft: readOnlyDraftStore,
  debounceMs: 50,
});

/** CT-12: a declared read-only mount whose field got edited → `blocked`, never "saved"; nothing mirrored. */
export function BoundaryReadOnlyStory(): ReactElement {
  return (
    <div>
      <ReadOnlyBoundary entityId={READ_ONLY_ENTITY_ID} serverValues={{ text: "server value" }} readOnly={true}>
        {(session): ReactElement => (
          <div>
            <session.form.AppField name="text">{(field): ReactElement => <field.TextField label="Read-only text" />}</session.form.AppField>
            <output data-testid="read-only-state">{session.saveState}</output>
          </div>
        )}
      </ReadOnlyBoundary>
      <ReadOnlyDraftObserver />
    </div>
  );
}

/** SIBLING observer — a read-only mount must mirror NOTHING (it could never save what it mirrored). */
function ReadOnlyDraftObserver(): ReactElement {
  const draft = readOnlyDraftStore.useDraft(READ_ONLY_ENTITY_ID);
  return <output data-testid="read-only-draft">{draft.text ?? ""}</output>;
}

// A parameterized spy observer (the switch observer above is hard-bound to switchSpy). Distinct testids
// per prefix so multiple stories in one page context never collide.
function SwitchSpyObserverFor({ spy, prefix }: { readonly spy: ReturnType<typeof createSaveSpy>; readonly prefix: string }): ReactElement {
  const count = spy.store.useDraft("count");
  const last = spy.store.useDraft("last");
  const log = spy.store.useDraft("log");
  return (
    <div>
      <output data-testid={`${prefix}-count`}>{count.value ?? "0"}</output>
      <output data-testid={`${prefix}-last`}>{last.value ?? ""}</output>
      <output data-testid={`${prefix}-log`}>{log.value ?? ""}</output>
    </div>
  );
}

// ---- CT-4 array ops: push AND remove reach the spy with ZERO call-site flushes --------------------
interface ArrayValues {
  // Mutable (not readonly) — form-core's array helpers key on `DeepKeysOfType<T, any[]>`, and a readonly
  // array is not assignable to `any[]`, so the field path would erase to `never`.
  items: string[];
}
const arraySpy = createEntityDraftStore<{ readonly value: string }>({ name: "boundary-ct-array" });
let arraySaveCount = 0;
const useArrayBoundary = createAutosaveEntityForm<ArrayValues>({
  defaultValues: { items: [] },
  save: (values): Promise<void> => {
    arraySaveCount += 1;
    arraySpy.setDraft("state", { value: `${arraySaveCount}:${values.items.join(",")}` });
    return Promise.resolve();
  },
  debounceMs: 50,
});

/** CT-4 array ops persist with zero call-site flushes: push + remove both reach the spy via the driver. */
export function BoundaryArrayOpsStory(): ReactElement {
  const sessionRef = useRef<AutosaveSession<ArrayValues> | undefined>(undefined);
  return (
    <div>
      {useArrayBoundary({
        entityId: "array-entity",
        serverValues: { items: [] },
        children: (session): ReactElement => {
          sessionRef.current = session;
          return (
            <session.form.AppField name="items" mode="array">
              {(field): ReactElement => <output data-testid="array-live">{JSON.stringify(field.state.value)}</output>}
            </session.form.AppField>
          );
        },
      })}
      <ArraySpyObserver />
      {/* NO form.handleSubmit() anywhere — the store-subscription driver owns persistence (the §7 trap dies). */}
      <button type="button" onClick={(): void => sessionRef.current?.form.pushFieldValue("items", "one")}>
        push item
      </button>
      <button type="button" onClick={(): void => void sessionRef.current?.form.removeFieldValue("items", 0)}>
        remove item
      </button>
    </div>
  );
}

function ArraySpyObserver(): ReactElement {
  const state = arraySpy.useDraft("state");
  return <output data-testid="array-spy">{state.value ?? ""}</output>;
}

// ---- CT-5 status: fail → error+Retry → success → saved -------------------------------------------
let statusShouldFail = true;
const useStatusBoundary = createAutosaveEntityForm<BoundaryValues>({
  defaultValues: { text: "" },
  save: (): Promise<void> => (statusShouldFail ? Promise.reject(new Error("CT: forced fail")) : Promise.resolve()),
  debounceMs: 50,
});

/** CT-5 status lifecycle: renders AutosaveStatus fed by the session (the `caption` prop was deleted with
 *  the "Synced across your devices." line — #104; the readout is "Saved" / "Saving…" / the error arm). */
export function BoundaryStatusStory(): ReactElement {
  return (
    <div>
      {useStatusBoundary({
        entityId: "status-entity",
        serverValues: { text: "" },
        children: (session): ReactElement => (
          <div>
            <session.form.AppField name="text">{(field): ReactElement => <field.TextField label="Status text" />}</session.form.AppField>
            <AutosaveStatus state={session.saveState} onRetry={session.retrySave} />
            <output data-testid="status-state">{session.saveState}</output>
            <button
              type="button"
              onClick={(): void => {
                statusShouldFail = false;
              }}
            >
              make save succeed
            </button>
          </div>
        ),
      })}
    </div>
  );
}

const completionDraftStore = createEntityDraftStore<BoundaryValues>({ name: "boundary-completion-owner" });
const CompletionBoundary = createAutosaveEntityForm<BoundaryValues>({
  defaultValues: { text: "" },
  draft: completionDraftStore,
  debounceMs: 60_000,
});

export function BoundaryCompletionOwnershipStory(): ReactElement {
  const pending = useRef<Array<() => void>>([]);
  const [calls, setCalls] = useState(0);
  const save = (_values: BoundaryValues): Promise<void> =>
    new Promise<void>((resolve) => {
      pending.current.push(resolve);
      setCalls((count) => count + 1);
    });
  const draft = completionDraftStore.useDraft("completion-owner");
  return (
    <div>
      <CompletionBoundary entityId="completion-owner" serverValues={{ text: "server" }} save={save}>
        {(session): ReactElement => (
          <div>
            <session.form.AppField name="text">{(field): ReactElement => <field.TextField label="Completion text" />}</session.form.AppField>
            <button type="button" onClick={(): void => void session.form.handleSubmit()}>
              submit now
            </button>
            <output data-testid="completion-state">{session.saveState}</output>
          </div>
        )}
      </CompletionBoundary>
      <button type="button" onClick={(): void => pending.current[0]?.()}>
        resolve first
      </button>
      <button type="button" onClick={(): void => pending.current[1]?.()}>
        resolve second
      </button>
      <output data-testid="completion-calls">{calls}</output>
      <output data-testid="completion-draft">{draft.text ?? ""}</output>
    </div>
  );
}

// ---- CT-6 clean echo: serverValues change while clean re-baselines; while dirty keeps edits ---------
// LONG debounce: the CT-6 dirty case needs a local edit to STAY unsaved (hasUnsavedEdits() true) when the
// echo fires, so the echo is correctly kept out. A 50ms debounce would autosave the edit → clean → the
// echo would (correctly) re-baseline, defeating the dirty-path assertion. The clean case still works: an
// untouched form is clean regardless of debounce, so the first echo re-baselines immediately.
const useEchoBoundary = createAutosaveEntityForm<BoundaryValues>({
  defaultValues: { text: "" },
  save: (): Promise<void> => Promise.resolve(),
  debounceMs: 5000,
});

/** CT-6 clean server-echo: a fresh serverValues (changed content) re-baselines a clean form, but a dirty
 *  form keeps its edit. entityId is CONSTANT (no remount) — only serverValues changes, inside the seal. */
export function BoundaryCleanEchoStory(): ReactElement {
  const [server, setServer] = useState<BoundaryValues>({ text: "echo-1" });
  return (
    <div>
      {useEchoBoundary({
        entityId: "echo-entity",
        serverValues: server,
        children: (session): ReactElement => (
          <session.form.AppField name="text">{(field): ReactElement => <field.TextField label="Echo text" />}</session.form.AppField>
        ),
      })}
      <button type="button" onClick={(): void => setServer({ text: "echo-2" })}>
        clean echo
      </button>
      <button type="button" onClick={(): void => setServer({ text: "echo-3" })}>
        dirty echo
      </button>
    </div>
  );
}
