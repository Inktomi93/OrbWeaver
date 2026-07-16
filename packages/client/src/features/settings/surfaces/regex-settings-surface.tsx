// The Regex settings surface — the owner-global find/replace script library (Settings → Regex). Reads the
// synced UserSettings.regex.scripts and autosaves each change back through the `regex` section patch (the
// D53 tier: owner-global scripts run on every chat you host, beneath per-preset and per-character scripts).
// The list + editor dialog are the shared EntryListEditor + RegexEditorDialog composites; the save fn maps
// the form's `regexScripts` array onto the section's `scripts` field.

import type { RegexScript } from "@orb/contracts/regex";
import { REGEX_PLACEMENTS, SubstituteFindRegex } from "@orb/kit/regex";
import { Container, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import type { RegexScriptsFormValues } from "#components";
import { EntryListEditor, RegexEditorDialog } from "#components";
import { createEntityMutation, QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { settingsAnchorId } from "#state";
import { REGEX_SETTINGS_ENTITY_ID, useRegexSettingsForm } from "../hooks/use-regex-settings-form";
import { REGEX_SUBCATEGORY_IDS } from "../lib/regex-nav";

interface UpdateRegexVars {
  readonly section: "regex";
  readonly patch: Record<string, unknown>;
}
const useUpdateRegex = createEntityMutation<UpdateRegexVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your regex scripts.",
});

/** A fresh regex script seeded with the schema defaults (owner-global scripts run on every placement). */
function makeScript(): RegexScript {
  return {
    id: globalThis.crypto.randomUUID(),
    name: "New script",
    findRegex: "",
    replaceString: "",
    placement: [...REGEX_PLACEMENTS],
    enabled: true,
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: false,
    trimStrings: [],
    substituteRegex: SubstituteFindRegex.none,
    minDepth: null,
    maxDepth: null,
  };
}

/** The Regex panel body (rendered inside the settings modal's Dialog). */
export function RegexSettingsSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} className="outline-none" tabIndex={-1}>
      <QueryBoundary
        fallback={<Text tone="muted">Loading your regex scripts…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="your regex scripts" onRetry={retry} />}
      >
        <Container>
          <RegexSettingsForm />
        </Container>
      </QueryBoundary>
    </Stack>
  );
}

/** Suspends on the synced settings read, then binds the autosave form to the `regex` section. */
function RegexSettingsForm(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateRegex({ trpc, invalidation });
  const [editIndex, setEditIndex] = useState<number | null>(null);

  const save = (values: RegexScriptsFormValues): Promise<unknown> => update.mutateAsync({ section: "regex", patch: { scripts: values.regexScripts } });

  const { form, mountKey } = useRegexSettingsForm({
    entityId: REGEX_SETTINGS_ENTITY_ID,
    serverValues: { regexScripts: data.config.regex.scripts },
    save,
  });

  // A structural array mutation (add/remove) does NOT trip the autosave form's field-level `onChange`
  // listener — only a scalar field edit does — so the grown/shrunk `scripts` array would never persist.
  // Flush it explicitly via `handleSubmit` (exactly what the listener would have called), same as remove.
  const onAdd = (): void => {
    // Capture the PRE-push length: pushFieldValue applies synchronously (the regex-tab precedent).
    const newIndex = form.state.values.regexScripts.length;
    form.pushFieldValue("regexScripts", makeScript());
    setEditIndex(newIndex);
    void form.handleSubmit();
  };

  return (
    <Stack gap="section" id={settingsAnchorId("regex", REGEX_SUBCATEGORY_IDS.scripts)} key={mountKey}>
      <form.Subscribe selector={(state): readonly RegexScript[] => state.values.regexScripts}>
        {(scripts): ReactElement => (
          <EntryListEditor
            addLabel="Add script"
            editIndex={editIndex}
            emptyText="No scripts yet."
            getSubtitle={(script): string => (script.enabled ? "enabled" : "disabled")}
            getTitle={(script): string => (script.name === "" ? "Unnamed script" : script.name)}
            heading="Scripts"
            helperText="Owner-global find/replace rules applied to every chat you host — on top of each preset's and character's own scripts."
            items={scripts}
            onAdd={onAdd}
            onEdit={setEditIndex}
            onRemove={(index): void => {
              void form.removeFieldValue("regexScripts", index).then(() => form.handleSubmit());
            }}
            renderEditor={(index): ReactElement => <RegexEditorDialog form={form} index={index} onClose={(): void => setEditIndex(null)} />}
          />
        )}
      </form.Subscribe>
      <Text size="micro" tone="muted">
        Changes save automatically and sync across your devices.
      </Text>
    </Stack>
  );
}
