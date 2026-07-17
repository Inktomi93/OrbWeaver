// `_ct-stories.tsx` — the forms-mirror CT story module (core/Spine-Testing.md §7: CT only mounts
// from a NON-test module). Holds the story the sibling `create-autosave-entity-form.ct.tsx` mounts.
// Copies the client-CT convention from tests/client/data/_ct-stories.tsx; no <CtDataProviders> here
// because the autosave factory needs no Query/tRPC — it is a pure form + Zustand-draft closure.
//
// THE STORY reproduces the draft-mirror CLOBBER the seed-effect `seededRef` guard fixes
// (create-autosave-entity-form.ts ~line 112): the seed effect once used deps `[entityId, draftSeed]`
// where `draftSeed` is re-read from the store every render. After a user edit writes a new draft, a
// host re-render that hands `serverValues` a fresh object identity (the common trigger: a background
// refetch) flipped `draftSeed`'s identity, re-ran the effect, and wrote the fixed mount
// `seedRef.current` (= the SEED text) back OVER the live edit — reverting the crash-survival mirror.
//
// The story is split into TWO sibling components on purpose:
//   • <FormPane> owns the autosave hook + the bound field (its edits write the draft slot).
//   • <DraftObserver> is a SEPARATE sibling that reads the SAME slot through the REACTIVE `useDraft`
//     hook and serializes it into a testid element. Reactive (not `readDraft`) so typing re-renders
//     the observed DOM; SIBLING (not co-located with the form hook) so the buggy case can't spin —
//     co-locating `useDraft` with the seed effect would feed setDraft → self-re-render → re-read
//     draftSeed → re-run effect → setDraft into a loop. The sibling proves the same slot, no loop.
// A button bumps a counter spread into a fresh `serverValues` object each click — the clobber
// trigger (new server identity, identical content) without any network.

import type { AutosaveSaveState, AutosaveSession } from "@orb/client/forms";
import { AutosaveStatus, createAutosaveEntityBoundary, createAutosaveEntityForm, createSavedEntityForm } from "@orb/client/forms";
import { createEntityDraftStore } from "@orb/client/state";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

interface StoryValues {
  readonly text: string;
}

// The one entity under edit; also the draft-store key + the form `mountKey`.
const ENTITY_ID = "story-entity-1";
// The mount seed the buggy effect would clobber the edit back to — deliberately distinct from the
// typed edit so the assertion can tell "held the edit" from "reverted to seed".
const SEED_TEXT = "seed text";
// Short real debounce (§7 forbids fake timers) — Playwright's auto-retrying `expect` waits it out.
const STORY_DEBOUNCE_MS = 50;

// Module-scope factory calls (D54 §13.1 — stable hook/store identity across mounts). Playwright CT
// gives every test a FRESH browser context, so the module-level draft store + persist localStorage
// start clean per test (ct-data-providers.tsx header) — no reset seam needed here.
const draftStore = createEntityDraftStore<StoryValues>({ name: "autosave-ct-story" });

const useAutosaveStoryForm = createAutosaveEntityForm<StoryValues>({
  defaultValues: { text: "" },
  save: (): Promise<void> => Promise.resolve(),
  draft: draftStore,
  debounceMs: STORY_DEBOUNCE_MS,
  // An ALWAYS-INVALID form-level validator — the reproducer's load-bearing condition, not decoration.
  // The factory's onChange listener always `setDraft`s the edit, then submits ONLY `if (isValid)`.
  // With a VALID form + an instant save, that submit fires and `clearDraft`s the mirror within one
  // debounce tick — the edit never persists for the observer to see. An invalid edit mirrors but
  // never submits, so `clearDraft` never runs: exactly the state the fix's own header calls out as
  // "when it matters" (an invalid in-progress edit whose crash-survival mirror the clobber reverts).
  options: {
    validators: {
      onChange: (): string => "CT: kept invalid so the edit mirrors but never submits+clears",
    },
  },
});

/** Owns the autosave hook + the bound text field. Its keystrokes write the draft slot. */
function FormPane({ serverValues }: { readonly serverValues: StoryValues }): ReactElement {
  const { form } = useAutosaveStoryForm({ entityId: ENTITY_ID, serverValues });
  return <form.AppField name="text">{(field): ReactElement => <field.TextField label="Draft text" />}</form.AppField>;
}

/** SIBLING observer — reactive read of the SAME draft slot, serialized for the test to assert on. */
function DraftObserver(): ReactElement {
  const draft = draftStore.useDraft(ENTITY_ID);
  return <output data-testid="draft-mirror-state">{JSON.stringify(draft)}</output>;
}

/**
 * The mounted story. `serverValues` is held in state so the button replaces it with a FRESH object
 * identity (identical content) — the exact "background refetch handed a new `serverValues` ref"
 * trigger that re-ran the unguarded seed effect and clobbered the live edit back to the mount seed.
 * State-held (not a memo-on-counter) so the new-identity intent is real, not a suppressed dep.
 */
