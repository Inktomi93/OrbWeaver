// The Memory settings SECTION (Phase B ① — the buried-knobs audit's #1 finding): the per-user master
// switch `UserSettings.memory.enabled` is LIVE-READ every turn (compose/chat.ts) but had NO client write
// path — memory was permanently OFF for every user unless raw-API-patched. This section is the write path.
//
// It is a settings-SECTION CONTRIBUTION (client-architecture-lockdown.md §6c / pain-point §7), NOT a pane
// in features/settings: the chat/memory subsystem OWNS it, contributing it into the chat-behavior pane via
// the settings-section seam (`SettingsSectionContribution`) assembled at the door. Reads getUserSettings
// (cache-first — a hit, the host pane already loaded it) and autosaves through
// updateUserSettingsSection("memory"), which emits settingsChanged → the USER_BUS refetches so the turn
// pipeline sees the flip on the next turn.
//
// Homed in components/ (NOT surfaces/): this is a FRAGMENT mounted INSIDE the chat-behavior pane surface —
// the settings shell owns containment + focus-on-mount, so it is not itself a surface (extracted-fragment
// precedent; client-structure + surface-a11y-focus therefore do not apply).

import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useId } from "react";
import { SettingSwitchRow } from "#components";
import { createEntityMutation, QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { useReportSaveStatus } from "#forms";
import type { SaveLifecycleState } from "#state";
import { settingsAnchorId } from "#state";
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
  const toggleId = useId();
  useReportSaveStatus(sectionId, saveStateOf(setEnabled.isPending, setEnabled.error !== null));

  return (
    <Section divider={true} heading={MEMORY_SETTINGS_SUBCATEGORY.label} id={settingsAnchorId("chat-behavior", MEMORY_SETTINGS_SUBCATEGORY.id)}>
      <Stack gap="field">
        <SettingSwitchRow
          id={toggleId}
          label="Remember earlier in long chats"
          description="When on, the assistant recalls digests of earlier messages once a chat outgrows the recent window — so it stays consistent across a long thread."
          checked={data.config.memory.enabled}
          onChange={(next): void => setEnabled.mutate({ section: "memory", patch: { enabled: next } })}
        />
      </Stack>
    </Section>
  );
}
