// CT story module for THE PROMPT VIEW — the rack + its consolidated section drill-in
// (preset-surface-redesign §5.1/§5.2). A CT only mounts from a NON-test module (Spine-Testing §7).
//
// This is the REAL surface, not a harness of it: `PresetStructureTabs tab="prompt"` mounted through the
// session BOUNDARY over a save spy. That is what makes the assertions load-bearing — SELECT ≠ DRILL, the
// structural marker rule, and the pivot's missing switch are all properties of the composition, not of any
// one component, and every structural array op has to persist through the boundary's store driver (D78 §3)
// with ZERO call-site flush.
//
// The fixture deliberately mixes all FOUR shapes: a LITERAL (full ⋯ set), a templated MARKER (no Delete,
// no Duplicate), a plain-marker CARRIER (no inject/trigger in the schema, so no depth/order/triggers
// fields), and the PIVOT (no switch at all, no menu).

import type { AppFormInstance, AutosaveSession } from "@orb/client/forms";
import { createAutosaveEntityForm } from "@orb/client/forms";
import { closePresetSectionDrill, retargetPresetSectionDrill } from "@orb/client/state";
import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Toaster, ToastProvider } from "@orb/ui/toast";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { PresetStructureTabs } from "../../../../../../packages/client/src/features/preset/components/preset-structure-tabs.tsx";

const STORY_PRESET = castId<PresetId>("preset_delundostoryy");

/** The section drill is now STORE state, not local component state (so it survives the fork-retarget
 *  remount) — which means it also LEAKS across tests in one page. Clear it on each story mount so every test
 *  starts on the rack; the effect runs once (deps `[]`), so it never clears the drill the fork test is
 *  proving survives a keyed remount. */
function useFreshSectionDrill(): void {
  useEffect(() => {
    closePresetSectionDrill();
    return closePresetSectionDrill;
  }, []);
}

// `sec_del` sits in the MIDDLE: a middle target is the only fixture that distinguishes a duplicate/insert-
// at-index from an append-to-end (identical for the tail).
const SECTIONS: PromptSection[] = [
  { type: "literal", id: "sec_a", name: "Alpha", role: "system", content: "a", enabled: true },
  { type: "literal", id: "sec_del", name: "DeleteMe", role: "system", content: "d", enabled: true },
  { type: "marker", id: "sec_mark", name: "Post-history", marker: "post_history", role: "system", enabled: true },
  { type: "marker", id: "sec_wi", name: "World info (before)", marker: "world_info_before", role: "system", enabled: true },
  { type: "marker", id: "sec_pivot", name: "Chat history", marker: "chat_history", role: "system", enabled: true },
  { type: "literal", id: "sec_z", name: "Zeta", role: "system", content: "z", enabled: true },
];

const StoryForm = createAutosaveEntityForm<PromptConfig>({ defaultValues: DEFAULT_PROMPT_CONFIG });

/** The FORM's own `inject` state per section — the O-8 write round-trip proof. A depth field that renders
 *  its own keystrokes while writing nothing is exactly the defect ("stuck at in flow"), and only the
 *  form-side value can tell the two apart. `-` = un-spliced (in flow). */
function spliceState(sections: readonly PromptSection[]): string {
  const spliced = sections.flatMap((s) =>
    "inject" in s && s.inject !== undefined ? [`${s.id}@${String(s.inject.depth)}·${String(s.inject.order ?? "-")}`] : [],
  );
  return spliced.length === 0 ? "none" : spliced.join(",");
}

/** The FORM's own `trigger` state per section — the all-selected normalization proof (owner rider). The
 *  canonical "fires on every generation" is the ABSENT field, so a stored list of all six types (which
 *  filters nothing, and costs the cached prefix) must never be written. `-` = absent. */
function triggerState(sections: readonly PromptSection[]): string {
  const gated = sections.flatMap((s) => ("trigger" in s && s.trigger !== undefined ? [`${s.id}:${s.trigger.join("+")}`] : []));
  return gated.length === 0 ? "-" : gated.join(",");
}

/** Mirrors the live section-id order + the last-saved section count so a CT can assert the mutation AND
 *  its persistence, plus the enabled flags (the drilled-header echo's convergence proof). */
function RackBody({ session, savedCount }: { readonly session: AutosaveSession<PromptConfig>; readonly savedCount: number }): ReactElement {
  const form = session.form as AppFormInstance<PromptConfig>;
  useFreshSectionDrill();
  return (
    <>
      <form.Subscribe selector={(state): readonly PromptSection[] => state.values.sections}>
        {(sections): ReactElement => (
          <output>{`ids=${sections.map((s) => s.id).join(",")} savedCount=${savedCount} on=${sections.filter((s) => s.enabled).length} splice=${spliceState(sections)} trig=${triggerState(sections)}`}</output>
        )}
      </form.Subscribe>
      <PresetStructureTabs form={form} presetId={STORY_PRESET} tab="prompt" />
    </>
  );
}

