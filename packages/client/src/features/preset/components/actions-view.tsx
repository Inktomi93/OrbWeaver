// The ACTIONS view (preset-surface-redesign.md §3/§6) — the guided templates + the nudges, promoted to a
// TOP-LEVEL view. They are not prompt STRUCTURE; they are per-action steering prose, and burying them two
// disclosures deep inside the Prompt tab is why the owner experiences "templates and fields" as absent
// (F6). A view named for what the user is doing (configuring the ✨ actions) is the honest IA.
//
// THIS LANE MOVES, IT DOES NOT REBUILD (V2 owns §6's list/drill-in rebuild): the templates body is the
// landed `GuidedActionsSection` verbatim, and NUDGES is the two `formatStrings` editors lifted out of the
// Prompt tab's "Message delivery" collapsible, per the §3 schema→home map. `responseNudge` (G5) is the
// rebuild's, not this move's.

import type { PromptConfig } from "@orb/contracts/preset";
import { Section, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";
import { GuidedActionsSection } from "./guided-actions-section";

export interface ActionsViewProps {
  readonly form: AppFormInstance<PromptConfig>;
  /** Reveal + select a rack section — the `guided_instruction` cross-link chip's target (§16 row 19: one
   *  selection writer, the same one the rack uses). */
  readonly onSelectSection: (sectionId: string) => void;
}

export function ActionsView({ form, onSelectSection }: ActionsViewProps): ReactElement {
  return (
    <Stack gap="section">
      <Section kicker="Templates">
        <GuidedActionsSection form={form} onSelectSection={onSelectSection} />
      </Section>
      <Section kicker="Nudges">
        <form.AppField name="formatStrings.continueNudge">
          {(field): ReactElement => (
            <field.MacroField
              description="The instruction that steers a continuation (blank uses the built-in default)."
              label="Continue nudge"
              rows={3}
              suggestions={[]}
            />
          )}
        </form.AppField>
        <form.AppField name="formatStrings.impersonateNudge">
          {(field): ReactElement => (
            <field.MacroField
              description="The instruction that steers an impersonation — the model writes your next line (blank uses the built-in default)."
              label="Impersonate nudge"
              rows={3}
              suggestions={[]}
            />
          )}
        </form.AppField>
      </Section>
    </Stack>
  );
}
