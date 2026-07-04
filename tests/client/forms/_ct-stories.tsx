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

import { createAutosaveEntityForm } from "@orb/client/forms";
import { createEntityDraftStore } from "@orb/client/state";
import type { ReactElement } from "react";
import { useState } from "react";

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
  return (
    <form.AppField name="text">
      {(field): ReactElement => <field.TextField label="Draft text" />}
    </form.AppField>
  );
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
