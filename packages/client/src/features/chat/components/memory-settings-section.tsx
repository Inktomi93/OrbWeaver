// The Memory settings SECTION (Phase B ① — the buried-knobs audit's #1 finding): the per-user master
// switch `UserSettings.memory.enabled` is LIVE-READ every turn (compose/chat.ts) but had NO client write
// path — memory was permanently OFF for every user unless raw-API-patched. This section is the write path.
//
// It is a settings-SECTION CONTRIBUTION (client-architecture-lockdown.md §6c / pain-point §7), NOT a pane
// in features/settings: the chat/memory subsystem OWNS it, contributing it into the chat-behavior pane via
// the settings-section seam (`ConfigSectionContribution`) assembled at the door. Reads getUserSettings
// (cache-first — a hit, the host pane already loaded it) and autosaves through
// updateUserSettingsSection("memory"), which emits settingsChanged → the USER_BUS refetches so the turn
// pipeline sees the flip on the next turn.
//
// Homed in components/ (NOT surfaces/): this is a FRAGMENT mounted INSIDE the chat-behavior pane surface —
// the settings shell owns containment + focus-on-mount, so it is not itself a surface (extracted-fragment
// precedent; client-structure + surface-a11y-focus therefore do not apply).

import { Button } from "@orb/ui/button";
import { ExternalLink, Icon } from "@orb/ui/icons";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary, SettingSwitchRow } from "#components";
import { createEntityMutation, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { useReportSaveStatus } from "#forms";
import type { SaveLifecycleState } from "#state";
import { configAnchorId, openConfigTo } from "#state";
import { MEMORY_SETTINGS_SUBCATEGORY } from "../lib/memory-settings-section-nav.ts";

interface MemoryPatchVars {
  readonly section: "memory";
  readonly patch: { readonly enabled: boolean };
}
const useSetMemoryEnabled = createEntityMutation<MemoryPatchVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your memory settings.",
});

/** The mutation's lifecycle as the settings save-status seam's three states (SET-SEAMS §3): a section with
 *  its own save affordance still REPORTS, so the shell's aggregate footer + the nav marker see its failure. */
function saveStateOf(isPending: boolean, errored: boolean): SaveLifecycleState {
  if (errored) {
    return "error";
  }
  return isPending ? "saving" : "saved";
}

/** The Memory section body — mounted at the chat-behavior pane's contributed-sections anchor. */
export function MemorySettingsSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading your memory settings…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your memory settings" onRetry={retry} />}
    >
      <MemorySettingsBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function MemorySettingsBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const setEnabled = useSetMemoryEnabled({ trpc, invalidation });
  useReportSaveStatus(sectionId, saveStateOf(setEnabled.isPending, setEnabled.error !== null));

  return (
    <Section divider={true} heading={MEMORY_SETTINGS_SUBCATEGORY.label} id={configAnchorId("chat-behavior", MEMORY_SETTINGS_SUBCATEGORY.id)}>
      <Stack gap="field">
        <SettingSwitchRow
          label="Remember earlier in long chats"
          description="Once a chat grows past its most recent messages, the assistant summarizes the older parts and recalls those summaries later — so it stays consistent across a long thread instead of losing the start. Summaries are built in the background as a chat grows, which spends extra model calls."
          checked={data.config.memory.enabled}
          onChange={(next): void => setEnabled.mutate({ section: "memory", patch: { enabled: next } })}
        />
        {/* THE NOTE IS PROSE, IN THE ROW'S OWN COLUMN (side-eye 2026-08-08 P2). It shipped at the `gloss`
            voice's bare `text-micro` (10.5px, tight leading) and ran the FULL section width (~140ch), while
            the switch description one line above it — the same kind of teaching sentence — sits at
            `text-label` (13px) inside the Field's label column (~95ch). Two voices and two measures for one
            explanation, with the SMALLER type carrying the harder fact ("nothing changes right away").
            `prose` is the sanctioned length modifier (it lifts the step + leading and changes nothing else),
            and the end padding reserves the same gutter the Field's control column takes, so both
            paragraphs break on the same column. */}
        <Stack className="pe-(--width-control-col) @max-md:pe-0" gap="field">
          <Text voice="gloss" prose={true}>
            Turning this on affects new activity only — it doesn't reprocess chats you've already had, so nothing changes right away. To build memory for
            existing chats, run the Memory backfill job.
          </Text>
          {/* A cross-SURFACE pointer is a DOOR, not a sentence (side-eye 2026-08-08 P3): "run it under
              Settings → Jobs" named a place the reader then had to go find by hand. The `CarrierBody`
              grammar — ghost button + external-link glyph, riding a standing shell intent — is the repo's
              existing shape for exactly this, so it is reused rather than re-invented. */}
          <Button className="self-start" intent="ghost" onClick={(): void => openConfigTo("workloads", "jobs")} size="sm" type="button">
            Go to Jobs
            <Icon icon={ExternalLink} size="xs" />
          </Button>
        </Stack>
      </Stack>
    </Section>
  );
}