export function AutosaveDraftMirrorStory(): ReactElement {
  const [serverValues, setServerValues] = useState<StoryValues>({ text: SEED_TEXT });
  return (
    <div>
      <FormPane serverValues={serverValues} />
      <DraftObserver />
      <button type="button" onClick={(): void => setServerValues({ text: SEED_TEXT })}>
        force host re-render
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// AutosaveUnmountFlushStory — pins `listeners.onFieldUnmount` (create-autosave-entity-form.ts
// ~line 115): a field unmounting mid-debounce must FLUSH its pending edit via `handleSubmit()`,
// not wait out the (here deliberately long) debounce. The FORM instance stays mounted the whole
// time — only the individual `<form.AppField>` unmounts — so the listener fires for the right
// reason (a field tearing down), not as a side effect of the whole hook unmounting.
const UNMOUNT_FLUSH_ENTITY_ID = "unmount-flush-entity";
// Far longer than the test's assertion window — proves the FLUSH fired, not the natural debounce.
const UNMOUNT_FLUSH_DEBOUNCE_MS = 5000;
// A distinct key on the SAME store mechanism, reused purely as a "save was called" observation
// channel (not an entity draft) — avoids inventing new production plumbing for a test signal.
const UNMOUNT_FLUSH_SAVE_KEY = "unmount-flush-saved";

const unmountFlushChannel = createEntityDraftStore<StoryValues>({
  name: "autosave-ct-unmount-flush",
});

const useUnmountFlushForm = createAutosaveEntityForm<StoryValues>({
  defaultValues: { text: "" },
  save: (values): Promise<void> => {
    unmountFlushChannel.setDraft(UNMOUNT_FLUSH_SAVE_KEY, values);
    return Promise.resolve();
  },
  debounceMs: UNMOUNT_FLUSH_DEBOUNCE_MS,
});

/** Owns the form + a toggle that unmounts ONLY the field, keeping the form instance alive. */
function UnmountFlushFormPane({ serverValues }: { readonly serverValues: StoryValues }): ReactElement {
  const { form } = useUnmountFlushForm({ entityId: UNMOUNT_FLUSH_ENTITY_ID, serverValues });
  const [showField, setShowField] = useState(true);
  return (
    <div>
      {showField ? <form.AppField name="text">{(field): ReactElement => <field.TextField label="Flush text" />}</form.AppField> : null}
      <button type="button" onClick={(): void => setShowField(false)}>
        unmount field
      </button>
    </div>
  );
}

/** SIBLING observer — reactive read of the save-signal channel (empty-key default is `{}`, per the `AutosaveDraftMirrorStory` convention above). */
function UnmountFlushSavedObserver(): ReactElement {
  const saved = unmountFlushChannel.useDraft(UNMOUNT_FLUSH_SAVE_KEY);
  return <output data-testid="unmount-flush-saved-state">{JSON.stringify(saved)}</output>;
}

export function AutosaveUnmountFlushStory(): ReactElement {
  return (
    <div>
      <UnmountFlushFormPane serverValues={{ text: "" }} />
      <UnmountFlushSavedObserver />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// AutosaveFailedSaveStory — pins the F4 fix (create-autosave-entity-form.ts listeners): a REJECTING
// autosave (wire rejection / network failure) must NOT leave an unhandled promise rejection —
// form-core's `handleSubmit` RE-THROWS an onSubmit error, so the listener's `.catch(() => undefined)`
// is what swallows it. The `onSubmit` awaits `save` BEFORE `clearDraft`, so a failed save skips the
// clear and the edit SURVIVES in the mirror for retry (the caller's own errorToast surfaces it once).
const FAILED_SAVE_ENTITY_ID = "failed-save-entity";
const FAILED_SAVE_DEBOUNCE_MS = 50;
// A distinct slot used purely as a "save WAS called" observation channel (the same trick the unmount
// story uses) — proves the onChange listener actually submitted, so the reject path really ran.
const FAILED_SAVE_CALL_KEY = "failed-save-called";

const failedSaveDraftStore = createEntityDraftStore<StoryValues>({
  name: "autosave-ct-failed-save",
});
const failedSaveCallChannel = createEntityDraftStore<StoryValues>({
  name: "autosave-ct-failed-save-call",
});
// A reactive channel the module-scope `unhandledrejection` listener writes into — the observer renders
// its count so the CT can assert ZERO unhandled rejections survived the failed save. Fresh browser
// context per test (see the autosave story header) → the counter starts clean.
const rejectionCountChannel = createEntityDraftStore<StoryValues>({
  name: "autosave-ct-rejection-count",
});
let rejectionCount = 0;
globalThis.addEventListener("unhandledrejection", () => {
  rejectionCount += 1;
  rejectionCountChannel.setDraft("count", { text: String(rejectionCount) });
});

// VALID form (no always-invalid validator) so the onChange listener actually SUBMITS — the submit is
// what fires the rejecting save (the whole point: prove the rejection path is unhandled-rejection-safe).
const useFailedSaveForm = createAutosaveEntityForm<StoryValues>({
  defaultValues: { text: "" },
  save: (values): Promise<void> => {
    failedSaveCallChannel.setDraft(FAILED_SAVE_CALL_KEY, values);
    return Promise.reject(new Error("CT: simulated wire rejection"));
  },
  draft: failedSaveDraftStore,
  debounceMs: FAILED_SAVE_DEBOUNCE_MS,
});

function FailedSaveFormPane(): ReactElement {
  const { form } = useFailedSaveForm({
    entityId: FAILED_SAVE_ENTITY_ID,
    serverValues: { text: "" },
  });
  return <form.AppField name="text">{(field): ReactElement => <field.TextField label="Failing text" />}</form.AppField>;
}

/** SIBLING observers — the surviving draft slot, the save-called signal, and the rejection counter. */
function FailedSaveObservers(): ReactElement {
  const draft = failedSaveDraftStore.useDraft(FAILED_SAVE_ENTITY_ID);
  const called = failedSaveCallChannel.useDraft(FAILED_SAVE_CALL_KEY);
  const rejections = rejectionCountChannel.useDraft("count");
  return (
    <div>
      <output data-testid="failed-save-draft">{JSON.stringify(draft)}</output>
      <output data-testid="failed-save-called">{JSON.stringify(called)}</output>
      <output data-testid="failed-save-rejections">{rejections.text ?? "0"}</output>
    </div>
  );
}

export function AutosaveFailedSaveStory(): ReactElement {
  return (
    <div>
      <FailedSaveFormPane />
      <FailedSaveObservers />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// AutosaveStatusStory — drives the shared AutosaveStatus affordance (north-star §7 / D66 A4) through
// its three lifecycle states. CT (not headless) because the ERROR-state retry is a real interactive
// affordance whose click must fire `onRetry` — a render + click contract that wants a live DOM (§7).
// The retry counter is the observation channel proving the affordance is a button, not styled text.
export function AutosaveStatusStory(): ReactElement {
  const [state, setState] = useState<AutosaveSaveState>("saved");
  const [retries, setRetries] = useState(0);
  return (
    <div>
      <AutosaveStatus state={state} onRetry={(): void => setRetries((n) => n + 1)} />
      <output data-testid="autosave-status-retries">{retries}</output>
      <button type="button" onClick={(): void => setState("saving")}>
        set saving
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
// D78 SESSION-BOUNDARY stories (autosave-form-doctrine.md §10 CT-1..6) — mount the REAL boundary
// (createAutosaveEntityBoundary) over a save SPY. The spy is a reactive draft-store channel (the
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
const useSwitchBoundary = createAutosaveEntityBoundary<BoundaryValues>({
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
const useReseedBoundary = createAutosaveEntityBoundary<BoundaryValues>({
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
const useArrayBoundary = createAutosaveEntityBoundary<ArrayValues>({
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

// ---- CT-5 status: fail → error+Retry → success → saved; caption in saved only ---------------------
let statusShouldFail = true;
const useStatusBoundary = createAutosaveEntityBoundary<BoundaryValues>({
  defaultValues: { text: "" },
  save: (): Promise<void> => (statusShouldFail ? Promise.reject(new Error("CT: forced fail")) : Promise.resolve()),
  debounceMs: 50,
});

/** CT-5 status lifecycle + caption: renders AutosaveStatus fed by the session (caption in `saved` only). */
export function BoundaryStatusStory(): ReactElement {
  return (
    <div>
      {useStatusBoundary({
        entityId: "status-entity",
        serverValues: { text: "" },
        children: (session): ReactElement => (
          <div>
            <session.form.AppField name="text">{(field): ReactElement => <field.TextField label="Status text" />}</session.form.AppField>
            <AutosaveStatus state={session.saveState} onRetry={session.retrySave} caption="Synced across your devices." />
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

// ---- CT-6 clean echo: serverValues change while clean re-baselines; while dirty keeps edits ---------
// LONG debounce: the CT-6 dirty case needs a local edit to STAY unsaved (hasUnsavedEdits() true) when the
// echo fires, so the echo is correctly kept out. A 50ms debounce would autosave the edit → clean → the
// echo would (correctly) re-baseline, defeating the dirty-path assertion. The clean case still works: an
// untouched form is clean regardless of debounce, so the first echo re-baselines immediately.
const useEchoBoundary = createAutosaveEntityBoundary<BoundaryValues>({
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
