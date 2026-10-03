// The Memory settings SECTION (Phase B ① — the buried-knobs audit's #1 finding): the per-user master
// switch `UserSettings.memory.enabled` is LIVE-READ every turn (compose/chat.ts) but had NO client write
// path — memory was permanently OFF for every user unless raw-API-patched. This section is the write path.
//
// It is a settings-SECTION CONTRIBUTION (client-architecture-lockdown.md §6c / pain-point §7), NOT a pane
// in features/config: the chat/memory subsystem OWNS it, contributing it into the chat-behavior pane via
// the settings-section seam (`ConfigSectionContribution`) assembled at the door. Reads getUserSettings
// (cache-first — a hit, the host pane already loaded it) and autosaves through
// updateUserSettingsSection("memory"), which emits settingsChanged → the USER_BUS refetches so the turn
// pipeline sees the flip on the next turn.
//
// Homed in components/ (NOT surfaces/): this is a FRAGMENT mounted INSIDE the chat-behavior pane surface —
// the settings shell owns containment + focus-on-mount, so it is not itself a surface (extracted-fragment
// precedent; client-structure + surface-a11y-focus therefore do not apply).

import type { WorkloadId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ExternalLink, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary, SettingSwitchRow, UtilityModelDoor, useUtilityModel } from "#components";
import type { Trpc } from "#data";
import { createEntityMutation, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { useReportSaveStatus } from "#forms";
import { MEMORY_COST_SENTENCE } from "#lib";
import type { SaveLifecycleState } from "#state";
import { configAnchorId, openConfigTo } from "#state";
import { MEMORY_EXISTING_CHATS_NOTE, MEMORY_SETTINGS_SUBCATEGORY } from "../lib/memory-settings-section-nav.ts";
import { MemoryOnConfirm } from "./memory-on-confirm.tsx";

interface MemoryPatchVars {
  readonly section: "memory";
  readonly patch: { readonly enabled: boolean };
}
const useSetMemoryEnabled = createEntityMutation<MemoryPatchVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your memory settings.",
});

/** The Memory backfill over the viewer's own chats, the opt-in the turn-on confirm offers. */
const useStartMemoryBackfill = createEntityMutation<inferInput<Trpc["workloads"]["start"]>, { readonly id: WorkloadId }>({
  options: (trpc) => trpc.workloads.start.mutationOptions(),
  invalidates: (trpc) => [trpc.workloads.list.pathFilter()],
  errorToast: "Memory is on, but the backfill over your existing chats didn't start. Run Memory backfill under Jobs.",
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
  const startBackfill = useStartMemoryBackfill({ trpc, invalidation });
  const [confirmingOn, setConfirmingOn] = useState(false);
  useReportSaveStatus(sectionId, saveStateOf(setEnabled.isPending, setEnabled.error !== null));
  const enabled = data.config.memory.enabled;

  return (
    <Section divider={true} heading={MEMORY_SETTINGS_SUBCATEGORY.label} id={configAnchorId("chat-behavior", MEMORY_SETTINGS_SUBCATEGORY.id)}>
      <Stack gap="field">
        {/* TURNING IT ON ASKS FIRST; turning it off does not. On is the switch that spends: it is where the cost,
            the model that pays and the fate of existing chats are said, and where the backfill is offered. */}
        <SettingSwitchRow
          label="Remember earlier in long chats"
          description={`One switch for your account, covering every chat you host. Once a chat grows past its most recent messages, your Utility model summarizes the older parts and the assistant recalls those summaries later, so it stays consistent across a long thread. ${MEMORY_COST_SENTENCE}`}
          checked={enabled}
          onChange={(next): void => {
            if (next) {
              setConfirmingOn(true);
              return;
            }
            setEnabled.mutate({ section: "memory", patch: { enabled: false } });
          }}
        />
        <MemoryOnConfirm
          open={confirmingOn}
          onOpenChange={setConfirmingOn}
          onConfirm={async (buildExisting): Promise<void> => {
            await setEnabled.mutateAsync({ section: "memory", patch: { enabled: true } });
            if (buildExisting) {
              await startBackfill.mutateAsync({ input: { kind: "memory-backfill", params: {} }, mode: "singular" });
            }
          }}
        />
        {/* THE NOTE IS PROSE, IN THE ROW'S OWN COLUMN (side-eye 2026-08-08 P2). It shipped at the `gloss`
            voice's bare `text-micro` (10.5px, tight leading) and ran the FULL section width (~140ch), while
            the switch description one line above it — the same kind of teaching sentence — sits at
            `text-label` (13px) inside the Field's label column (~95ch). Two voices and two measures for one
            explanation, with the SMALLER type carrying the harder fact. `prose` is the sanctioned length
            modifier (it lifts the step + leading and changes nothing else), and the end padding reserves the
            same gutter the Field's control column takes, so both paragraphs break on the same column. */}
        <Stack className="pe-(--width-control-col) @max-md:pe-0" gap="field">
          <MemoryUtilityStatus enabled={enabled} />
          <Text voice="gloss" prose={true}>
            {`${MEMORY_EXISTING_CHATS_NOTE} To build every chat now, run the Memory backfill job.`}
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

/** Whether memory is actually being built, and why not: the switch can be on while the Utility model it needs is
 *  missing or stalled, which is the silent pause this line exists to name. With no Utility model ready the door to
 *  Model roles rides beside it, whatever the switch says. Silent while the Utility read settles. */
function MemoryUtilityStatus({ enabled }: { readonly enabled: boolean }): ReactElement | null {
  const utility = useUtilityModel();
  if (utility.kind === "unknown") {
    return null;
  }
  if (utility.kind === "ready") {
    return (
      <Text data-slot="memory-utility-status" prose={true} voice="gloss">
        {enabled ? `Summaries run on your Utility model, ${utility.label}.` : "Memory is off for your account, so no chat is summarized."}
      </Text>
    );
  }
  const reason = utility.kind === "unset" ? "no Utility model is set" : `your Utility model is set but not running: ${utility.cause}`;
  return (
    <Row align="center" className="flex-wrap" data-slot="memory-utility-status" gap="field">
      <Text prose={true} voice="gloss">
        {enabled ? `Summaries are paused: ${reason}.` : `Memory also needs a Utility model, and ${reason}.`}
      </Text>
      <UtilityModelDoor />
    </Row>
  );
}