// A SEPARATE fixture, deliberately not folded into `SECTIONS`: the rack tests assert exact id order and a
// MIDDLE delete target, so adding a section to the shared list would shift every one of them.
const MAIN_PROMPT_SECTIONS: PromptSection[] = [{ type: "marker", id: "sec_main", name: "Main prompt", marker: "main_prompt", role: "system", enabled: true }];

/** The Prompt view holding ONLY the `main_prompt` marker — the one templated marker whose factory default
 *  is a full sentence and therefore GHOSTS as a multi-line placeholder. Its own story so the drill-in can be
 *  measured against the real default without perturbing the rack fixture. */
export function MainPromptStory(): ReactElement {
  useFreshSectionDrill();
  return (
    <ToastProvider>
      <StoryForm
        entityId={STORY_PRESET}
        save={(): Promise<void> => Promise.resolve()}
        serverValues={{ ...DEFAULT_PROMPT_CONFIG, sections: [...MAIN_PROMPT_SECTIONS] }}
      >
        {(session): ReactElement => <PresetStructureTabs form={session.form as AppFormInstance<PromptConfig>} presetId={STORY_PRESET} tab="prompt" />}
      </StoryForm>
      <Toaster />
    </ToastProvider>
  );
}

const FORKED_PRESET = castId<PresetId>("preset_promptforkedxx");

// A two-literal fixture, both post-nothing (no pivot ⇒ every section is Relative — the drill body is all we
// pin here). Distinct ids from `SECTIONS` so a stray leak can never re-anchor into a rack fixture.
const FORK_SECTIONS: PromptSection[] = [
  { type: "literal", id: "sec_fork_a", name: "Prologue", role: "system", content: "a", enabled: true },
  { type: "literal", id: "sec_fork_b", name: "Epilogue", role: "system", content: "b", enabled: true },
];

/** The FORK-RETARGET seam for the PROMPT view (§5.2), isolated exactly as the Actions story isolates it: the
 *  production `PresetForm` is keyed `entityId={presetId}`, and the built-in's copy-on-write retarget swaps
 *  that id mid-edit — remounting the whole keyed session. The fork carries the SAME config (same section
 *  ids), so the drill must re-anchor onto the copy; a LOCAL drill id is lost and dumps the author on the rack.
 *
 *  The button fires the retarget PAIR production fires, in production's order — `use-preset-autosave.ts`'s
 *  `retarget` does `selectPreset(to)` (which is what swaps the surface's `presetId` prop, modelled here by
 *  the `entity` state) AND `retargetPresetSectionDrill(to)`. Both halves belong to the simulation: the drill
 *  store is SCOPED by preset, so an id swap alone is (correctly) indistinguishable from the user opening a
 *  different preset — carrying the drill is an explicit act, and this is the seam that performs it. */
export function SectionForkStory(): ReactElement {
  const [entity, setEntity] = useState<PresetId>(STORY_PRESET);
  useFreshSectionDrill();
  const forkRetarget = (): void => {
    setEntity(FORKED_PRESET);
    retargetPresetSectionDrill(FORKED_PRESET);
  };
  return (
    <ToastProvider>
      <button onClick={forkRetarget} type="button">
        simulate fork retarget
      </button>
      <output>{`entity=${entity}`}</output>
      <StoryForm entityId={entity} save={(): Promise<void> => Promise.resolve()} serverValues={{ ...DEFAULT_PROMPT_CONFIG, sections: [...FORK_SECTIONS] }}>
        {(session): ReactElement => <PresetStructureTabs form={session.form as AppFormInstance<PromptConfig>} presetId={entity} tab="prompt" />}
      </StoryForm>
      <Toaster />
    </ToastProvider>
  );
}

/** The Prompt view over a real autosave boundary. */
export function RackStory(): ReactElement {
  const [savedCount, setSavedCount] = useState(-1);
  const save = (values: PromptConfig): Promise<void> => {
    setSavedCount(values.sections.length);
    return Promise.resolve();
  };
  return (
    <ToastProvider>
      <StoryForm entityId={STORY_PRESET} save={save} serverValues={{ ...DEFAULT_PROMPT_CONFIG, sections: [...SECTIONS] }}>
        {(session): ReactElement => <RackBody savedCount={savedCount} session={session} />}
      </StoryForm>
      <Toaster />
    </ToastProvider>
  );
}
