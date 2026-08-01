// The Library settings SECTION (⑪, D107): the library-list page size — its own `library` UserSettings
// section, written through updateUserSettingsSection("library") and READ by the character library surface
// (`character-library-surface.tsx` supplies it as the `createCollectionSurface` page param). It used to sit
// hardcoded inside the settings feature's appearance surface; it is a settings-SECTION CONTRIBUTION now
// (client-architecture-lockdown.md §6c), owned by the feature that CONSUMES the knob — settings hosts the
// `appearance` anchor without knowing the library exists.
//
// Homed in components/ (NOT surfaces/): a FRAGMENT mounted INSIDE the appearance pane surface, which owns
// containment + focus (the world-info-settings-section precedent; client-structure + surface-a11y-focus do
// not apply). Reads getUserSettings cache-first — the host pane already loaded it, so no extra round-trip.

import { Section } from "@orb/ui/layout";
import { NumberField } from "@orb/ui/number-field";
import { SettingRow } from "@orb/ui/setting-row";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useId } from "react";
import { createEntityMutation, QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { useReportSaveStatus } from "#forms";
import type { SaveLifecycleState } from "#state";
import { settingsAnchorId } from "#state";
import { LIBRARY_SETTINGS_SUBCATEGORY } from "../lib/library-settings-nav";

interface UpdateLibraryVars {
  readonly section: "library";
  readonly patch: { readonly pageSize: number };
}
const useUpdateLibrary = createEntityMutation<UpdateLibraryVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your library settings.",
});

const LIBRARY_PAGE_SIZE_MIN = 10;
const LIBRARY_PAGE_SIZE_MAX = 100;

/** The mutation's lifecycle as the settings save-status seam's three states (SET-SEAMS §3): a section with
 *  its own save affordance still REPORTS, so the shell's aggregate footer + the nav marker see its failure. */
function saveStateOf(isPending: boolean, errored: boolean): SaveLifecycleState {
  if (errored) {
    return "error";
  }
  return isPending ? "saving" : "saved";
}

/** The Library settings section body — mounted at the appearance pane's contributed-sections anchor. */
export function LibrarySettingsSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">Loading your library settings…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your library settings" onRetry={retry} />}
    >
      <LibraryPageSizeRow sectionId={sectionId} />
    </QueryBoundary>
  );
}

/** The rows-per-page control. A blank/out-of-range input is dropped (never a wipe-triggering write; the
 *  server re-validate + `.catch` self-heal is the true enforcement, these bound the input). */
function LibraryPageSizeRow({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateLibrary({ trpc, invalidation });
  const id = useId();
  useReportSaveStatus(sectionId, saveStateOf(update.isPending, update.error !== null));
  const onValueChange = (next: number | null): void => {
    if (next !== null && Number.isInteger(next) && next >= LIBRARY_PAGE_SIZE_MIN && next <= LIBRARY_PAGE_SIZE_MAX) {
      update.mutate({ section: "library", patch: { pageSize: next } });
    }
  };
  return (
    <Section divider={true} heading={LIBRARY_SETTINGS_SUBCATEGORY.label} id={settingsAnchorId("appearance", LIBRARY_SETTINGS_SUBCATEGORY.id)}>
      <SettingRow id={id} label="Rows per page" description="How many entries the library lists load per page as you scroll.">
        <NumberField id={id} min={LIBRARY_PAGE_SIZE_MIN} max={LIBRARY_PAGE_SIZE_MAX} value={data.config.library.pageSize} onValueChange={onValueChange} />
      </SettingRow>
    </Section>
  );
}
