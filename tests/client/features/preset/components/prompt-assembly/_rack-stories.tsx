// CT story module for THE PROMPT VIEW — the rack + its consolidated section drill-in
// (preset-surface-redesign §5.1/§5.2). A CT only mounts from a NON-test module (Spine-Testing §7).
//
// This is the REAL surface, not a harness of it: `PresetStructureTabs tab="prompt"` mounted through the
// session BOUNDARY over a save spy. That is what makes the assertions load-bearing — SELECT ≠ DRILL, the
// structural marker rule, and the pivot's missing switch are all properties of the composition, not of any
// one component, and every structural array op has to persist through the boundary's store driver (D78 §3)
// with ZERO call-site flush.
//
// The fixture deliberately mixes the three kinds: a LITERAL (full ⋯ set), a templated MARKER (no Delete,
// no Duplicate), and the PIVOT (no switch at all, no menu).

import type { AppFormInstance, AutosaveSession } from "@orb/client/forms";
import { createAutosaveEntityForm } from "@orb/client/forms";
import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Toaster, ToastProvider } from "@orb/ui/toast";
import type { ReactElement } from "react";
import { useState } from "react";
import { PresetStructureTabs } from "../../../../../../packages/client/src/features/preset/components/preset-structure-tabs";

const STORY_PRESET = castId<PresetId>("preset_delundostoryy");

// `sec_del` sits in the MIDDLE: a middle target is the only fixture that distinguishes a duplicate/insert-
// at-index from an append-to-end (identical for the tail).
const SECTIONS: PromptSection[] = [
  { type: "literal", id: "sec_a", name: "Alpha", role: "system", content: "a", enabled: true },
  { type: "literal", id: "sec_del", name: "DeleteMe", role: "system", content: "d", enabled: true },
  { type: "marker", id: "sec_mark", name: "Post-history", marker: "post_history", role: "system", enabled: true },
  { type: "marker", id: "sec_pivot", name: "Chat history", marker: "chat_history", role: "system", enabled: true },
  { type: "literal", id: "sec_z", name: "Zeta", role: "system", content: "z", enabled: true },
];

const StoryForm = createAutosaveEntityForm<PromptConfig>({ defaultValues: DEFAULT_PROMPT_CONFIG });

/** Mirrors the live section-id order + the last-saved section count so a CT can assert the mutation AND
 *  its persistence, plus the enabled flags (the drilled-header echo's convergence proof). */
function RackBody({ session, savedCount }: { readonly session: AutosaveSession<PromptConfig>; readonly savedCount: number }): ReactElement {
  const form = session.form as AppFormInstance<PromptConfig>;
  return (
    <>
      <form.Subscribe selector={(state): readonly PromptSection[] => state.values.sections}>
        {(sections): ReactElement => (
          <output>{`ids=${sections.map((s) => s.id).join(",")} savedCount=${savedCount} on=${sections.filter((s) => s.enabled).length}`}</output>
        )}
      </form.Subscribe>
      <PresetStructureTabs form={form} tab="prompt" />
    </>
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
